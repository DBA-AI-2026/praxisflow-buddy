// send-mandate-setup
// Stufe 1 des Vertriebs-Buchungs-Flows (Pfad 1):
// - Vertrag wurde vom Vertrieb angelegt (Status z.B. "eingegangen")
// - Diese Function erzeugt eine Stripe-Setup-Session (SEPA) und versendet
//   Mail 1 an den Kunden mit dem Aktivierungslink.
//
// REFACTORING-SCHULD: Die Setup-Session-Erzeugungs-Logik ist nahezu identisch
// mit auto-invoice/index.ts Z. 339–388 (Mandate-Recovery). Beide sollten in
// einen gemeinsamen Helper ausgelagert werden. Bewusst dupliziert, um Phase 3
// nicht zu blockieren.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { Resend } from "npm:resend@2.0.0";
import { resolveAgbForCandidates } from "../_shared/agbResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

// ─────────────────────────────────────────────────────────────────────────────
// KOPPLUNGSSATZ (Platzhalter — finaler Wortlaut vor Go-live durch Anwalt).
// Änderung erfordert Function-Re-Deploy (kein DB-Wert). Im Hauptteil der Mail
// sichtbar, NICHT im Footer. HTML- und Text-Variante getrennt pflegen.
// ─────────────────────────────────────────────────────────────────────────────
const AGB_COUPLING_SENTENCE_HTML =
  'Mit der Erteilung des SEPA-Lastschriftmandats stimmen Sie zugleich den ' +
  'beigefügten <a href="{{AGB_URL}}" target="_blank" rel="noopener noreferrer" style="color:#0b367f;text-decoration:underline;">Allgemeinen Geschäftsbedingungen</a> zu.';
const AGB_COUPLING_SENTENCE_TEXT =
  "Mit der Erteilung des SEPA-Lastschriftmandats stimmen Sie zugleich den beigefügten Allgemeinen Geschäftsbedingungen (siehe Anhang bzw. Link: {{AGB_URL}}) zu.";

