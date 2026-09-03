// ============================================================================
// zugang-anfrage — Öffentliche Zugangsanfrage aus der HFX.GOÄ-Anwendung (/zugang)
// ============================================================================
//
// Nimmt das Formular von /zugang entgegen und schickt es als Mail an
// info@hfx-honorarfuchs.de. Legt KEINEN Lead, KEIN Konto an, ruft KEIN Qodia
// auf, sendet KEINE Kundenmail. Die Zuordnung macht ein Mensch.
//
// Missbrauchsschutz — best effort, bewusste Entscheidung:
//   1. Origin-Whitelist (Muster notify-new-request).
//   2. Honeypot-Feld: gefüllt → stumm 200, keine Mail.
//   3. In-Memory-Ratenbegrenzung pro IP (5 Requests / 10 Min, x-forwarded-for).
//      Die Map lebt nur im jeweiligen Isolate und ist flüchtig; mehrere
//      Instanzen teilen nichts. Der schlimmste Missbrauchsfall ist Spam an
//      info@ – kein DB-Schreiben, kein Konto, kein Kundenkontakt. Eine
//      Tabelle wäre unverhältnismäßig; daher bewusst ohne Persistenz.
// ============================================================================

import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

const ALLOWED_ORIGINS = [
  "https://sales.hfx-honorarfuchs.de",
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "https://f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovableproject.com",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

const TARGET_EMAIL = "info@hfx-honorarfuchs.de";

// ── Rate-Limit (in-memory, best effort) ─────────────────────────────────────
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateMap.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateMap.set(ip, recent);
  // Gelegentliche Bereinigung, damit die Map nicht unbegrenzt wächst
  if (rateMap.size > 5000) {
    for (const [k, v] of rateMap) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateMap.delete(k);
    }
  }
  return false;
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // 1) Origin-Whitelist
  if (!ALLOWED_ORIGINS.includes(origin || "")) {
    console.warn("Blocked request: unknown origin", { origin });
    return json({ error: "Forbidden" }, 403, corsHeaders);
  }

  // 3) Rate-Limit pro IP
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(clientIp)) {
    console.warn("Rate limited", { ip: clientIp });
    return json({ error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." }, 429, corsHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage" }, 400, corsHeaders);
  }

  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  // 2) Honeypot: gefüllt → stumm 200
  const honeypot = str(body.website, 500);
  if (honeypot) {
    console.log("Honeypot triggered – silently accepted", { ip: clientIp });
    return json({ success: true }, 200, corsHeaders);
  }

  const praxis_name = str(body.praxis_name, 200);
  const vorname = str(body.vorname, 100);
  const nachname = str(body.nachname, 100);
  const email = str(body.email, 254);
  const telefon = str(body.telefon, 50);
  const hfx_kundennummer = str(body.hfx_kundennummer, 50);
  const nachricht = str(body.nachricht, 2000);
  const src = str(body.src, 50); // Fremdeingabe aus Query-Parameter

  if (!praxis_name || praxis_name.length < 2 || !vorname || !nachname) {
    return json({ error: "Bitte füllen Sie alle Pflichtfelder aus." }, 400, corsHeaders);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Bitte geben Sie eine gültige E-Mail-Adresse an." }, 400, corsHeaders);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return json({ error: "Mailversand nicht konfiguriert" }, 500, corsHeaders);
  }

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;width:160px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${esc(value)}</td></tr>`;

  const bodyHtml = `
      <p style="margin:0 0 16px 0;">Über die Seite /zugang wurde ein Zugang zur HFX.GOÄ-Anwendung angefragt:</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
        ${row("Praxisname", praxis_name)}
        ${row("Name", `${vorname} ${nachname}`)}
        ${row("E-Mail", email)}
        ${row("Telefon", telefon || "–")}
        ${row("HFX-Kundennummer", hfx_kundennummer || "–")}
        ${row("Nachricht", nachricht || "–")}
        ${row("Quelle (src)", src || "–")}
      </table>
      <p style="margin:16px 0 0 0;color:#777777;font-size:10pt;">Es wurde kein Lead und kein Konto angelegt. Bitte manuell zuordnen und den Zugang einrichten.</p>
    `;

  const bodyText = [
    "Über die Seite /zugang wurde ein Zugang zur HFX.GOÄ-Anwendung angefragt:",
    "",
    `Praxisname: ${praxis_name}`,
    `Name: ${vorname} ${nachname}`,
    `E-Mail: ${email}`,
    `Telefon: ${telefon || "–"}`,
    `HFX-Kundennummer: ${hfx_kundennummer || "–"}`,
    `Nachricht: ${nachricht || "–"}`,
    `Quelle (src): ${src || "–"}`,
    "",
    "Es wurde kein Lead und kein Konto angelegt. Bitte manuell zuordnen und den Zugang einrichten.",
  ].join("\n");

  const { html, text } = renderBrandedEmail({
    subheadline: "HFX.GOÄ-Zugang angefragt",
    bodyHtml,
    bodyText,
  });

  try {
    const resend = new Resend(resendApiKey);
    const result = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: email,
      to: [TARGET_EMAIL],
      subject: `HFX.GOÄ-Zugang angefragt: ${praxis_name}`,
      html,
      text,
    });
    if ((result as { error?: unknown }).error) {
      console.error("Resend error", (result as { error?: unknown }).error);
      return json({ error: "Mailversand fehlgeschlagen" }, 502, corsHeaders);
    }
    console.log("Zugangsanfrage sent", { praxis_name, src: src || null, ip: clientIp });
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    console.error("Send failed", err);
    return json({ error: "Mailversand fehlgeschlagen" }, 500, corsHeaders);
  }
});
