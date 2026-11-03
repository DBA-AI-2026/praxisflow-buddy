// Offline: executes the real capture-lead handler with mocked DB, auth, Qodia,
// Resend and Salesforce. No network, no live data, no lead is created anywhere.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { bodyTargetIds, decideAssignment } from "../../supabase/functions/capture-lead/assignmentPolicy";

type Handler = (req: Request) => Promise<Response>;
const IMPORT_RE = /^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
const SRC = readFileSync(`${process.cwd()}/supabase/functions/capture-lead/index.ts`, "utf8");
const JS = ts.transpileModule(SRC.replace(IMPORT_RE, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type Lead = Record<string, unknown>;
interface World {
  existing: Lead | null;
  rateHour: number;
  rateDay: number;
  qodiaStatus: number | "throw";
  user: { id: string } | null;
  roles: string[];
}

function setup(w: World) {
  const inserts: Record<string, unknown[]> = {};
  const updates: { table: string; v: Record<string, unknown> }[] = [];
  const mails: { to: string[]; subject: string; html: string; text: string }[] = [];
  const logs: string[] = [];

  const from = (table: string) => {
    let isCount = false;
    let gteVal: string | null = null;
    const chain: Record<string, any> = {};
    chain.select = (_c: string, opts?: { count?: string }) => { if (opts?.count) isCount = true; return chain; };
    for (const m of ["eq", "order", "limit", "in", "lt"]) chain[m] = () => chain;
    chain.gte = (_c: string, v: string) => { gteVal = v; return chain; };
    chain.insert = (v: unknown) => { (inserts[table] ||= []).push(v); return chain; };
    chain.upsert = (v: unknown) => { (inserts[table] ||= []).push(v); return chain; };
    chain.update = (v: Record<string, unknown>) => { updates.push({ table, v }); return chain; };
    chain.delete = () => chain;
    chain.single = async () => ({ data: { id: "lead-new", hfx_customer_number: "HFX-I09999" }, error: null });
    chain.maybeSingle = async () => {
      if (table === "leads") return { data: w.existing, error: null };
      if (table === "profiles") return { data: { full_name: "AD Test", email: "ad@example.test" }, error: null };
      return { data: null, error: null };
    };
    chain.then = (r: (v: unknown) => unknown) => {
      if (isCount) {
        const hourWindow = gteVal && Date.now() - new Date(gteVal).getTime() < 2 * 3600 * 1000;
        return r({ count: hourWindow ? w.rateHour : w.rateDay, error: null });
      }
      if (table === "user_roles") return r({ data: w.roles.map((role) => ({ role, user_id: w.user?.id })), error: null });
      return r({ data: null, error: null });
    };
    return chain;
  };
  const rpc = vi.fn(async () => ({ data: [{ gebietsleiter_id: "ad-1", gebietsleiter_name: "AD Test", matched_rule: "prefix:1" }], error: null }));
  const client = { from, rpc, auth: { getUser: async () => ({ data: { user: w.user } }) } };

  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("qodia")) {
      if (w.qodiaStatus === "throw") throw new Error("network");
      return new Response("x", { status: w.qodiaStatus });
    }
    throw new Error(`Unexpected network: ${url}`);
  });

  let handler: Handler | undefined;
  const bindings = {
    Deno: { serve: (fn: Handler) => { handler = fn; }, env: { get: (k: string) => (k === "RESEND_API_KEY" ? "re_test" : "offline") } },
    createClient: () => client,
    Resend: class { emails = { send: async (m: any) => { mails.push(m); return { data: { id: "m" }, error: null }; } }; },
    renderBrandedEmail: ({ bodyHtml, bodyText, subheadline }: any) => ({ html: `${subheadline}\n${bodyHtml}`, text: bodyText }),
    isStandortHfx: () => false,
    bodyTargetIds, decideAssignment,
    fetch: fetchMock,
    AbortSignal: { timeout: () => undefined }, // test env (jsdom) lacks AbortSignal.timeout; Deno has it
    console: { ...console, log: (...a: unknown[]) => logs.push(a.map(String).join(" ")), error: (...a: unknown[]) => logs.push(a.map(String).join(" ")) },
  };
  new Function(...Object.keys(bindings), JS)(...Object.values(bindings));
  return { handler: handler!, inserts, updates, mails, logs, fetchMock };
}

