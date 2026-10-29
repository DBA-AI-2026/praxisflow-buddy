// Offline regression tests: execute real handlers with no network or live data.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const root = `${process.cwd()}/supabase/functions/`;
const adminEmail = "info@hfx-honorarfuchs.de";
const leadId = "00000000-0000-0000-0000-000000000001";

function load(name: string, dependencies: Record<string, unknown> = {}, secret = "test-cron-secret"): Handler {
  let handler: Handler | undefined;
  const source = readFileSync(`${root}${name}/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: (key: string) => key === "CRON_SECRET_2" ? secret : "offline-test-value" } },
    createClient: vi.fn(() => { throw new Error("Unexpected database access"); }),
    requireActiveRole: vi.fn(async () => new Response("Denied", { status: 403 })),
    ...(name === "repair-carrier-customers" ? { corsHeaders: {} } : {}), encode: () => "offline", base64UrlEncode: () => "offline",
    ensureCarrierCustomer: vi.fn(), isGoaeProduct: () => true,
    renderBrandedEmail: (value: { bodyHtml: string; bodyText: string }) => ({ html: value.bodyHtml, text: value.bodyText }),
    Resend: class { emails = { send: vi.fn() }; },
    ...dependencies,
  };
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  if (!handler) throw new Error("Handler not registered");
  return handler;
}

function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers });
}

describe("Approved role guards", () => {
  const targets = [
    ["salesforce-auth", ["admin"]],
    ["repair-carrier-customers", ["admin"]],
    ["salesforce-auto-sync", ["admin"]],
    ["lexware-auto-sync", ["admin"]],
    ["notify-lead-assignment", ["admin", "sales_lead", "regional_lead", "user"]],
  ] as const;
  for (const [name, roles] of targets) {
    for (const status of [401, 403]) {
      it(`${name} passes through ${status} before data or mail access`, async () => {
        const denial = new Response("Denied", { status });
        const guard = vi.fn(async () => denial);
        const handler = load(name, { requireActiveRole: guard });
        expect(await handler(request())).toBe(denial);
        expect(guard.mock.calls[0]?.slice(1, 2)).toEqual([roles]);
      });
    }
  }
});

describe("CRON_SECRET_2 authorization", () => {
  for (const name of ["salesforce-auto-sync", "lexware-auto-sync"]) {
    it(`${name} accepts the nonempty correct secret without role lookup`, async () => {
      const guard = vi.fn();
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq"]) chain[method] = () => chain;
      chain.single = async () => ({ data: null, error: null });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
      const handler = load(name, { requireActiveRole: guard, createClient: () => ({ from: () => chain }) });
      expect((await handler(request({}, { "x-cron-secret": "test-cron-secret" }))).status).toBe(200);
      expect(guard).not.toHaveBeenCalled();
    });
    it(`${name} rejects wrong, empty, old-secret and anon fallback paths`, async () => {
      const guard = vi.fn(async () => new Response("Denied", { status: 401 }));
      const handler = load(name, { requireActiveRole: guard }, "");
      for (const headers of [{ "x-cron-secret": "wrong" }, { "x-cron-secret": "" }, { "x-cron-secret": "old-secret" }, { authorization: "Bearer anon" }]) {
        expect((await handler(request({ trigger: "cron" }, headers))).status).toBe(401);
      }
      expect(guard).toHaveBeenCalledTimes(4);
    });
  }
});

function notificationFixture(options: { age?: number; status?: string; claimed?: boolean; dbError?: boolean; mailError?: boolean } = {}) {
  let claimed = options.claimed ?? false;
  const row = { id: leadId, email: "stored@example.test", full_name: "Stored Name", company: "Stored Company", message: "Stored Message" };
  const updates: Record<string, unknown>[] = [];
  const send = vi.fn(async (_payload: Record<string, unknown>, _options?: Record<string, unknown>) => ({ data: { id: "offline" }, error: options.mailError ? { message: "offline failure" } : null }));
  const client = { from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gt", "lte", "is"]) chain[method] = (key: string, value: unknown) => { filters[`${method}:${key}`] = value; return chain; };
    chain.update = (value: Record<string, unknown>) => { updates.push(value); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [{ is_enabled: true }], error: null });
    chain.maybeSingle = async () => {
      if (table !== "registration_requests") throw new Error("Unexpected table");
      if (options.dbError) return { data: null, error: { message: "offline DB failure" } };
      const created = Date.now() - (options.age ?? 1000);
      const eligible = !claimed && (options.status ?? "pending") === filters["eq:status"] && row.email === filters["eq:email"] && filters["is:notification_claimed_at"] === null && created > Date.parse(String(filters["gt:created_at"])) && created <= Date.parse(String(filters["lte:created_at"]));
      if (!eligible) return { data: null, error: null };
      claimed = true;
      return { data: row, error: null };
    };
    return chain;
  } };
  const handler = load("notify-new-request", { createClient: () => client, Resend: class { emails = { send }; } });
  return { handler, send, updates };
}

describe("Public notification DB claim", () => {
  it("allows only POST apart from non-mutating OPTIONS", async () => {
    const { handler, send, updates } = notificationFixture();
    expect((await handler(new Request("http://offline.test"))).status).toBe(405);
    expect((await handler(new Request("http://offline.test", { method: "OPTIONS" }))).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
  it("normalizes lookup email and sends DB content only to the fixed admin with a stable key", async () => {
    const { handler, send } = notificationFixture();
    expect((await handler(request({ email: "  STORED@EXAMPLE.TEST  ", fullName: "Forged", company: "Forged", message: "Forged" }))).status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: [adminEmail], subject: "Neue Zugangsanfrage: Stored Name" });
    expect(send.mock.calls[0]?.[0]).toHaveProperty("text", expect.stringContaining("Stored Message"));
    expect(send.mock.calls[0]?.[1]).toEqual({ idempotencyKey: `new-access-request-${leadId}` });
  });
  it("allows at most one parallel or repeated attempt", async () => {
    const { handler, send } = notificationFixture();
    await Promise.all([handler(request({ email: "stored@example.test" })), handler(request({ email: "stored@example.test" }))]);
    await handler(request({ email: "stored@example.test" }));
    expect(send).toHaveBeenCalledOnce();
  });
  for (const [label, options] of [["15-minute-old request", { age: 15 * 60 * 1000 }], ["approved request", { status: "approved" }], ["claimed request", { claimed: true }], ["database failure", { dbError: true }]] as const) {
    it(`does not send for ${label}`, async () => {
      const { handler, send } = notificationFixture(options);
      await handler(request({ email: "stored@example.test" }));
      expect(send).not.toHaveBeenCalled();
    });
  }
  it("does not reset the claim after provider failure", async () => {
    const { handler, send, updates } = notificationFixture({ mailError: true });
    expect((await handler(request({ email: "stored@example.test" }))).status).toBe(500);
    await handler(request({ email: "stored@example.test" }));
    expect(send).toHaveBeenCalledOnce();
    expect(updates.every(value => typeof value.notification_claimed_at === "string")).toBe(true);
  });
});

it("assignment notification ignores request recipient and uses leads.assigned_to", async () => {
  const send = vi.fn(async (_payload: Record<string, unknown>) => ({ error: null }));
  const lookups: unknown[][] = [];
  const client = { from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (key: string, value: unknown) => { lookups.push([table, key, value]); return chain; };
    chain.single = async () => ({ data: { id: leadId, assigned_to: "persisted-ad", praxis_name: "Offline", plz: "12345" }, error: null });
    chain.maybeSingle = async () => ({ data: table === "profiles" ? { email: "persisted@example.test", full_name: "AD" } : { is_enabled: true }, error: null });
    return chain;
  } };
  const handler = load("notify-lead-assignment", { requireActiveRole: async () => ({ admin: client }), Resend: class { emails = { send }; } });
  expect((await handler(request({ leadId, assignedToUserId: "attacker-ad" }))).status).toBe(200);
  expect(lookups).toContainEqual(["profiles", "user_id", "persisted-ad"]);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ to: ["persisted@example.test"] });
});
describe("qodia-status-sync guard (Phase 1b)", () => {
  const passed = (s: number) => s !== 401 && s !== 403;
  it("accepts correct x-cron-secret without role lookup", async () => {
    const guard = vi.fn();
    const handler = load("qodia-status-sync", { requireActiveRole: guard });
    const res = await handler(request({}, { "x-cron-secret": "test-cron-secret" }));
    expect(passed(res.status)).toBe(true);
    expect(guard).not.toHaveBeenCalled();
  });
  it("rejects Bearer <anon> alone with 401", async () => {
    const guard = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const handler = load("qodia-status-sync", { requireActiveRole: guard });
    expect((await handler(request({}, { authorization: "Bearer offline-test-value" }))).status).toBe(401);
    expect(guard.mock.calls[0]?.slice(1, 2)).toEqual([["admin"]]);
  });
  it("rejects wrong secret with 401", async () => {
    const guard = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const handler = load("qodia-status-sync", { requireActiveRole: guard });
    expect((await handler(request({}, { "x-cron-secret": "wrong" }))).status).toBe(401);
  });
  it("user role gets 403", async () => {
    const guard = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    const handler = load("qodia-status-sync", { requireActiveRole: guard });
    expect((await handler(request({}, { authorization: "Bearer user-jwt" }))).status).toBe(403);
  });
  it("admin is accepted", async () => {
    const guard = vi.fn(async () => ({ userId: "a", email: null, roles: ["admin"], admin: {} }));
    const handler = load("qodia-status-sync", { requireActiveRole: guard });
    const res = await handler(request({}, { authorization: "Bearer admin-jwt" }));
    expect(passed(res.status)).toBe(true);
    expect(guard).toHaveBeenCalledTimes(1);
  });
});
