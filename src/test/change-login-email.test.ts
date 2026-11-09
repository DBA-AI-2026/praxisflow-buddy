// Execute the real handler offline. No deployed functions or external accounts.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
type Row = { id: string; email: string | null; hfx_customer_number: string };
const HFX = "HFX-I01070";
const OLD = "old@example.test";
const NEW = "new@example.test";
const row = (hfx = HFX, email: string | null = OLD): Row => ({ id: hfx, email, hfx_customer_number: hfx });

function setup(options: { role?: string; visible?: boolean; readError?: boolean; rows?: Row[][]; provider?: number | string; rpcFail?: boolean; logFail?: boolean } = {}) {
  const rows = options.rows ?? [[row()], [row()], [row()]];
  const sequence: string[] = [];
  const events: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (_name: string, args: { p_hfx: string; p_old: string; p_new: string }) => {
    sequence.push("rpc");
    if (options.rpcFail) return { error: { message: "offline" } };
    for (const entries of rows) for (const r of entries) if (r.hfx_customer_number === args.p_hfx && r.email === args.p_old) r.email = args.p_new;
    return { error: null };
  });
  const client = (service: boolean) => ({ rpc, from: (table: string) => {
    let hfx: string | undefined;
    let mail: string | undefined;
    const chain = {
      select: () => chain,
      eq: (_key: string, value: string) => { hfx = value; return chain; },
      ilike: (_key: string, value: string) => { mail = value; return chain; },
      insert: async (event: Record<string, unknown>) => { events.push(event); return { error: options.logFail ? {} : null }; },
      then: (resolve: (value: unknown) => unknown) => {
        sequence.push(service ? "service_read" : "rls_read");
        const index = ["leads", "contracts", "customers"].indexOf(table);
        const data = (rows[index] ?? []).filter(r => mail !== undefined ? r.email?.toLowerCase() === mail : r.hfx_customer_number === hfx);
        return Promise.resolve({ data: !service && options.visible === false ? [] : data, error: options.readError ? {} : null }).then(resolve);
      },
    }; return chain;
  } });
  const admin = client(true);
  const guard = vi.fn(async (_req: Request, allowed: string[]) => allowed.includes(options.role ?? "admin")
    ? { admin, userId: "caller", roles: [options.role ?? "admin"] } : new Response("Forbidden", { status: 403 }));
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    sequence.push("provider");
    if (options.provider === "timeout") throw new DOMException("aborted", "AbortError");
    return new Response(JSON.stringify(options.provider === "body_error" ? { success: false, error: "Rejected" } : { success: true }), { status: typeof options.provider === "number" ? options.provider : 200 });
  });
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const source = readFileSync("supabase/functions/change-login-email/index.ts", "utf8").replace(/^import[^\n]+\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", "corsHeaders", "z", "requireActiveRole", "fetch", code)(
    { env: { get: () => "offline" }, serve: (h: typeof handler) => { handler = h; } },
    () => client(false), { "Access-Control-Allow-Origin": "*" }, z, guard, fetchMock,
  );
  if (!handler) throw new Error("Handler missing");
  const run = (body = { hfx_customer_number: HFX, newEmail: NEW }, method = "POST") => handler(new Request("http://offline.test", {
    method, headers: { Authorization: "Bearer offline" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  }));
  return { run, guard, fetchMock, rpc, events, sequence, rows };
}