const BODY = {
  praxis_name: "Praxis Test", vorname: "Erika", nachname: "Muster", email: "Erika@Example.test",
  plz: "12345", mobilnummer: "0170", abrechnungszentrum: "nein",
};
const post = (body: unknown, auth = false) =>
  new Request("http://offline.test", {
    method: "POST", body: JSON.stringify(body),
    headers: { "x-forwarded-for": "203.0.113.7", ...(auth ? { authorization: "Bearer jwt" } : {}) },
  });
const base = (o: Partial<World> = {}): World => ({ existing: null, rateHour: 0, rateDay: 0, qodiaStatus: 200, user: null, roles: [], ...o });

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-11-03T12:00:00Z")));
afterEach(() => vi.useRealTimers());

describe("capture-lead: Qodia zuerst, Mail danach", () => {
  it("Qodia ok → Zugangsmail mit Passwort, Antwort unverändert", async () => {
    const t = setup(base());
    const res = await t.handler(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, hfx_customer_number: "HFX-I09999", message: "Ihre Anfrage wurde erfolgreich übermittelt." });
    const welcome = t.mails.find((m) => m.subject === "Danke für Ihr Interesse am HFX Honorarfuchs!");
    expect(welcome).toBeDefined();
    expect(welcome!.text).toMatch(/Passwort: \S{12}/);
    const qodiaCall = t.fetchMock.mock.invocationCallOrder[0];
    expect(qodiaCall).toBeDefined();
    expect(t.updates.some((u) => u.v.credentials_sent_at)).toBe(true);
  });

  for (const [label, status] of [["Fehler 500", 500], ["Konflikt 409", 409], ["Netzwerkfehler", "throw"]] as const) {
    it(`Qodia ${label} → keine Mail an Interessent, Lead markiert, AD gewarnt`, async () => {
      const t = setup(base({ qodiaStatus: status }));
      const res = await t.handler(post(BODY));
      expect(res.status).toBe(200);
      expect(t.mails.some((m) => m.to.includes("erika@example.test") || m.to.includes("Erika@Example.test"))).toBe(false);
      const mark = t.updates.find((u) => u.table === "leads" && "qodia_signup_error" in u.v);
      expect(mark?.v.qodia_synced).toBe(false);
      expect(mark?.v.qodia_signup_error).toBeTruthy();
      if (status === 409) expect(mark?.v.qodia_conflict).toBe(true);
      expect((t.inserts.customer_events as any[])?.[0]?.event_type).toBe("QODIA_SIGNUP_FAILED");
      const ad = t.mails.find((m) => m.to.includes("ad@example.test"))!;
      expect(ad.subject).toContain("– Zugang nicht angelegt");
      expect(ad.text).toContain("Der Interessent hat deshalb KEINE Zugangsdaten erhalten.");
      expect(ad.text).not.toContain("Nächster Schritt");
      expect(ad.text.includes("bei Qodia bereits vergeben")).toBe(status === 409);
    });
  }

  it("Qodia ok → AD-Mail ohne Warnung", async () => {
    const t = setup(base());
    await t.handler(post(BODY));
    const ad = t.mails.find((m) => m.to.includes("ad@example.test"))!;
    expect(ad.subject).not.toContain("Zugang nicht angelegt");
    expect(ad.text).toContain("Nächster Schritt");
  });
});

