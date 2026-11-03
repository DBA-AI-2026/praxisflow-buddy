// Offline: executes real approve-user/create-user handlers with mocked guard/DB/auth. No network, no mail.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Handler = (req: Request) => Promise<Response>;
const ADMIN = "11111111-1111-1111-1111-111111111111";

function load(name: string, deps: Record<string, unknown>): Handler {
  let handler: Handler | undefined;
  const source = readFileSync(`${process.cwd()}/supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: () => "offline" } },
    createClient: vi.fn(() => { throw new Error("Unexpected client"); }),
    Resend: class { emails = { send: vi.fn(async () => ({ data: { id: "m" }, error: null })) }; },
    renderBrandedEmail: () => ({ html: "", text: "" }),
    renderBrandedButton: () => "",
    fetch: vi.fn(() => { throw new Error("Unexpected network"); }),
    ...deps,
  };
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  return handler!;
}
const post = (body: unknown) => new Request("http://offline.test", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer x" } });

type Opts = { roleInsertError?: boolean; statusUpdateError?: boolean; createError?: string; existingUsers?: unknown[] };
function fakeDb(opts: Opts = {}) {
  const audits: Record<string, unknown>[] = [];
  const roleInserts: unknown[] = [];
  const deleteUser = vi.fn(async () => ({ error: null }));
  const createUser = vi.fn(async () => opts.createError
    ? { data: null, error: { message: opts.createError } }
    : { data: { user: { id: "new-user" } }, error: null });
  const from = (t: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) c[m] = () => c;
    c.single = async () => ({ data: { id: "req", email: "neu@example.com", full_name: "Neu", status: "pending" }, error: null });
    c.maybeSingle = c.single;
    c.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    c.update = () => ({ eq: async () => ({ error: opts.statusUpdateError ? { message: "x" } : null }) });
    c.insert = async (row: Record<string, unknown>) => {
      if (t === "audit_logs") { audits.push(row); return { error: null }; }
      if (t === "user_roles") { roleInserts.push(row); return { error: opts.roleInsertError ? { message: "trigger" } : null }; }
      return { error: null };
    };
    return c;
  };
  const admin = { from, auth: { admin: { createUser, deleteUser, listUsers: async () => ({ data: { users: opts.existingUsers ?? [] } }), updateUserById: vi.fn(async () => ({ error: null })) } } };
  return { admin, audits, roleInserts, deleteUser, createUser };
}
const guard = (roles: string[], admin: unknown) => vi.fn(async (_r: Request, allowed: string[]) =>
  roles.some(r => allowed.includes(r)) ? { userId: ADMIN, email: "a@x.de", roles, admin } : new Response("Forbidden", { status: 403 }));

function approve(opts: Opts = {}, roles = ["admin"]) {
  const db = fakeDb(opts);
  const h = load("approve-user", { requireActiveRole: guard(roles, db.admin) });
  return { db, h };
}

describe("approve-user", () => {
  for (const r of ["user", "sales_partner", "sales_lead", "regional_lead", "admin"]) {
    it(`approve mit ${r} → 200 und Protokoll`, async () => {
      const { db, h } = approve();
      const res = await h(post({ requestId: "req", action: "approve", role: r }));
      expect(res.status).toBe(200);
      expect(db.roleInserts).toEqual([{ user_id: "new-user", role: r }]);
      expect(db.audits.map(a => [a.action, a.success])).toEqual([["ACCESS_REQUEST_APPROVE", true]]);
    });
  }
  it("tippgeber → 400, kein Konto", async () => {
    const { db, h } = approve();
    const res = await h(post({ requestId: "req", action: "approve", role: "tippgeber" }));
    expect(res.status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });
  it("fehlende Rolle → 400 (kein stilles sales_partner)", async () => {
    const { db, h } = approve();
    expect((await h(post({ requestId: "req", action: "approve" }))).status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });
  it("ungültige Rolle → 400", async () => {
    const { h } = approve();
    expect((await h(post({ requestId: "req", action: "approve", role: "vertragsabteilung" }))).status).toBe(400);
  });
  it("fehlende requestId wird vor der Rolle geprüft → 400 mit requestId-Fehler", async () => {
    const { h } = approve();
    const res = await h(post({ action: "approve", role: "tippgeber" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing requestId or action");
  });
  it("Rollen-Insert scheitert → Konto gelöscht, 500, Fehlprotokoll", async () => {
    const { db, h } = approve({ roleInsertError: true });
    const res = await h(post({ requestId: "req", action: "approve", role: "user" }));
    expect(res.status).toBe(500);
    expect(db.deleteUser).toHaveBeenCalledWith("new-user");
    expect(db.audits[0].success).toBe(false);
  });
  it("Statusupdate scheitert → Konto gelöscht, 500", async () => {
    const { db, h } = approve({ statusUpdateError: true });
    const res = await h(post({ requestId: "req", action: "approve", role: "user" }));
    expect(res.status).toBe(500);
    expect(db.deleteUser).toHaveBeenCalledWith("new-user");
  });
  it("createUser-Fehlertext geht nicht an den Browser", async () => {
    const { h } = approve({ createError: "GEHEIM duplicate key xyz" });
    const res = await h(post({ requestId: "req", action: "approve", role: "user" }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("GEHEIM");
  });
  it("Ablehnung wird protokolliert", async () => {
    const { db, h } = approve();
    const res = await h(post({ requestId: "req", action: "reject" }));
    expect(res.status).toBe(200);
    expect(db.audits.map(a => a.action)).toEqual(["ACCESS_REQUEST_REJECT"]);
  });
  it("Nicht-Admin → 403", async () => {
    const { h } = approve({}, ["sales_lead"]);
    expect((await h(post({ requestId: "req", action: "approve", role: "user" }))).status).toBe(403);
  });
});

function createUser(opts: Opts = {}, roles = ["admin"]) {
  const db = fakeDb(opts);
  const h = load("create-user", { requireActiveRole: guard(roles, db.admin), createClient: () => db.admin });
  return { db, h };
}

describe("create-user", () => {
  for (const r of ["sales_lead", "regional_lead", "user", "sales_partner", "tippgeber", "vertragsabteilung"]) {
    it(`${r} (ohne aktive Admin-Rolle) → 403`, async () => {
      const { db, h } = createUser({}, [r]);
      expect((await h(post({ email: "n@x.de", fullName: "N", role: "user", sendEmail: false }))).status).toBe(403);
      expect(db.createUser).not.toHaveBeenCalled();
    });
  }
  it("fehlende Rolle → 400 (kein stilles user)", async () => {
    const { db, h } = createUser();
    expect((await h(post({ email: "n@x.de", fullName: "N", sendEmail: false }))).status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });
  it("Admin, neues Konto → 200 und ROLE_GRANT protokolliert", async () => {
    const { db, h } = createUser();
    const res = await h(post({ email: "n@x.de", fullName: "N", role: "user", sendEmail: false }));
    expect(res.status).toBe(200);
    expect(db.audits.map(a => a.action)).toEqual(["ROLE_GRANT"]);
  });
});
