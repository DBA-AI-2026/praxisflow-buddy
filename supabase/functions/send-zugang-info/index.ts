// send-zugang-info — Einrichtungs-Mail „Zugang einrichten" (GOÄ)
//
// Admin-JWT-geschützt. Drei Modi (Muster wie campaign-mail-send):
//
//   dry_run  → liefert die Zielliste zu den übergebenen HFX-Nummern inkl.
//              Vorgeschichte (letztes MAIL_SENT_ZUGANGSINFO, letztes
//              MAIL_SENT_CREDENTIALS). Kein Versand, kein DB-Write.
//              Wiederholter Versand wird NICHT hart geblockt — die Mail ist
//              inhaltlich ungefährlich —, aber sichtbar gemacht.
//   canary   → rendert die Mail des ERSTEN gelisteten Leads und sendet sie an
//              canary_to (Admin-Adresse), nicht an den Kunden. Kein Event.
//   send     → sequentiell mit 100 ms Pause, Versand an lead.email,
//              non-blocking customer_events MAIL_SENT_ZUGANGSINFO.
//
// Anhang ist PFLICHT: email-assets/zugang/hfx-zugang-einrichten.pdf. Fehlt die
// Datei, bricht die Function mit klarer Fehlermeldung ab — es wird NIEMALS
// ohne Anhang gesendet.
//
// Betreff/Body sind PLATZHALTER — verbindlicher Text folgt in Auftrag B.

import { Resend } from "npm:resend@2.0.0";
import { requireActiveRole } from "../_shared/auth.ts";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