describe("capture-lead: erneuter Versand", () => {
  const existing = (sentAt: string | null): Lead => ({
    id: "lead-old", hfx_customer_number: "HFX-I01000", praxis_name: "P", vorname: "E", nachname: "M",
    registration_attempts: 1, credentials_sent_at: sentAt,
  });
  const dupBody = { success: true, duplicate: true, hfx_customer_number: "HFX-I01000", message: "Ein Konto mit dieser E-Mail-Adresse existiert bereits. Ihre Zugangsdaten wurden erneut zugesendet." };

  it("älter als 24 Stunden → Mail ohne Passwort, Antwort unverändert", async () => {
    const t = setup(base({ existing: existing("2026-11-02T11:59:00Z") }));
    const res = await t.handler(post(BODY));
    expect(await res.json()).toEqual(dupBody);
    expect(t.mails).toHaveLength(1);
    const m = t.mails[0];
    expect(m.subject).toBe("Ihr Zugang zu HFX.GOÄ – HFX Honorarfuchs");
    expect(m.text).toContain("Sie haben sich erneut angemeldet. Für diese E-Mail-Adresse besteht bereits ein Zugang.");
    expect(m.text).toContain("Aus Sicherheitsgründen senden wir Ihr Passwort nicht erneut.");
    expect(m.text).toContain("Fragen? info@hfx-honorarfuchs.de");
    expect(m.text).not.toMatch(/Passwort:/);
    expect(m.html).not.toMatch(/Passwort:<\/strong>/);
    expect(t.updates.some((u) => u.v.credentials_sent_at)).toBe(true);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it("innerhalb von 24 Stunden → keine Mail, Antwort unverändert", async () => {
    const t = setup(base({ existing: existing("2026-11-03T00:00:00Z") }));
    const res = await t.handler(post(BODY));
    expect(await res.json()).toEqual(dupBody);
    expect(t.mails).toHaveLength(0);
  });

  it("noch nie verschickt → Mail", async () => {
    const t = setup(base({ existing: existing(null) }));
    await t.handler(post(BODY));
    expect(t.mails).toHaveLength(1);
  });
});

describe("capture-lead: Dubletten bei manueller Anlage", () => {
  const ex = { id: "lead-old", hfx_customer_number: "HFX-I01000", credentials_sent_at: null };
  it("Portal-Aufruf manual mit bekannter E-Mail → duplicate, kein neuer Lead, keine Mail", async () => {
    const t = setup(base({ existing: ex, user: { id: "u1" }, roles: ["admin"] }));
    const res = await t.handler(post({ ...BODY, source: "manual" }, true));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.duplicate).toBe(true);
    expect(j.hfx_customer_number).toBe("HFX-I01000");
    expect(t.inserts.leads).toBeUndefined();
    expect(t.mails).toHaveLength(0);
  });
  it("source manual ohne Anmeldung → wie Homepage (Dublettenprüfung greift)", async () => {
    const t = setup(base({ existing: ex }));
    const res = await t.handler(post({ ...BODY, source: "manual" }));
    expect((await res.json()).message).toContain("Ihre Zugangsdaten wurden erneut zugesendet");
    expect(t.inserts.leads).toBeUndefined();
  });
  it("source manual ohne Anmeldung, neue E-Mail → Lead mit source homepage", async () => {
    const t = setup(base());
    await t.handler(post({ ...BODY, source: "manual" }));
    expect((t.inserts.leads as any[])[0].source).toBe("homepage");
  });
});

describe("capture-lead: IP-Grenze (still 200)", () => {
  for (const [label, o] of [["5. pro Stunde", { rateHour: 5 }], ["20. pro Tag", { rateDay: 20 }]] as const) {
    it(`über der Grenze (${label}) → 200 ohne Lead, ohne Mail, ohne Qodia`, async () => {
      const t = setup(base(o));
      const res = await t.handler(post(BODY));
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(t.inserts.leads).toBeUndefined();
      expect(t.mails).toHaveLength(0);
      expect(t.fetchMock).not.toHaveBeenCalled();
    });
  }
  it("unter der Grenze → Zähler gespeichert, nur als Hash", async () => {
    const t = setup(base({ rateHour: 4, rateDay: 19 }));
    await t.handler(post(BODY));
    const row = (t.inserts.capture_lead_rate as any[])[0];
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
  });
  it("Portal-Aufruf ist ausgenommen", async () => {
    const t = setup(base({ rateHour: 99, rateDay: 99, user: { id: "u1" }, roles: ["user"] }));
    await t.handler(post({ ...BODY, source: "manual" }, true));
    expect(t.inserts.leads).toHaveLength(1);
  });
});

describe("capture-lead: Antworten und Protokoll", () => {
  it("fehlende Pflichtfelder → 400 wie bisher", async () => {
    const t = setup(base());
    const res = await t.handler(post({ email: "a@b.de" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Fehlende Pflichtfelder");
  });
  it("ungültiges JSON → 500 wie bisher", async () => {
    const t = setup(base());
    const res = await t.handler(new Request("http://offline.test", { method: "POST", body: "x=1" }));
    expect(res.status).toBe(500);
  });
  it("Protokoll ohne E-Mail, Namen und Request, mit Lead-ID und Ergebnis", async () => {
    const t = setup(base({ qodiaStatus: 500 }));
    await t.handler(post(BODY));
    const all = t.logs.join("\n");
    for (const v of ["Erika", "Muster", "example.test", "Praxis Test", "0170"]) expect(all).not.toContain(v);
    expect(all).toContain('"lead_id":"lead-new"');
    expect(all).toContain('"result":"created"');
  });
  it("CORS unverändert", () => {
    expect(SRC).toContain('"Access-Control-Allow-Origin": "*"');
  });
});
