// Offline: executes real handlers with mocked guard/DB. No network, no live data, no mail.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const ROLES = ["admin", "sales_lead", "regional_lead", "user", "sales_partner", "tippgeber", "vertragsabteilung"];

function guardFor(callerRoles: string[], admin: unknown) {
  return vi.fn(async (_req: Request, allowed: string[]) =>
    callerRoles.some(r => allowed.includes(r))
      ? { userId: ME, email: null, roles: callerRoles, admin }
      : new Response("Forbidden", { status: 403 }));
}

function load(name: string, deps: Record<string, unknown>): Handler {
  let handler: Handler | undefined;
  const source = readFileSync(`${process.cwd()}/supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: () => "offline" } },
    createClient: vi.fn(() => { throw new Error("Unexpected client"); }),
    renderBrandedEmail: () => ({ html: "", text: "" }),
    fetch: vi.fn(() => { throw new Error("Unexpected network"); }),
    ...deps,
  };
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  return handler!;
}
const post = (body: unknown) => new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer x" } });

// Marker error thrown once the handler goes past the ownership check (i.e. allowed).
class Passed extends Error {}
function tipDb(createdBy: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.single = async () => ({ data: { id: "tip", created_by: createdBy, plz: "10115" }, error: null });
  let profileCalls = 0;
  return {
    from: (t: string) => { if (t === "profiles" && ++profileCalls >= 1) throw new Passed(); return chain; },
    rpc: vi.fn(),
  };
}
async function tipStatus(roles: string[], createdBy: string) {
  const db = tipDb(createdBy);
  const guard = guardFor(roles, db);
  const res = await load("submit-tipp-lead", { requireActiveRole: guard })(post({ tippLeadId: "tip" }));
  // handler catches Passed in its try/catch → 500; that means it went beyond the guards.
  return { status: res.status, guard };
}

describe("submit-tipp-lead: tippgeber + own tip", () => {
  it("requests exactly tippgeber", async () => {
    const { guard } = await tipStatus(["tippgeber"], ME);
    expect(guard.mock.calls[0][1]).toEqual(["tippgeber"]);
  });
  it("tippgeber with own tip is allowed (passes guards)", async () => {
    const { status } = await tipStatus(["tippgeber"], ME);
    expect(status).not.toBe(403);
    expect(status).not.toBe(401);
  });
  it("tippgeber with foreign tip → 403", async () => {
    expect((await tipStatus(["tippgeber"], OTHER)).status).toBe(403);
  });
  for (const r of ROLES.filter(r => r !== "tippgeber")) {
    it(`${r} → 403 even for own tip`, async () => {
      expect((await tipStatus([r], ME)).status).toBe(403);
    });
  }
});

function lexClient() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  return {
    auth: { getClaims: async () => ({ data: { claims: { sub: ME } }, error: null }) },
    from: vi.fn(() => chain),
  };
}
async function lexStatus(roles: string[]) {
  const client = lexClient();
  const guard = guardFor(roles, {});
  const res = await load("lexware-integration", { requireActiveRole: guard, createClient: vi.fn(() => client) })(post({ action: "get-settings" }));
  return { status: res.status, guard, client };
}

describe("lexware-integration admin-only", () => {
  it("admin allowed, guard requests exactly admin, own user_id client used", async () => {
    const { status, guard, client } = await lexStatus(["admin"]);
    expect(guard.mock.calls[0][1]).toEqual(["admin"]);
    expect(status).toBe(200);
    expect(client.from).toHaveBeenCalledWith("integration_settings");
  });
  for (const r of ROLES.filter(r => r !== "admin")) {
    it(`${r} → 403`, async () => {
      const { status, client } = await lexStatus([r]);
      expect(status).toBe(403);
      expect(client.from).not.toHaveBeenCalled();
    });
  }
});