// CORS: Domain-Kanon der übrigen Functions (bewusst KEIN "*" wie in
// campaign-mail-send — jene Uneinheitlichkeit bleibt benannt, nicht angefasst).
const ALLOWED_ORIGINS = [
  "https://sales.hfx-honorarfuchs.de",
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const FROM_ADDRESS = "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>";
const REPLY_TO = "info@hfx-honorarfuchs.de";

// Aus capture-lead/index.ts übernommen (Windows-Download, s. Abnahme für MAC-URL)
const DOWNLOAD_URL = "https://download.qodia.de/production/hfx/latest/windows/hfx-desktop.exe";

const ASSET_BUCKET = "email-assets";
const ASSET_PATH = "zugang/hfx-zugang-einrichten.pdf";
const ATTACHMENT_FILENAME = "HFX-GOAe_Zugang-einrichten.pdf";

const EVENT_TYPE = "MAIL_SENT_ZUGANGSINFO";

const SUBJECT = "Ihr Zugang zur HFX.GOÄ-Anwendung – so richten Sie Ihr Passwort ein";

type Mode = "dry_run" | "canary" | "send";

interface LeadRow {
  id: string;
  hfx_customer_number: string | null;
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  praxis_name: string | null;
  status: string;
  qodia_synced: boolean;
}

interface ResultRow {
  lead_id: string | null;
  hfx_customer_number: string;
  name: string;
  outcome: "gesendet" | "übersprungen: nicht gefunden" | "Fehler";
  sent_to?: string | null;
  error?: string | null;
}

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[send-zugang-info][${ts}] ${step}${d}`);
};

function displayName(l: Pick<LeadRow, "praxis_name" | "vorname" | "nachname">): string {
  return (
    l.praxis_name ||
    [l.vorname, l.nachname].filter(Boolean).join(" ") ||
    "(ohne Name)"
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function buildMailParts(lead: LeadRow) {
  const name = displayName(lead);
  const email = lead.email ?? "";
  const hfx = lead.hfx_customer_number ?? "";

  const bodyHtml = `
      <p>Guten Tag,</p>
      <p>damit Sie sich in der HFX.GOÄ-Anwendung anmelden können, hier das Wichtigste in Kürze:</p>
      <p>
        <strong>Ihre Anmelde-Adresse:</strong> ${email}<br>
        <strong>Ihre HFX-Kundennummer:</strong> ${hfx}
      </p>
      <p>Ihr Passwort vergeben Sie selbst – direkt in der Anwendung. Ein Passwort aus einer früheren E-Mail brauchen Sie dafür nicht.</p>
      <p>So geht es:</p>
      <ol>
        <li>HFX.GOÄ-Anwendung öffnen.</li>
        <li>Ihre Anmelde-Adresse (siehe oben) in das Feld „E-Mail" eintragen – nicht die Kundennummer.</li>
        <li>Auf „Passwort vergessen?" klicken. Der Link wird erst aktiv, wenn die Adresse eingetragen ist.</li>
        <li>Den 6-stelligen Code aus der E-Mail eingeben. Kommt er nicht innerhalb weniger Minuten, bitte im Spam-Ordner nachsehen.</li>
        <li>Eigenes Passwort vergeben – fertig.</li>
      </ol>
      <p>Die Anleitung finden Sie auch im angehängten PDF, gerne zum Ausdrucken für die Praxis.</p>
      <p>Anwendung noch nicht installiert? Hier herunterladen:
        <a href="${DOWNLOAD_URL}" target="_blank" rel="noopener noreferrer">${DOWNLOAD_URL}</a>
      </p>
      <p>Wenn Sie sich bereits mit einem eigenen Passwort anmelden können, ist nichts weiter zu tun.</p>
      <p>Es klappt nicht? Antworten Sie einfach auf diese E-Mail mit einem Bildschirmfoto der Stelle, an der es hakt – wir helfen sofort.</p>
      <p>Mit freundlichen Grüßen<br>Ihr Team von HFX Honorarfuchs</p>
  `.trim();

  const bodyText = [
    "Guten Tag,",
    "",
    "damit Sie sich in der HFX.GOÄ-Anwendung anmelden können, hier das Wichtigste in Kürze:",
    "",
    `Ihre Anmelde-Adresse: ${email}`,
    `Ihre HFX-Kundennummer: ${hfx}`,
    "",
    "Ihr Passwort vergeben Sie selbst – direkt in der Anwendung. Ein Passwort aus einer früheren E-Mail brauchen Sie dafür nicht.",
    "",
    "So geht es:",
    "",
    "1. HFX.GOÄ-Anwendung öffnen.",
    "2. Ihre Anmelde-Adresse (siehe oben) in das Feld „E-Mail“ eintragen – nicht die Kundennummer.",
    "3. Auf „Passwort vergessen?“ klicken. Der Link wird erst aktiv, wenn die Adresse eingetragen ist.",
    "4. Den 6-stelligen Code aus der E-Mail eingeben. Kommt er nicht innerhalb weniger Minuten, bitte im Spam-Ordner nachsehen.",
    "5. Eigenes Passwort vergeben – fertig.",
    "",
    "Die Anleitung finden Sie auch im angehängten PDF, gerne zum Ausdrucken für die Praxis.",
    "",
    `Anwendung noch nicht installiert? Hier herunterladen: ${DOWNLOAD_URL}`,
    "",
    "Wenn Sie sich bereits mit einem eigenen Passwort anmelden können, ist nichts weiter zu tun.",
    "",
    "Es klappt nicht? Antworten Sie einfach auf diese E-Mail mit einem Bildschirmfoto der Stelle, an der es hakt – wir helfen sofort.",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Team von HFX Honorarfuchs",
  ].join("\n");

  const { html, text } = renderBrandedEmail({
    subheadline: "Zugang einrichten",
    bodyHtml,
    bodyText,
  });
  return { subject: SUBJECT, html, text, name };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authResult = await requireActiveRole(req, ["admin"], corsHeaders);
  if (authResult instanceof Response) return authResult;
  const { admin, userId } = authResult;

  let body: { mode?: Mode; hfx_numbers?: unknown; canary_to?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mode = body.mode;
  if (!mode || !["dry_run", "canary", "send"].includes(mode)) {
    return new Response(
      JSON.stringify({ error: "mode must be 'dry_run', 'canary' or 'send'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const numbers = Array.isArray(body.hfx_numbers)
    ? Array.from(
      new Set(
        (body.hfx_numbers as unknown[])
          .map((n) => String(n ?? "").trim())
          .filter((n) => n.length > 0),
      ),
    )
    : [];

  if (numbers.length === 0) {
    return new Response(JSON.stringify({ error: "hfx_numbers must be a non-empty list" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === Leads zu den Nummern laden ===
  const { data: leads, error: lErr } = await admin
    .from("leads")
    .select("id, hfx_customer_number, email, vorname, nachname, praxis_name, status, qodia_synced")
    .in("hfx_customer_number", numbers);

  if (lErr) {
    log("db error (lead lookup)", { message: lErr.message });
    return new Response(JSON.stringify({ error: "Lead lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const leadByNumber = new Map<string, LeadRow>();
  for (const l of (leads ?? []) as LeadRow[]) {
    if (l.hfx_customer_number) leadByNumber.set(l.hfx_customer_number, l);
  }
  const targets: LeadRow[] = numbers
    .map((n) => leadByNumber.get(n))
    .filter((l): l is LeadRow => Boolean(l));

  if (mode === "dry_run") {
    // Vorgeschichte: letztes MAIL_SENT_ZUGANGSINFO und letztes
    // MAIL_SENT_CREDENTIALS je Nummer. Kein Block, nur Sichtbarkeit.
    const { data: events, error: eErr } = await admin
      .from("customer_events")
      .select("event_type, hfx_customer_number, created_at")
      .in("hfx_customer_number", numbers)
      .in("event_type", [EVENT_TYPE, "MAIL_SENT_CREDENTIALS"])
      .order("created_at", { ascending: false });

    if (eErr) log("WARN: history lookup failed (non-blocking)", eErr.message);

    const lastZugang = new Map<string, string>();
    const lastCreds = new Map<string, string>();
    for (const ev of (events ?? []) as any[]) {
      const key = ev.hfx_customer_number as string;
      if (!key) continue;
      if (ev.event_type === EVENT_TYPE && !lastZugang.has(key)) lastZugang.set(key, ev.created_at);
      if (ev.event_type === "MAIL_SENT_CREDENTIALS" && !lastCreds.has(key)) {
        lastCreds.set(key, ev.created_at);
      }
    }

    return new Response(
      JSON.stringify({
        mode,
        count: targets.length,
        targets: numbers.map((n) => {
          const l = leadByNumber.get(n) ?? null;
          return {
            hfx_customer_number: n,
            lead_id: l?.id ?? null,
            name: l ? displayName(l) : null,
            email: l?.email ?? null,
            status: l?.status ?? null,
            qodia_synced: l?.qodia_synced ?? null,
            found: !!l,
            last_zugang_info_at: lastZugang.get(n) ?? null,
            last_credentials_at: lastCreds.get(n) ?? null,
          };
        }),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // === Ab hier Versand: Resend + PFLICHT-Anhang ===
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const resend = new Resend(resendKey);

  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from(ASSET_BUCKET)
    .download(ASSET_PATH);

  if (dlErr || !pdfBlob) {
    const msg =
      `Anhang fehlt: ${ASSET_BUCKET}/${ASSET_PATH} konnte nicht geladen werden` +
      (dlErr?.message ? ` (${dlErr.message})` : "") +
      ". Bitte das PDF unter /admin/zugang-info hochladen. Es wird niemals ohne Anhang gesendet.";
    log("attachment missing — abort", { path: ASSET_PATH });
    return new Response(JSON.stringify({ error: msg }), {
      status: 412,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const attachments = [
    {
      filename: ATTACHMENT_FILENAME,
      content: toBase64(new Uint8Array(await pdfBlob.arrayBuffer())),
    },
  ];

  if (mode === "canary") {
    const canaryTo = body.canary_to?.trim();
    if (!canaryTo) {
      return new Response(JSON.stringify({ error: "canary_to required for mode 'canary'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: "Keine Ziel-Leads zu den Nummern gefunden" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, html, text } = buildMailParts(targets[0]);
    try {
      const sent = await resend.emails.send({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [canaryTo],
        subject,
        html,
        text,
        attachments,
      });
      if ((sent as any)?.error) {
        throw new Error(String((sent as any).error?.message || (sent as any).error));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("canary ERROR", { message: msg });
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bewusst KEIN customer_events-Eintrag: der Kunde wurde nicht angeschrieben.
    log("canary sent", {
      canary_domain: canaryTo.split("@")[1] ?? null,
      rendered_for: targets[0].hfx_customer_number,
    });
    return new Response(
      JSON.stringify({
        mode,
        count: 1,
        canary_to: canaryTo,
        rendered_for: targets[0].hfx_customer_number,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // === send-Modus: sequentiell + 100 ms Pause ===
  const results: ResultRow[] = [];

  for (const n of numbers) {
    const lead = leadByNumber.get(n);
    if (!lead) {
      results.push({
        lead_id: null,
        hfx_customer_number: n,
        name: "(nicht gefunden)",
        outcome: "übersprungen: nicht gefunden",
      });
      continue;
    }

    if (!lead.qodia_synced) {
      const name = displayName(lead);
      results.push({
        lead_id: lead.id,
        hfx_customer_number: n,
        name,
        outcome: "übersprungen: nicht bei Qodia registriert",
      });
      log("skipped: not qodia_synced", { lead_id: lead.id, hfx_customer_number: n });
      continue;
    }

    const name = displayName(lead);
    try {
      if (!lead.email) throw new Error("Lead hat keine E-Mail-Adresse");

      const { subject, html, text } = buildMailParts(lead);
      const sent = await resend.emails.send({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [lead.email],
        subject,
        html,
        text,
        attachments,
      });
      if ((sent as any)?.error) {
        throw new Error(String((sent as any).error?.message || (sent as any).error));
      }

      // Non-blocking customer_events
      try {
        const { error: ceErr } = await admin.from("customer_events").insert({
          event_type: EVENT_TYPE,
          entity_type: "lead",
          entity_id: lead.id,
          hfx_customer_number: lead.hfx_customer_number,
          lead_id: lead.id,
          contract_id: null,
          created_by: userId,
          event_data: {
            sent_to: lead.email,
            mode,
            hfx_customer_number: lead.hfx_customer_number,
          },
        });
        if (ceErr) log("WARN: customer_events insert failed (non-blocking)", ceErr.message);
      } catch (ex) {
        log("WARN: customer_events insert exception (non-blocking)", String(ex));
      }

      results.push({
        lead_id: lead.id,
        hfx_customer_number: n,
        name,
        outcome: "gesendet",
        sent_to: lead.email,
      });
      log("sent", { lead_id: lead.id, hfx_customer_number: n });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("ERROR", { hfx_customer_number: n, message: msg });
      results.push({
        lead_id: lead.id,
        hfx_customer_number: n,
        name,
        outcome: "Fehler",
        error: msg,
      });
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  return new Response(
    JSON.stringify({ mode, count: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
