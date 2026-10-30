// Offline: executes real handlers (send-contract-email, send-mandate-setup,
// send-contract-confirmation) with the real canAccessContract helper and mocked
// guard/DB/mail. No network, no live data.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const ME = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const SERVICE_KEY = "offline"; // Deno.env.get() returns this for every key

const IMPORT_RE = /^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
function transpile(path: string) {
  const src = readFileSync(`${process.cwd()}/${path}`, "utf8").replace(IMPORT_RE, "").replace(/^export /gm, "");
  return ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const canAccessContract = new Function(`${transpile("supabase/functions/_shared/contractAccess.ts")}; return canAccessContract;`)();

// Guard mock mirroring requireActiveRole: 401 bad token, 403 without allowed active role.
function guardFor(callerRoles: string[], admin: unknown) {
  return vi.fn(async (req: Request, allowed: string[]) => {
    if (req.headers.get("Authorization") === "Bearer bad") return new Response("Unauthorized", { status: 401 });
    return callerRoles.some(r => allowed.includes(r))
      ? { userId: ME, email: null, roles: callerRoles, admin }
      : new Response("Forbidden", { status: 403 });
  });
}

function db(contract: Record<string, unknown>, teamError = false) {
  const rpc = vi.fn(async (_fn: string, args: { _user_id: string }) =>
    teamError ? { data: null, error: { message: "x" } } : { data: args._user_id === TEAM, error: null });
  const from = (table: string) => {
    let id: unknown;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "in", "update", "is", "order", "limit"]) chain[m] = () => chain;
    chain.eq = (_c: string, v: unknown) => { id = v; return chain; };
    chain.single = async () => ({ data: contract, error: null });
    chain.maybeSingle = async () => ({ data: table === "profiles" ? { email: `${id}@example.test` } : null, error: null });
    chain.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return chain;
  };
  return { from, rpc };
}

function load(name: string, deps: Record<string, unknown>, mail = vi.fn(async () => ({ id: "m" }))): Handler {
  let handler: Handler | undefined;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: () => SERVICE_KEY } },
    canAccessContract,
    renderBrandedEmail: () => ({ html: "", text: "" }),
    Resend: class { emails = { send: mail }; },
    fetch: vi.fn(() => { throw new Error("Unexpected network"); }),
    ...deps,
  };
  new Function(...Object.keys(bindings), transpile(`supabase/functions/${name}/index.ts`))(...Object.values(bindings));
  return handler!;
}

const post = (body: unknown, token = "user-jwt") =>
  new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } });

const ROLES = ["admin", "sales_lead", "regional_lead", "user"];

// Per function: contract fixture whose handling after the access check is observable
// without side effects, plus the status that proves "access granted".
const FUNCS = [
  { name: "send-mandate-setup", body: { contract_id: "c" }, extra: { mandate_email_sent_at: "2026-01-01" }, ok: 200, service: true },
  { name: "send-contract-confirmation", body: { contract_id: "c" }, extra: { email: null }, ok: 400, service: true },
  { name: "send-contract-email", body: { contractId: "c", pdfBase64: "x" }, extra: {}, ok: 200, service: false },
];

function run(f: typeof FUNCS[number], roles: string[], owner: { created_by?: string | null; sales_partner_id?: string | null }, opts: { token?: string; teamError?: boolean } = {}) {
  const d = db({ id: "c", ...f.extra, created_by: null, sales_partner_id: null, ...owner }, opts.teamError);
  const guard = guardFor(roles, d);
  const handler = load(f.name, { requireActiveRole: guard, createClient: vi.fn(() => d) });
  return { guard, res: handler(post(f.body, opts.token)) };
}

describe("Phase 2 Häppchen 2 — contract action guards", () => {
  for (const f of FUNCS) {
    describe(f.name, () => {
      it("uses requireActiveRole with the four internal roles", async () => {
        const { guard, res } = run(f, ["admin"], { created_by: OTHER });
        expect((await res).status).toBe(f.ok);
        expect(guard.mock.calls[0][1]).toEqual(ROLES);
      });
      for (const r of ["admin", "sales_lead"]) {
        it(`${r}: foreign contract allowed`, async () => {
          expect((await run(f, [r], { created_by: OTHER, sales_partner_id: OTHER }).res).status).toBe(f.ok);
        });
      }
      it("user: own created contract allowed", async () => {
        expect((await run(f, ["user"], { created_by: ME, sales_partner_id: OTHER }).res).status).toBe(f.ok);
      });
      it("user: Betreuer (not creator) allowed", async () => {
        expect((await run(f, ["user"], { created_by: OTHER, sales_partner_id: ME }).res).status).toBe(f.ok);
      });
      it("user: foreign contract → 403", async () => {
        expect((await run(f, ["user"], { created_by: OTHER, sales_partner_id: OTHER }).res).status).toBe(403);
      });
      it("regional_lead: team contract allowed", async () => {
        expect((await run(f, ["regional_lead"], { created_by: OTHER, sales_partner_id: TEAM }).res).status).toBe(f.ok);
      });
      it("regional_lead: foreign contract → 403", async () => {
        expect((await run(f, ["regional_lead"], { created_by: OTHER, sales_partner_id: OTHER }).res).status).toBe(403);
      });
      it("regional_lead: team lookup error → 403", async () => {
        expect((await run(f, ["regional_lead"], { sales_partner_id: TEAM }, { teamError: true }).res).status).toBe(403);
      });
      for (const r of ["sales_partner", "tippgeber"]) {
        it(`${r}: even own contract → 403`, async () => {
          expect((await run(f, [r], { created_by: ME, sales_partner_id: ME }).res).status).toBe(403);
        });
      }
      it("invalid token → 401", async () => {
        expect((await run(f, ["admin"], {}, { token: "bad" }).res).status).toBe(401);
      });
      if (f.service) {
        it("service key: allowed without role guard", async () => {
          const { guard, res } = run(f, [], { created_by: OTHER }, { token: SERVICE_KEY });
          expect((await res).status).toBe(f.ok);
          expect(guard).not.toHaveBeenCalled();
        });
        it("wrong key: falls to user path → 401", async () => {
          expect((await run(f, [], {}, { token: "bad" }).res).status).toBe(401);
        });
      }
    });
  }

  describe("send-contract-email recipient", () => {
    async function send(owner: { created_by?: string | null; sales_partner_id?: string | null }, body: Record<string, unknown>) {
      const d = db({ id: "c", created_by: null, sales_partner_id: null, ...owner });
      const mail = vi.fn(async () => ({ id: "m" }));
      const handler = load("send-contract-email", { requireActiveRole: guardFor(["admin"], d) }, mail);
      return { res: await handler(post(body)), mail };
    }
    it("contractId is required → 400", async () => {
      const { res, mail } = await send({}, { pdfBase64: "x", salesPartnerEmail: "evil@example.test" });
      expect(res.status).toBe(400);
      expect(mail).not.toHaveBeenCalled();
    });
    it("sends to Betreuer and ignores salesPartnerEmail from request", async () => {
      const { mail } = await send({ created_by: OTHER, sales_partner_id: TEAM }, { contractId: "c", pdfBase64: "x", salesPartnerEmail: "evil@example.test" });
      expect(mail.mock.calls[0][0].to).toEqual([`${TEAM}@example.test`]);
    });
    it("falls back to creator when no Betreuer", async () => {
      const { mail } = await send({ created_by: OTHER, sales_partner_id: null }, { contractId: "c", pdfBase64: "x" });
      expect(mail.mock.calls[0][0].to).toEqual([`${OTHER}@example.test`]);
    });
  });
});
