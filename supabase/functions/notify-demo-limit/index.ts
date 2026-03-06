import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * notify-demo-limit
 *
 * Called by Qodia when a demo user has reached the 20-invoice limit.
 * Updates the demo record status to "limit_reached" and sets the test_phase_end
 * to today so the existing demo-reminder logic can pick it up.
 *
 * Auth: x-api-key header (same DEMO_IMPORT_API_KEY used by demo-import)
 *
 * Request body (JSON):
 *   { "hfx_customer_number": "HFX-D12345", "invoice_count"?: number }
 *
 * Response:
 *   { "success": true, "updated": true|false, "demo_id": "..." }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // API-Key auth
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("DEMO_IMPORT_API_KEY");

  if (!expectedKey) {
    return new Response(JSON.stringify({ error: "API key not configured on server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const hfxNumber = body.hfx_customer_number || body.hfx_kundennummer;
    const invoiceCount: number | null = body.invoice_count ?? null;

    if (!hfxNumber) {
      return new Response(
        JSON.stringify({ error: "hfx_customer_number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find active demo by HFX number
    const { data: demo, error: fetchError } = await supabase
      .from("demo_downloads")
      .select("id, status, test_phase_end, company_name, email, product_name")
      .eq("hfx_customer_number", hfxNumber)
      .eq("status", "testphase")
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!demo) {
      return new Response(
        JSON.stringify({ success: true, updated: false, reason: "No active testphase demo found for this HFX number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── This invoice-limit flow only applies to HFX GOÄ ─────────────────
    const GOÄ_PRODUCT_NAMES = [
      "HFX GOÄ - die KI für ihre Privatabrechnung",
      "HFX GOÄ",
    ];
    const isGoaeProduct = demo.product_name && GOÄ_PRODUCT_NAMES.some(
      (name) => demo.product_name.toLowerCase().includes("goä") || demo.product_name === name
    );

    if (!isGoaeProduct) {
      console.log(`[notify-demo-limit] Skipped: product '${demo.product_name}' is not HFX GOÄ. Invoice limit rule does not apply.`);
      return new Response(
        JSON.stringify({
          success: true,
          updated: false,
          reason: `Invoice limit flow is only applicable to HFX GOÄ products. Received product: '${demo.product_name}'`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Update: mark as limit_reached and set test_phase_end to today
    const { error: updateError } = await supabase
      .from("demo_downloads")
      .update({
        status: "limit_reached",
        test_phase_end: today,
        notes: demo.notes
          ? `${demo.notes}\n[Qodia] Rechnungslimit erreicht (${invoiceCount ?? 20} Rechnungen) am ${today}`
          : `[Qodia] Rechnungslimit erreicht (${invoiceCount ?? 20} Rechnungen) am ${today}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", demo.id);

    if (updateError) throw updateError;

    console.log(`[notify-demo-limit] Demo ${demo.id} (${hfxNumber}) marked as limit_reached. Invoices: ${invoiceCount ?? "n/a"}`);

    // ── Optional: send immediate reminder email via Resend ──────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    // Load email notification settings
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .eq("setting_key", "demo_expiry_customer_reminder");
    const customerReminderEnabled =
      (emailSettings ?? []).find((s: any) => s.setting_key === "demo_expiry_customer_reminder")?.is_enabled !== false;

    if (RESEND_API_KEY && demo.email && customerReminderEnabled) {
      // Build Stripe checkout URL if possible
      const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
        "HFX EBM": { price_id: "price_1T4HDh6v0qHdbOipecPqXas5", recurring: true },
        "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1T4HEl6v0qHdbOipmPO3EKHl", recurring: true },
        "HFX GOÄ/GOZ Live-Check": { price_id: "price_1T4HF76v0qHdbOipbBG04A5Q", recurring: false },
      };

      let stripeCheckoutUrl: string | null = null;
      if (STRIPE_SECRET_KEY && demo.product_name && STRIPE_PRODUCT_MAP[demo.product_name]) {
        try {
          const { default: Stripe } = await import("https://esm.sh/stripe@18.5.0");
          const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });
          const priceInfo = STRIPE_PRODUCT_MAP[demo.product_name];
          const session = await stripe.checkout.sessions.create({
            customer_email: demo.email,
            line_items: [{ price: priceInfo.price_id, quantity: 1 }],
            mode: priceInfo.recurring ? "subscription" : "payment",
            payment_method_types: ["card", "sepa_debit"],
            success_url: "https://praxisflow-buddy.lovable.app/demo-success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "https://praxisflow-buddy.lovable.app/demo-cancel",
            metadata: { source: "demo_limit_reached", demo_id: demo.id },
            subscription_data: priceInfo.recurring ? { metadata: { demo_id: demo.id } } : undefined,
          });
          stripeCheckoutUrl = session.url;
        } catch (e) {
          console.error("[notify-demo-limit] Stripe session error:", e);
        }
      }

      const ctaSection = stripeCheckoutUrl
        ? `<tr><td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0f7ff,#e8f0fe);border-radius:8px;border:1px solid #bfdbfe;">
              <tr><td style="padding:24px;">
                <p style="color:#1e40af;font-size:16px;font-weight:700;margin:0 0 8px;">🚀 Jetzt direkt weiterbuchen</p>
                <p style="color:#374151;font-size:14px;line-height:1.5;margin:0 0 16px;">
                  Gefällt Ihnen <strong>${demo.product_name}</strong>? Buchen Sie jetzt und nutzen Sie das Produkt weiter.
                </p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="background:#0b367f;border-radius:6px;padding:14px 28px;">
                    <a href="${stripeCheckoutUrl}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;display:block;">
                      ✅ Jetzt kostenpflichtig buchen →
                    </a>
                  </td></tr>
                </table>
                <p style="color:#6b7280;font-size:12px;margin:10px 0 0;">Sichere Zahlung per Kreditkarte oder SEPA-Lastschrift über Stripe.</p>
              </td></tr>
            </table>
          </td></tr>`
        : `<tr><td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.
            </p>
          </td></tr>`;

      const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 40px;text-align:center;">
            <p style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">HFX Honorarfuchs</p>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">Ihre Testphase ist abgelaufen</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">Guten Tag,</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Ihre kostenlose Testphase für <strong>${demo.product_name ?? "HFX-Produkt"}</strong> ist beendet –
              Sie haben das Limit von <strong>20 Testrechnungen</strong> erreicht.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="color:#856404;font-size:14px;font-weight:700;margin:0 0 4px;">ℹ️ Testphase abgelaufen</p>
                <p style="color:#533f03;font-size:13px;margin:0;">
                  Das kostenlose Kontingent von 20 Testrechnungen ist ausgeschöpft. Um weiterhin unbegrenzt Rechnungen zu erstellen, buchen Sie jetzt die Vollversion.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>
        ${ctaSection}
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          to: [demo.email],
          subject: `⚠️ Ihre Testphase für ${demo.product_name ?? "HFX"} ist abgelaufen`,
          html,
        }),
      });

      // Mark reminder as sent
      await supabase
        .from("demo_downloads")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", demo.id);

      console.log(`[notify-demo-limit] Limit-reached email sent to ${demo.email}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated: true,
        demo_id: demo.id,
        hfx_customer_number: hfxNumber,
        invoice_count: invoiceCount,
        email_sent: !!(RESEND_API_KEY && demo.email && customerReminderEnabled),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[notify-demo-limit] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
