// campaign-mail-send — Etappe 3 (Kampagnen-Mailversand)
//
// Admin-JWT-geschützt. Verschickt die GOÄ-Kampagnen-Mail (branded Layout,
// roter CTA auf /kampagne?token=…) an alle qualifizierten Leads, die
// (a) einen hfx_customer_number besitzen,
// (b) eine E-Mail besitzen (defensiv — leads.email ist NOT NULL,
//     Filter bleibt trotzdem drin; kein "Lead ohne Mail"-Zweig im Reporting),
// (c) noch KEINE Kampagnen-Mail erhalten haben (campaign_mail_sent_at IS NULL).
//
// Kein Trigger, kein Cron — ausschließlich manuell aus /admin/kampagne.
//
// Modi:
//   dry_run: liefert nur die Ziel-Liste (kein Versand, keine DB-Änderung).
//   send:    fetch Ziel-Liste EINMAL, iteriere sequentiell mit 100ms Pause,
//            ensure Token, sende Mail via Resend, setze campaign_mail_sent_at,
//            optional customer_events CAMPAIGN_MAIL_SENT (non-blocking).
//
// Token wird NIEMALS geloggt. Nur lead_id / hfx_customer_number / outcome.
//
// Rollback: Function deaktivieren; keine DB-Migration nötig. Bereits gesetzte
// campaign_mail_sent_at bleiben stehen (das ist beabsichtigt — verhindert
// versehentlichen Doppel-Versand).

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireActiveRole } from "../_shared/auth.ts";
import {
  buildCampaignUrl,
  CAMPAIGN_ID,
  CAMPAIGN_PRODUCT,
  generateCampaignToken,
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

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "HFX Honorarfuchs <no-reply@hfx-honorarfuchs.de>";
const REPLY_TO = "info@hfx-honorarfuchs.de";

// Lead-Status, die eine Kampagnen-Mail erhalten dürfen.
// BEWUSST enger als ALLOWED_LEAD_STATUSES aus _shared/campaign.ts
// (dort ist 'vertrag' drin für den Klick-Reuse-Pfad); Mail-Versand
// an Leads mit bereits laufendem Vertrag ergibt keinen Sinn.
const MAIL_ELIGIBLE_STATUSES = ["neu", "kontaktiert", "qualifiziert"];

type Mode = "dry_run" | "send";

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

function displayName(l: LeadRow): string {
  return (
    l.praxis_name ||
    [l.vorname, l.nachname].filter(Boolean).join(" ") ||
    "(ohne Name)"
  );
}

function buildMailParts(lead: LeadRow, url: string) {
  const greetingName = [lead.vorname, lead.nachname].filter(Boolean).join(" ")
    || lead.praxis_name
    || "Ihr HFX-Team";

  const subject = "Ihr HFX GOÄ Zugang ist bereit — jetzt starten";
  const subheadline = "GOÄ-Kampagne: Ihr Zugang wartet";

  const bodyHtml = `
      <p>Guten Tag ${greetingName},</p>
      <p>
        wir haben Ihr Konto für <strong>${CAMPAIGN_PRODUCT}</strong> vorbereitet.
        Mit einem Klick auf den Button unten öffnen Sie Ihre persönliche
        Bestellseite — dort sehen Sie Preis, Konditionen und schließen
        Ihren Vertrag digital ab.
      </p>
      ${renderBrandedButton({ href: url, label: "Jetzt starten" })}
      <p style="font-size:10pt;color:#666;">
        Der Link ist personalisiert. Bitte nicht weitergeben.
      </p>
      <p>Bei Fragen antworten Sie einfach auf diese Mail — wir sind für Sie da.</p>
      <p>Ihr HFX Honorarfuchs Team</p>
  `.trim();

  const bodyText = [
    `Guten Tag ${greetingName},`,
    "",
    `wir haben Ihr Konto für ${CAMPAIGN_PRODUCT} vorbereitet.`,
    "Mit einem Klick auf den Link unten öffnen Sie Ihre persönliche",
    "Bestellseite — dort sehen Sie Preis, Konditionen und schließen",
    "Ihren Vertrag digital ab.",
    "",
    `Jetzt starten: ${url}`,
    "",
    "Der Link ist personalisiert. Bitte nicht weitergeben.",
    "",
    "Bei Fragen antworten Sie einfach auf diese Mail — wir sind für Sie da.",
    "",
    "Ihr HFX Honorarfuchs Team",
  ].join("\n");

  const { html, text } = renderBrandedEmail({ subheadline, bodyHtml, bodyText });
  return { subject, html, text };
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

  let body: { mode?: Mode; lead_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mode = body.mode;
  if (!mode || !["dry_run", "send"].includes(mode)) {
    return new Response(
      JSON.stringify({ error: "mode must be 'dry_run' or 'send'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (mode === "send" && !resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === Ziel-Liste EINMAL fetchen ===
  // leads.email ist laut Schema NOT NULL; Filter defensiv drin, aber KEIN
  // Sonderpfad im Ergebnis-Reporting.
  let query = admin
    .from("leads")
    .select(
      "id, hfx_customer_number, email, vorname, nachname, praxis_name, campaign_token, campaign_mail_sent_at, status",
    )
    .in("status", MAIL_ELIGIBLE_STATUSES)
    .not("hfx_customer_number", "is", null)
    .not("email", "is", null)
    .is("campaign_mail_sent_at", null)
    .order("created_at", { ascending: true });

  if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
    query = query.in("id", body.lead_ids);
  }

  const { data: leads, error: lErr } = await query;
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
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // === send-Modus: sequentiell + einmalige Zielmenge ===
  //
  // Sequentiell + einmalige Zielmenge ist für die aktuelle Größenordnung
  // (Dutzende) ausgelegt. Bei mehreren hundert Empfängern reicht die
  // Laufzeit einer Edge Function nicht — dann braucht es Paginierung
  // über campaign_mail_sent_at IS NULL und mehrere Läufe.
  // Kein Grund, das heute zu bauen.
  const results: ResultRow[] = [];

  for (const lead of targets) {
    const name = displayName(lead);
    try {
      // Guard: falls parallel schon versendet → skip
      const { data: fresh, error: fErr } = await admin
        .from("leads")
        .select("campaign_mail_sent_at, campaign_token")
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

      // Token ensuren (idempotent, analog campaign-token-issue)
      let token = fresh?.campaign_token ?? lead.campaign_token;
      if (!token) {
        const newToken = generateCampaignToken();
        const { error: uErr } = await admin
          .from("leads")
          .update({
            campaign_token: newToken,
            campaign_token_created_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .is("campaign_token", null);
        if (uErr) throw new Error(`token write failed: ${uErr.message}`);

        // Read-back (Race-Guard)
        const { data: after, error: aErr } = await admin
          .from("leads")
          .select("campaign_token")
          .eq("id", lead.id)
          .maybeSingle();
        if (aErr || !after?.campaign_token) {
          throw new Error("token read-back failed");
        }
        token = after.campaign_token;
      }

      const url = buildCampaignUrl(token!);
      const { subject, html, text } = buildMailParts(lead, url);

      const resp = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [lead.email],
          reply_to: REPLY_TO,
          subject,
          html,
          text,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Resend ${resp.status}: ${errBody.slice(0, 300)}`);
      }

      const nowIso = new Date().toISOString();
      const { error: mErr } = await admin
        .from("leads")
        .update({ campaign_mail_sent_at: nowIso })
        .eq("id", lead.id);
      if (mErr) throw new Error(`mail_sent_at write failed: ${mErr.message}`);

      // Non-blocking customer_events
      try {
        const { error: ceErr } = await admin.from("customer_events").insert({
          event_type: "CAMPAIGN_MAIL_SENT",
          entity_type: "lead",
          entity_id: lead.id,
          hfx_customer_number: lead.hfx_customer_number,
          lead_id: lead.id,
          created_by: null,
          event_data: {
            campaign: CAMPAIGN_ID,
            product_name: CAMPAIGN_PRODUCT,
            lead_status: lead.status,
            source: "campaign-mail-send",
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
