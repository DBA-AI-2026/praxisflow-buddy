// campaign-mail-send — Etappe 3 (Kampagnen-Mailversand, GOÄ-Konvertierung)
//
// Admin-JWT-geschützt. Drei Modi:
//
//   dry_run  → liefert nur die Ziel-Liste (kein Versand, keine DB-Änderung).
//   canary   → GENAU EINE Mail an test_email; Link trägt einen WEGWERF-TOKEN
//              (nicht in die DB geschrieben) und läuft in campaign-start
//              Gate 3 (token_not_found) auf /kampagne-info. Kein DB-Write.
//              Rendert mit den Daten des ersten Ziel-Leads (nur zum Rendern;
//              dieser Lead wird nicht berührt). Leere Zielmenge → Platzhalter.
//   send     → fetch Ziel-Liste EINMAL, iteriere sequentiell mit 100ms
//              Pause, ensure Token, sende Mail via Resend-SDK,
//              setze campaign_mail_sent_at, non-blocking customer_events.
//
// Idempotenz-Anker: leads.campaign_mail_sent_at. Wird EINMAL gesetzt und
// NIE überschrieben — die Zielmenge schließt Leads mit gesetztem Wert aus.
//
// Token wird NIEMALS geloggt. Nur lead_id / hfx_customer_number / outcome.
//
// Größenordnung: sequentiell + einmalige Zielmenge ist für Dutzende ausgelegt.
// Bei mehreren hundert Empfängern reicht die Laufzeit einer Edge Function
// nicht — dann Paginierung über campaign_mail_sent_at IS NULL + Wiederholaufrufe.

import { Resend } from "npm:resend@2.0.0";
import { requireActiveRole } from "../_shared/auth.ts";
import {
  buildCampaignUrl,
  CAMPAIGN_ID,
  CAMPAIGN_PRODUCT,
  ensureCampaignToken,
  generateCampaignToken,
  MAIL_ELIGIBLE_STATUSES,
} from "../_shared/campaign.ts";
import {
  renderBrandedButton,
  renderBrandedEmail,
} from "../_shared/email-templates/baseEmailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_ADDRESS = "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>";
const REPLY_TO = "info@hfx-honorarfuchs.de";
const SUBJECT = "Ihr Zugang zu HFX-GOÄ – jetzt dauerhaftes Angebot sichern";

type Mode = "dry_run" | "canary" | "send";

interface LeadRow {
  id: string;
  hfx_customer_number: string | null;
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  praxis_name: string | null;
  campaign_token: string | null;
  campaign_mail_sent_at: string | null;
  status: string;
}

