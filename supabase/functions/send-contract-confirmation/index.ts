import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
  "HFX EBM": { price_id: "price_1T4HDh6v0qHdbOipecPqXas5", recurring: true },
  "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1T4HEl6v0qHdbOipmPO3EKHl", recurring: true },
  "HFX GOÄ/GOZ Live-Check": { price_id: "price_1T4HF76v0qHdbOipbBG04A5Q", recurring: false },
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { contract_id } = await req.json();
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load contract data
    const { data: contract, error: contractError } = await adminClient
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.email) {
      return new Response(JSON.stringify({ error: "Contract has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Stripe checkout session
    let stripeCheckoutUrl: string | null = null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const productName = contract.product_name;

    if (stripeKey && productName && STRIPE_PRODUCT_MAP[productName]) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const priceInfo = STRIPE_PRODUCT_MAP[productName];
        const session = await stripe.checkout.sessions.create({
          customer_email: contract.email,
          line_items: [{ price: priceInfo.price_id, quantity: 1 }],
          mode: priceInfo.recurring ? "subscription" : "payment",
          payment_method_types: ["card", "sepa_debit"],
          success_url: `${APP_URL}/vertrag-bestaetigen?status=success&contract_id=${contract.id}`,
          cancel_url: `${APP_URL}/vertrag-bestaetigen?status=cancelled`,
          metadata: {
            source: "paper_contract_confirmation",
            contract_id: contract.id,
          },
          subscription_data: priceInfo.recurring
            ? { metadata: { contract_id: contract.id } }
            : undefined,
        });
        stripeCheckoutUrl = session.url;
        console.log(`[send-contract-confirmation] Stripe session created: ${session.id}`);
      } catch (stripeErr) {
        console.error("[send-contract-confirmation] Stripe error:", stripeErr);
      }
    }

    const startDateFormatted = contract.start_date
      ? new Date(contract.start_date + "T00:00:00").toLocaleDateString("de-DE", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      : "–";

    const endDateFormatted = contract.end_date
      ? new Date(contract.end_date + "T00:00:00").toLocaleDateString("de-DE", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      : "–";

    const priceFormatted = contract.monthly_price
      ? `${Number(contract.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/Monat`
      : "–";

    // CTA block — only shown if Stripe URL is available
    const ctaBlock = stripeCheckoutUrl
      ? `
        <!-- Buchungs-CTA -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0b367f,#1a4a9e);border-radius:10px;overflow:hidden;">
              <tr><td style="padding:28px 32px;text-align:center;">
                <p style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.6;margin:0 0 20px;">
                  Ihr Außendienstmitarbeiter hat Ihren Vertragsabschluss vorbereitet.<br>
                  Bitte schließen Sie die Buchung verbindlich ab – Ihre Zahlung aktiviert den Vertrag automatisch.
                </p>
                <table cellpadding="0" cellspacing="0" align="center">
                  <tr><td style="background:#ffffff;border-radius:8px;padding:0;">
                    <a href="${stripeCheckoutUrl}"
                       style="display:block;padding:16px 40px;color:#0b367f;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                      Verbindlich buchen →
                    </a>
                  </td></tr>
                </table>
                <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:14px 0 0;">
                  Sichere Zahlung via Stripe · Kreditkarte oder SEPA-Lastschrift · SSL-verschlüsselt
                </p>
              </td></tr>
            </table>
          </td>
        </tr>`
      : `
        <!-- Hinweis ohne Stripe -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border-radius:8px;border:1px solid #fcd34d;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#92400e;font-size:14px;font-weight:600;margin:0 0 6px;">ℹ️ Zahlung wird manuell eingerichtet</p>
                <p style="color:#374151;font-size:13px;line-height:1.5;margin:0;">
                  Ihr Außendienstmitarbeiter wird sich in Kürze bei Ihnen melden, um die Zahlung einzurichten.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>`;

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihr HFX-Vertrag – jetzt verbindlich buchen</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Verdana,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:36px 40px;text-align:center;">
            <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;letter-spacing:-0.5px;">🦊 HFX Honorarfuchs</p>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">Ihr Vertrag wartet auf Ihre Buchung</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:36px 40px 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 12px;">Guten Tag${contract.vorname ? ` ${contract.vorname} ${contract.nachname || ""}` : ""},</p>
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
              wir haben Ihren Vertrag erhalten und für Sie vorbereitet. Mit einem Klick auf den Button unten schließen Sie die Buchung kostenpflichtig ab – Ihr Vertrag wird danach automatisch aktiviert.
            </p>
          </td>
        </tr>

        <!-- Contract Details Box -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="background:#0b367f;padding:12px 20px;">
                  <p style="color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0;">📋 Ihre Vertragsdetails</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${contract.hfx_customer_number ? `
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">HFX-Kundennummer</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;font-family:monospace;">${contract.hfx_customer_number}</td>
                    </tr>` : ""}
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Produkt</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${contract.product_name}</td>
                    </tr>
                    ${contract.praxis ? `
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Praxis</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;">${contract.praxis}</td>
                    </tr>` : ""}
                     <tr>
                       <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Monatspreis</td>
                       <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${priceFormatted}</td>
                     </tr>
                     <tr>
                       <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Kündigung</td>
                       <td style="padding:6px 0;font-size:13px;color:#111827;">Unbefristet · 6 Monate Frist zum Monatsende</td>
                     </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${ctaBlock}

        <!-- Sign-off -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">
              Bei Fragen stehen wir Ihnen gerne unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a> zur Verfügung.<br><br>
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.<br>
              © ${new Date().getFullYear()} HFX Honorarfuchs GmbH
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        to: [contract.email],
        subject: `Ihr HFX-Vertrag – jetzt verbindlich buchen${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("[send-contract-confirmation] Resend error:", err);
      throw new Error(`Email send failed: ${err}`);
    }

    console.log(`[send-contract-confirmation] Email sent to ${contract.email} for contract ${contract_id}`);

    return new Response(
      JSON.stringify({ success: true, email: contract.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-contract-confirmation] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
