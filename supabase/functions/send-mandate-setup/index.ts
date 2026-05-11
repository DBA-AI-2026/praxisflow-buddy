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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

function buildMandateSetupEmail(params: {
  greeting: string;
  setupUrl: string;
}): { html: string; text: string } {
  const { greeting, setupUrl } = params;
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
    <div style="text-align:center;margin:26px 0;">
      <a href="${setupUrl}" style="background:#0b367f;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;text-decoration:none;display:inline-block;font-weight:bold;">Bankverbindung hinterlegen</a>
    </div>
    <p style="margin:0 0 14px;color:#555;">Sobald Sie das SEPA-Mandat hinterlegt haben, erhalten Sie in einer zweiten E-Mail Ihre Vertragsunterlagen und die AGB.</p>
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
    `Bankverbindung hinterlegen: ${setupUrl}`,
    "",
    "Sobald Sie das SEPA-Mandat hinterlegt haben, erhalten Sie in einer zweiten E-Mail Ihre Vertragsunterlagen und die AGB.",
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

    const { contract_id } = await req.json();
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

    // 3) Mail 1 (ohne AGB-Anhang)
    const anrede = [contract.vorname, contract.nachname].filter(Boolean).join(" ").trim();
    const greeting = anrede ? `Sehr geehrte/r ${anrede}` : "Sehr geehrte Damen und Herren";
    const { html, text } = buildMandateSetupEmail({ greeting, setupUrl: setupSession.url! });

    const sent = await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [recipient],
      subject: "Willkommen bei Honorarfuchs — bitte aktivieren Sie Ihren Vertrag",
      html,
      text,
    });
    if ((sent as any)?.error) {
      console.error("[send-mandate-setup] Resend error:", (sent as any).error);
      throw new Error(String((sent as any).error?.message || (sent as any).error));
    }

    console.log(`[send-mandate-setup] Mail 1 sent to ${recipient} for contract ${contract.id}`);

    return new Response(JSON.stringify({
      success: true,
      email: recipient,
      stripe_customer_id: stripeCustomerId,
      setup_url: setupSession.url,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[send-mandate-setup] Error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