function buildMandateSetupEmail(params: {
  greeting: string;
  setupUrl: string;
  agbUrl: string;
}): { html: string; text: string } {
  const { greeting, setupUrl, agbUrl } = params;
  const couplingHtml = AGB_COUPLING_SENTENCE_HTML.replaceAll("{{AGB_URL}}", agbUrl);
  const couplingText = AGB_COUPLING_SENTENCE_TEXT.replaceAll("{{AGB_URL}}", agbUrl);
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#0b367f;color:#fff;padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="margin:0;font-size:22px;">Willkommen bei Honorarfuchs</h1>
    <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Bitte aktivieren Sie Ihren Vertrag</p>
  </div>
  <div style="background:#fff;padding:30px 24px;border:1px solid #e5e7eb;border-top:none;color:#333;font-size:14px;line-height:1.6;">
    <p style="margin:0 0 14px;">${greeting},</p>
    <p style="margin:0 0 14px;">vielen Dank für Ihren Vertragsabschluss bei Honorarfuchs.</p>
    <p style="margin:0 0 14px;">Damit wir Ihren Vertrag aktivieren und die monatliche Abrechnung einrichten können, benötigen wir noch Ihre SEPA-Bankverbindung.</p>
    <p style="margin:0 0 14px;"><strong>${couplingHtml}</strong></p>
    <div style="text-align:center;margin:26px 0;">
      <a href="${setupUrl}" target="_blank" rel="noopener noreferrer" style="background:#0b367f;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;text-decoration:none;display:inline-block;font-weight:bold;">Bankverbindung hinterlegen</a>
    </div>
    <p style="margin:0 0 14px;color:#555;">Die AGB finden Sie als PDF im Anhang dieser E-Mail sowie unter folgendem Link: <a href="${agbUrl}" target="_blank" rel="noopener noreferrer" style="color:#0b367f;">AGB öffnen</a>.</p>
    <p style="margin:0 0 14px;color:#555;">Sobald Sie das SEPA-Mandat hinterlegt haben, erhalten Sie in einer zweiten E-Mail Ihre Vertragsunterlagen.</p>
    <p style="margin:0 0 14px;color:#555;">Bei Fragen erreichen Sie uns unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a>.</p>
    <p style="margin:18px 0 0;">Mit freundlichen Grüßen<br/><strong>Ihr Honorarfuchs-Team</strong></p>
    <p style="margin:14px 0 0;color:#888;font-size:11px;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br/><a href="${setupUrl}" style="color:#0b367f;word-break:break-all;">${setupUrl}</a></p>
  </div>
  <div style="background:#f9fafb;padding:14px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">HFX Honorarfuchs — eine Marke der MCC Medical CareCapital GmbH</p>
  </div>
</div>
</body></html>`;
  const text = [
    `${greeting},`,
    "",
    "vielen Dank für Ihren Vertragsabschluss bei Honorarfuchs.",
    "",
    "Damit wir Ihren Vertrag aktivieren und die monatliche Abrechnung einrichten können, benötigen wir noch Ihre SEPA-Bankverbindung.",
    "",
    couplingText,
    "",
    `Bankverbindung hinterlegen: ${setupUrl}`,
    "",
    `Die AGB finden Sie im Anhang dieser E-Mail sowie unter: ${agbUrl}`,
    "",
    "Sobald Sie das SEPA-Mandat hinterlegt haben, erhalten Sie in einer zweiten E-Mail Ihre Vertragsunterlagen.",
    "",
    "Bei Fragen erreichen Sie uns unter info@hfx-honorarfuchs.de.",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Honorarfuchs-Team",
    "",
    "HFX Honorarfuchs — eine Marke der MCC Medical CareCapital GmbH",
  ].join("\n");
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-Role-Bypass: erlaubt internen Aufruf (z.B. qodia-initiate-booking)
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_V2") || Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!stripeKey || !resendKey) {
      return new Response(JSON.stringify({ error: "Missing STRIPE/RESEND key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { contract_id, force } = body as { contract_id?: string; force?: boolean };
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: cErr } = await admin
      .from("contracts").select("*").eq("id", contract_id).single();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotenz: Mail 1 nicht doppelt versenden, außer force=true
    if ((contract as any).mandate_email_sent_at && !force) {
      console.log(`[send-mandate-setup] Mail 1 bereits gesendet am ${(contract as any).mandate_email_sent_at} für Vertrag ${contract.id} – Skip (force=false)`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: "mandate_email_already_sent",
        mandate_email_sent_at: (contract as any).mandate_email_sent_at,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const recipient = (contract as any).rechnungs_email || contract.email;
    if (!recipient) {
      return new Response(JSON.stringify({ error: "Contract has no email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const resend = new Resend(resendKey);

    // 1) Stripe-Customer sicherstellen
    let stripeCustomerId = contract.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: contract.customer_name || [contract.vorname, contract.nachname].filter(Boolean).join(" ") || contract.praxis,
        email: recipient,
        metadata: {
          hfx_contract_id: contract.id,
          hfx_customer_number: contract.hfx_customer_number || "",
        },
      });
      stripeCustomerId = customer.id;
      await admin.from("contracts").update({ stripe_customer_id: stripeCustomerId } as any).eq("id", contract.id);

      // Multi-Standort Self-Heal: customers.stripe_customer_id idempotent (NULL-only) auffüllen
      if ((contract as any).customer_id) {
        try {
          await admin
            .from("customers")
            .update({ stripe_customer_id: stripeCustomerId } as any)
            .eq("id", (contract as any).customer_id)
            .is("stripe_customer_id", null);
        } catch (healEx) {
          console.warn("[send-mandate-setup] customers self-heal non-fatal:", String(healEx));
        }
      }
    }

    // 2) Setup-Session
    const setupSession = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId!,
      payment_method_types: ["sepa_debit"],
      success_url: `${APP_URL}/mandate-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/mandate-success?cancelled=1`,
      metadata: {
        source: "sepa_mandate_setup",
        contract_id: contract.id,
        hfx_customer_number: contract.hfx_customer_number || "",
      },
    });

    // 3) AGB auflösen (produktspezifisch mit generischem Fallback)
    const agb = await resolveAgbForCandidates(
      admin,
      APP_URL,
      [
        (contract as any).product_name,
        ...(Array.isArray((contract as any).modules) ? (contract as any).modules : []),
      ],
      "[send-mandate-setup]",
    );

    // 4) Mail 1 mit AGB-Anhang + Kopplungssatz
    const anrede = [contract.vorname, contract.nachname].filter(Boolean).join(" ").trim();
    const greeting = anrede ? `Sehr geehrte/r ${anrede}` : "Sehr geehrte Damen und Herren";
    const { html, text } = buildMandateSetupEmail({
      greeting,
      setupUrl: setupSession.url!,
      agbUrl: agb.downloadUrl,
    });

    const attachments = agb.base64
      ? [{ filename: agb.filename, content: agb.base64 }]
      : undefined;

    const sent = await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [recipient],
      subject: "Willkommen bei Honorarfuchs — bitte aktivieren Sie Ihren Vertrag",
      html,
      text,
      ...(attachments ? { attachments } : {}),
    });
    if ((sent as any)?.error) {
      console.error("[send-mandate-setup] Resend error:", (sent as any).error);
      throw new Error(String((sent as any).error?.message || (sent as any).error));
    }

    console.log(
      `[send-mandate-setup] AGB source=${agb.source}` +
        (agb.matchedProductName ? ` product="${agb.matchedProductName}"` : "") +
        ` attached=${!!attachments}`,
    );

    console.log(`[send-mandate-setup] Mail 1 sent to ${recipient} for contract ${contract.id}`);

    // Idempotenz-Marker setzen (auch bei force=true wird der Zeitpunkt aktualisiert)
    const { error: updErr } = await admin
      .from("contracts")
      .update({ mandate_email_sent_at: new Date().toISOString() } as any)
      .eq("id", contract.id);
    if (updErr) {
      console.error(`[send-mandate-setup] Failed to set mandate_email_sent_at for ${contract.id}:`, updErr);
    }

    return new Response(JSON.stringify({
      success: true,
      email: recipient,
      stripe_customer_id: stripeCustomerId,
      setup_url: setupSession.url,
      forced: !!force,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[send-mandate-setup] Error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
