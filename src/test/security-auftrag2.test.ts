// Offline: executes real handlers (create-contract-subscription, reset-user-mfa,
// salesforce-disconnect) with the real canAccessContract helper and mocked
// guard/DB/Stripe. No network, no live data.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const ME = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

const IMPORT_RE = /^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
function transpile(path: string) {
  const src = readFileSync(`${process.cwd()}/${path}`, "utf8").replace(IMPORT_RE, "").replace(/^export /gm, "");
  return ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const canAccessContract = new Function(`${transpile("supabase/functions/_shared/contractAccess.ts")}; return canAccessContract;`)();

function guardFor(callerRoles: string[], admin: unknown) {
  return vi.fn(async (req: Request, allowed: string[]) => {
    if (!req.headers.get("Authorization")) return new Response("Unauthorized", { status: 401 });
    return callerRoles.some((r) => allowed.includes(r))
      ? { userId: ME, email: "me@example.test", roles: callerRoles, admin }
      : new Response("Forbidden", { status: 403 });
  });
}

function db(contract: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  const rpc = vi.fn(async (_fn: string, args: { _user_id: string }) => ({ data: args._user_id === TEAM, error: null }));
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is"]) chain[m] = () => chain;
    chain.update = (v: unknown) => { updates.push(v); return chain; };
    chain.insert = async () => ({ error: null });
    chain.maybeSingle = async () => ({ data: contract, error: null });
    chain.then = (r: (v: unknown) => unknown) => r({ error: null });
    return chain;
  };
  return { from, rpc, updates, auth: { admin: { mfa: { listFactors: async () => ({ data: { factors: [] }, error: null }) } } } };
}

const Stripe = class { constructor() { throw new Error("Stripe must not be reached"); } };

function load(name: string, guard: unknown): Handler {
  let handler: Handler | undefined;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: () => "offline" } },
    requireActiveRole: guard, canAccessContract, Stripe,
    fetch: vi.fn(() => { throw new Error("Unexpected network"); }),
  };
  new Function(...Object.keys(bindings), transpile(`supabase/functions/${name}/index.ts`))(...Object.values(bindings));
  return handler!;
}

const post = (body: unknown, auth = true) =>
  new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers: auth ? { Authorization: "Bearer jwt" } : {} });

// No mapped Stripe product → handler answers 200 "no_stripe_products" before Stripe: proves access granted.
const contract = (owner: Record<string, string | null>) => ({ id: "c", product_name: "Unmapped", modules: [], ...owner });

async function checkout(roles: string[], owner: Record<string, string | null>, body: unknown = { contract_id: "c" }, auth = true, row: unknown = contract(owner)) {
  const d = db(row as Record<string, unknown> | null);
  const res = await load("create-contract-subscription", guardFor(roles, d))(post(body, auth));
  return res;
}

describe("create-contract-subscription", () => {
  it("ohne Anmeldung 401", async () => expect((await checkout(["admin"], {}, { contract_id: "c" }, false)).status).toBe(401));
  for (const r of ["sales_partner", "tippgeber", "vertragsabteilung"]) {
    it(`${r} 403`, async () => expect((await checkout([r], { created_by: ME })).status).toBe(403));
  }
  it("ohne contract_id 400", async () => expect((await checkout(["admin"], {}, {})).status).toBe(400));
  it("unbekannter Vertrag 404", async () => expect((await checkout(["admin"], {}, { contract_id: "x" }, true, null)).status).toBe(404));
  for (const r of ["admin", "sales_lead"]) {
    it(`${r} fremder Vertrag erlaubt`, async () => expect((await checkout([r], { created_by: OTHER, sales_partner_id: OTHER })).status).toBe(200));
  }
  it("user eigener Vertrag erlaubt", async () => expect((await checkout(["user"], { created_by: ME })).status).toBe(200));
  it("user als Betreuer erlaubt", async () => expect((await checkout(["user"], { created_by: OTHER, sales_partner_id: ME })).status).toBe(200));
  it("user fremder Vertrag 403", async () => expect((await checkout(["user"], { created_by: OTHER, sales_partner_id: OTHER })).status).toBe(403));
  it("regional_lead Team-Vertrag erlaubt", async () => expect((await checkout(["regional_lead"], { created_by: TEAM })).status).toBe(200));
  it("regional_lead fremder Vertrag 403", async () => expect((await checkout(["regional_lead"], { created_by: OTHER })).status).toBe(403));
  it("Rücksprungadresse fest, nicht aus origin-Header", () => {
    const src = readFileSync(`${process.cwd()}/supabase/functions/create-contract-subscription/index.ts`, "utf8");
    expect(src).toContain('const APP_ORIGIN = "https://sales.hfx-honorarfuchs.de"');
    expect(src).not.toMatch(/headers\.get\(["']origin["']\)/);
  });
});

describe("reset-user-mfa / salesforce-disconnect: nur admin", () => {
  for (const name of ["reset-user-mfa", "salesforce-disconnect"]) {
    it(`${name}: admin erlaubt`, async () => {
      const d = db(null);
      const res = await load(name, guardFor(["admin"], d))(post({ targetUserId: OTHER }));
      expect(res.status).toBe(200);
    });
    it(`${name}: ohne Anmeldung 401`, async () => {
      const res = await load(name, guardFor(["admin"], db(null)))(post({ targetUserId: OTHER }, false));
      expect(res.status).toBe(401);
    });
    for (const r of ["sales_lead", "regional_lead", "user", "sales_partner", "tippgeber", "vertragsabteilung"]) {
      it(`${name}: ${r} 403, nichts geändert`, async () => {
        const d = db(null);
        const res = await load(name, guardFor([r], d))(post({ targetUserId: OTHER }));
        expect(res.status).toBe(403);
        expect(d.updates).toHaveLength(0);
      });
    }
  }
});
