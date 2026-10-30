// Offline: executes real handlers with mocked guard/DB. No network, no live data.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const ME = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

// Guard mock mirroring requireActiveRole: 403 unless caller has an allowed active role.
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
    isStandortHfx: () => true,
    renderBrandedEmail: () => ({ html: "", text: "" }),
    Resend: class { emails = { send: vi.fn(() => { throw new Error("Unexpected mail"); }) }; },
    fetch: vi.fn(() => { throw new Error("Unexpected network"); }),
    ...deps,
  };
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  return handler!;
}

const post = (body: unknown) => new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer x" } });

function leadDb(assignedTo: string | null) {
  const rpc = vi.fn(async (_fn: string, args: { _user_id: string }) => ({ data: args._user_id === TEAM, error: null }));
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.single = async () => ({ data: { id: "lead", hfx_customer_number: "HFX-I09999", email: "t@example.test", qodia_synced: true, assigned_to: assignedTo }, error: null });
  return { from: () => chain, rpc };
}

async function syncStatus(roles: string[], assignedTo: string | null) {
  const db = leadDb(assignedTo);
  const guard = guardFor(roles, db);
  const res = await load("sync-lead-qodia", { requireActiveRole: guard })(post({ leadId: "lead" }));
  return { status: res.status, guard };
}

describe("sync-lead-qodia role + responsibility", () => {
  it("requests exactly admin, sales_lead, regional_lead, user", async () => {
    const { guard } = await syncStatus(["admin"], OTHER);
    expect(guard.mock.calls[0][1]).toEqual(["admin", "sales_lead", "regional_lead", "user"]);
  });
  it("admin and sales_lead may sync any lead", async () => {
    expect((await syncStatus(["admin"], OTHER)).status).toBe(200);
    expect((await syncStatus(["sales_lead"], OTHER)).status).toBe(200);
    expect((await syncStatus(["sales_lead"], null)).status).toBe(200);
  });
  it("user: own lead allowed, foreign or unassigned lead 403", async () => {
    expect((await syncStatus(["user"], ME)).status).toBe(200);
    expect((await syncStatus(["user"], OTHER)).status).toBe(403);
    expect((await syncStatus(["user"], null)).status).toBe(403);
  });
  it("regional_lead: own and team allowed, other 403", async () => {
    expect((await syncStatus(["regional_lead"], ME)).status).toBe(200);
    expect((await syncStatus(["regional_lead"], TEAM)).status).toBe(200);
    expect((await syncStatus(["regional_lead"], OTHER)).status).toBe(403);
  });
  it("sales_partner and tippgeber are rejected with 403 even for own lead", async () => {
    expect((await syncStatus(["sales_partner"], ME)).status).toBe(403);
    expect((await syncStatus(["tippgeber"], ME)).status).toBe(403);
  });
});

describe("Standort functions admin-only", () => {
  for (const name of ["register-standort-qodia", "send-standort-credentials"]) {
    it(`${name}: admin passes guard (reaches input validation)`, async () => {
      const guard = guardFor(["admin"], {});
      const res = await load(name, { requireActiveRole: guard })(post({}));
      expect(guard.mock.calls[0][1]).toEqual(["admin"]);
      expect(res.status).toBe(400);
    });
    for (const role of ["sales_lead", "regional_lead", "user", "sales_partner", "tippgeber"]) {
      it(`${name}: ${role} gets 403`, async () => {
        const res = await load(name, { requireActiveRole: guardFor([role], {}) })(post({ contractId: "c" }));
        expect(res.status).toBe(403);
      });
    }
  }
});