describe("change-login-email", () => {
  for (const role of ["admin", "sales_lead", "regional_lead", "user"]) it(`${role} allowed with visible exact HFX`, async () => {
    const s = setup({ role }); expect((await s.run()).status).toBe(200);
    expect(s.guard.mock.calls[0][1]).toEqual(["admin", "sales_lead", "regional_lead", "user"]);
  });
  for (const role of ["sales_partner", "tippgeber", "vertragsabteilung"]) it(`${role} denied without reads or provider`, async () => {
    const s = setup({ role }); expect((await s.run()).status).toBe(403); expect(s.sequence).toEqual([]);
  });
  it("RLS invisibility blocks before service reads", async () => {
    const s = setup({ visible: false }); expect((await s.run()).status).toBe(403); expect(s.sequence).toEqual(["rls_read", "rls_read", "rls_read"]); expect(s.events).toHaveLength(0);
  });
  it("RLS read error fails closed", async () => { const s = setup({ readError: true }); expect((await s.run()).status).toBe(403); expect(s.fetchMock).not.toHaveBeenCalled(); });
  for (const email of [null, "", "different@example.test"]) it(`4a rejects differing existing email ${email}`, async () => {
    const s = setup({ rows: [[row()], [row(HFX, email)], [row()]] }); expect((await s.run()).status).toBe(409); expect(s.fetchMock).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled(); expect(s.events[0].event_data).toMatchObject({ outcome: "inconsistent_emails", qodia_result: "not_called" });
  });
  it("duplicate email on another exact HFX aborts", async () => {
    const s = setup({ rows: [[row(), row(`${HFX}-01`, NEW)], [row()], [row()]] }); expect((await s.run()).status).toBe(409); expect(s.fetchMock).not.toHaveBeenCalled();
    expect(s.events[0].event_data).toMatchObject({ outcome: "duplicate_email", qodia_result: "not_called" });
  });
  it("4d: old email shared with another HFX aborts before provider", async () => {
    const s = setup({ rows: [[row()], [row(), row(`${HFX}-01`, OLD)], [row()]] });
    const r = await s.run(); expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "Die bisherige E-Mail ist auch bei einem anderen Kunden gespeichert. Bitte Admin informieren." });
    expect(s.fetchMock).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled();
    expect(s.events[0].event_data).toMatchObject({ outcome: "shared_old_email", qodia_result: "not_called" });
  });
  it("existing shared main/-01 address blocks restoration under rule 4b", async () => {
    const s = setup({ rows: [[row(HFX, NEW)], [row(HFX, NEW), row(`${HFX}-01`, OLD)], [row(HFX, NEW)]] });
    expect((await s.run({ hfx_customer_number: HFX, newEmail: OLD })).status).toBe(409);
    expect(s.fetchMock).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled();
  });
  it("same email aborts with only an audit event", async () => { const s = setup(); expect((await s.run({ hfx_customer_number: HFX, newEmail: OLD })).status).toBe(400); expect(s.fetchMock).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled(); expect(s.events[0].event_data).toMatchObject({ outcome: "unchanged_email", qodia_result: "not_called" }); });
  it("normalizes new email and reads old email from DB", async () => {
    const s = setup(); expect((await s.run({ hfx_customer_number: HFX, newEmail: ` ${NEW.toUpperCase()} ` })).status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("apply_login_email_change", { p_hfx: HFX, p_old: OLD, p_new: NEW });
    expect(s.sequence.indexOf("provider")).toBeGreaterThan(s.sequence.lastIndexOf("service_read"));
    expect(s.sequence.indexOf("rpc")).toBeGreaterThan(s.sequence.indexOf("provider"));
  });
  for (const provider of [429, 404, "body_error", "timeout"] as const) it(`provider ${provider} logs failure but never changes HFX`, async () => {
    const s = setup({ provider }); expect((await s.run()).status).toBe(provider === 429 ? 429 : 502); expect(s.rpc).not.toHaveBeenCalled(); expect(s.fetchMock).toHaveBeenCalledTimes(1); expect(s.events).toHaveLength(1);
  });
  it("RPC failure performs exactly one compensating call", async () => {
    const s = setup({ rpcFail: true }); expect((await s.run()).status).toBe(500); expect(s.fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(s.fetchMock.mock.calls[1]?.[1]?.body as string); expect(body).toEqual({ email: NEW, newEmail: OLD });
    expect(s.events[0].event_data).toMatchObject({ outcome: "database_failed", rollback_result: "success" });
  });
  it("lead without customer has valid lead event", async () => { const s = setup({ rows: [[row()], [], []] }); expect((await s.run()).status).toBe(200); expect(s.events[0]).toMatchObject({ entity_type: "lead", lead_id: HFX, contract_id: null }); });
  it("-NN changes only exact location contract, never main or siblings", async () => {
    const s = setup({ rows: [[row()], [row(), row(`${HFX}-01`), row(`${HFX}-02`)], [row()]] });
    expect((await s.run({ hfx_customer_number: `${HFX}-02`, newEmail: NEW })).status).toBe(200);
    expect(s.rows[1].map(r => r.email)).toEqual([OLD, OLD, NEW]); expect(s.rows[0][0].email).toBe(OLD); expect(s.rows[2][0].email).toBe(OLD);
    expect(s.events[0]).toMatchObject({ entity_type: "contract", contract_id: `${HFX}-02`, lead_id: null });
  });
  it("customer-only cannot improvise event entity", async () => { const s = setup({ rows: [[], [], [row()]] }); expect((await s.run()).status).toBe(409); expect(s.fetchMock).not.toHaveBeenCalled(); });
  it("log failure is visible and reports completed email change", async () => { const s = setup({ logFail: true }); const r = await s.run(); expect(r.status).toBe(500); expect(await r.json()).toMatchObject({ changed: true }); });
  it("OPTIONS has CORS and no guard or side effects", async () => { const s = setup(); const r = await s.run(undefined, "OPTIONS"); expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*"); expect(s.guard).not.toHaveBeenCalled(); });
});