interface ResultRow {
  lead_id: string;
  hfx_customer_number: string | null;
  name: string;
  outcome: "gesendet" | "übersprungen: schon versendet" | "Fehler";
  error?: string | null;
}

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[campaign-mail-send][${ts}] ${step}${d}`);
};

function displayName(l: Pick<LeadRow, "praxis_name" | "vorname" | "nachname">): string {
  return (
    l.praxis_name ||
    [l.vorname, l.nachname].filter(Boolean).join(" ") ||
    "(ohne Name)"
  );
}

/**
 * Anrede-Zeile analog send-mandate-setup:
 *   „Sehr geehrte/r <Vorname> <Nachname>"
 *   Fallback ohne Namensbestandteile: „Sehr geehrte Damen und Herren"
 */
function buildGreeting(l: Pick<LeadRow, "vorname" | "nachname">): string {
  const parts = [l.vorname, l.nachname].filter(Boolean).join(" ").trim();
  if (!parts) return "Sehr geehrte Damen und Herren";
  return `Sehr geehrte/r ${parts}`;
}

function buildMailParts(lead: Pick<LeadRow, "vorname" | "nachname">, url: string) {
  const greeting = buildGreeting(lead);
  const subheadline = "Ihr HFX-GOÄ Zugang wartet";

  const bodyHtml = `
      <p>${greeting},</p>
      <p>
        Sie können Ihren Zugang zu <strong>HFX-GOÄ</strong> inklusive
        200 Rechnungen kostenfrei testen.
      </p>
      <p>
        Wer jetzt abschließt, zahlt zunächst trotzdem nichts – die
        Grundgebühr entfällt bis 31.12.2026, das verbliebene
        Freikontingent gilt weiter.
      </p>
      <ul style="margin:12px 0 12px 20px;padding:0;">
        <li>dauerhaft 0,99 € pro Rechnung statt 1,20 €</li>
        <li>keine Grundgebühr bis 31.12.2026 – das sind 49 € pro Monat, gezahlt wird erst ab 2027</li>
        <li>je früher der Abschluss, desto größer die Ersparnis</li>
      </ul>
      <p>
        Abschließen kostet jetzt nichts, verlängert das Testen nahtlos
        und friert den Preisvorteil ein.
      </p>
      ${renderBrandedButton({ href: url, label: "Jetzt Vollversion buchen" })}
      <p style="font-size:10pt;color:#666;">
        Der Link ist personalisiert. Bitte nicht weitergeben.
      </p>
      <p>Bei Fragen erreichen Sie uns unter
        <a href="mailto:info@hfx-honorarfuchs.de">info@hfx-honorarfuchs.de</a>.
      </p>
  `.trim();

  const bodyText = [
    `${greeting},`,
    "",
    "Sie können Ihren Zugang zu HFX-GOÄ inklusive 200 Rechnungen kostenfrei testen.",
    "",
    "Wer jetzt abschließt, zahlt zunächst trotzdem nichts – die Grundgebühr entfällt bis 31.12.2026, das verbliebene Freikontingent gilt weiter.",
    "",
    "- dauerhaft 0,99 € pro Rechnung statt 1,20 €",
    "- keine Grundgebühr bis 31.12.2026 – das sind 49 € pro Monat, gezahlt wird erst ab 2027",
    "- je früher der Abschluss, desto größer die Ersparnis",
    "",
    "Abschließen kostet jetzt nichts, verlängert das Testen nahtlos und friert den Preisvorteil ein.",
    "",
    `Jetzt Vollversion buchen: ${url}`,
    "",
    "Der Link ist personalisiert. Bitte nicht weitergeben.",
    "",
    "Bei Fragen erreichen Sie uns unter info@hfx-honorarfuchs.de.",
  ].join("\n");

  const { html, text } = renderBrandedEmail({ subheadline, bodyHtml, bodyText });
  return { subject: SUBJECT, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authResult = await requireActiveRole(req, ["admin"], corsHeaders);
  if (authResult instanceof Response) return authResult;
  const { admin } = authResult;

  let body: { mode?: Mode; test_email?: string } = {};
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

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if ((mode === "send" || mode === "canary") && !resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const resend = resendKey ? new Resend(resendKey) : null;

  // === Ziel-Liste EINMAL fetchen ===
  // leads.email ist laut Schema NOT NULL; Filter defensiv drin, aber KEIN
  // Sonderpfad im Ergebnis-Reporting.
  const { data: leads, error: lErr } = await admin
    .from("leads")
    .select(
      "id, hfx_customer_number, email, vorname, nachname, praxis_name, campaign_token, campaign_mail_sent_at, status",
    )
    .in("status", MAIL_ELIGIBLE_STATUSES)
    .not("hfx_customer_number", "is", null)
    .not("email", "is", null)
    .is("campaign_mail_sent_at", null)
    .order("created_at", { ascending: true });

  if (lErr) {
    log("db error (lead lookup)", { message: lErr.message });
    return new Response(JSON.stringify({ error: "Lead lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets: LeadRow[] = (leads ?? []) as LeadRow[];

  if (mode === "dry_run") {
    return new Response(
      JSON.stringify({
        mode,
        count: targets.length,
        targets: targets.map((t) => ({
          lead_id: t.id,
          hfx_customer_number: t.hfx_customer_number,
          name: displayName(t),
          email: t.email,
          status: t.status,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (mode === "canary") {
    const testEmail = body.test_email?.trim();
    if (!testEmail) {
      return new Response(JSON.stringify({ error: "test_email required for mode 'canary'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wegwerf-Token: NICHT in die DB geschrieben.
    // Ein echter Token würde beim Klick einen Vertrag für einen echten
    // Interessenten anlegen. Der Wegwerf-Token läuft in campaign-start
    // Gate 3 (token_not_found) auf /kampagne-info — der Kanarienvogel
    // kann strukturell keinen Schaden anrichten.
    const throwawayToken = generateCampaignToken();
    const url = buildCampaignUrl(throwawayToken);

    const renderSample = targets[0] ?? {
      anrede: null,
      titel: null,
      vorname: null,
      nachname: null,
      praxis_name: null,
    };
    const { subject, html, text } = buildMailParts(renderSample, url);

    try {
      const sent = await resend!.emails.send({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [testEmail],
        subject,
        html,
        text,
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

    log("canary sent", { test_email_domain: testEmail.split("@")[1] ?? null, target_count: targets.length });
    return new Response(
      JSON.stringify({
        mode,
        count: 1,
        test_email: testEmail,
        rendered_from_target: targets.length > 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // === send-Modus: sequentiell + einmalige Zielmenge ===
  const results: ResultRow[] = [];

  for (const lead of targets) {
    const name = displayName(lead);
    try {
      // Guard: falls parallel schon versendet → skip
      const { data: fresh, error: fErr } = await admin
        .from("leads")
        .select("campaign_mail_sent_at")
        .eq("id", lead.id)
        .maybeSingle();
      if (fErr) throw new Error(`re-check failed: ${fErr.message}`);
      if (fresh?.campaign_mail_sent_at) {
        results.push({
          lead_id: lead.id,
          hfx_customer_number: lead.hfx_customer_number,
          name,
          outcome: "übersprungen: schon versendet",
        });
        continue;
      }

      const { token } = await ensureCampaignToken(admin, lead.id);
      const url = buildCampaignUrl(token);
      const { subject, html, text } = buildMailParts(lead, url);

      const sent = await resend!.emails.send({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [lead.email!],
        subject,
        html,
        text,
      });
      if ((sent as any)?.error) {
        throw new Error(String((sent as any).error?.message || (sent as any).error));
      }

      const nowIso = new Date().toISOString();
      const { error: mErr } = await admin
        .from("leads")
        .update({ campaign_mail_sent_at: nowIso })
        .eq("id", lead.id)
        .is("campaign_mail_sent_at", null); // Doppel-Versand-Guard
      if (mErr) throw new Error(`mail_sent_at write failed: ${mErr.message}`);

      // Non-blocking customer_events (Muster analog campaign-start)
      try {
        const { error: ceErr } = await admin.from("customer_events").insert({
          event_type: "CAMPAIGN_MAIL_SENT",
          entity_type: "lead",
          entity_id: lead.id,
          hfx_customer_number: lead.hfx_customer_number,
          lead_id: lead.id,
          contract_id: null,
          created_by: null,
          event_data: {
            campaign: CAMPAIGN_ID,
            product_name: CAMPAIGN_PRODUCT,
            lead_status: lead.status,
            source: "campaign_mail_send",
          },
        });
        if (ceErr) log("WARN: customer_events insert failed (non-blocking)", ceErr.message);
      } catch (ex) {
        log("WARN: customer_events insert exception (non-blocking)", String(ex));
      }

      results.push({
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
        name,
        outcome: "gesendet",
      });
      log("sent", {
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("ERROR", { lead_id: lead.id, message: msg });
      results.push({
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
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
