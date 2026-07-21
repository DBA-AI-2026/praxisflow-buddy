import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

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

const FALLBACK_CTA_TEXT =
  "Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.";

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

    // Find demo by HFX number – accept both testphase AND limit_reached
    // (Qodia may call this endpoint multiple times for the same user)
    const { data: demo, error: fetchError } = await supabase
      .from("demo_downloads")
      .select("id, status, test_phase_end, company_name, email, product_name, reminder_sent_at, notes")
      .eq("hfx_customer_number", hfxNumber)
      .in("status", ["testphase", "limit_reached"])
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!demo) {
      return new Response(
        JSON.stringify({ success: true, updated: false, reason: "No active demo found for this HFX number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Idempotency guard: email already sent → skip silently ────────────
    if (demo.reminder_sent_at) {
      console.log(`[notify-demo-limit] Email already sent for ${hfxNumber} at ${demo.reminder_sent_at} – skipping duplicate`);
      return new Response(
        JSON.stringify({
          success: true,
          updated: false,
          reason: "Email already sent",
          email_sent_at: demo.reminder_sent_at,
          demo_id: demo.id,
        }),
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
          ? `${demo.notes}\n[Qodia] Rechnungslimit erreicht (${invoiceCount ?? 200} Rechnungen) am ${today}`
          : `[Qodia] Rechnungslimit erreicht (${invoiceCount ?? 200} Rechnungen) am ${today}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", demo.id);

    if (updateError) throw updateError;

    console.log(`[notify-demo-limit] Demo ${demo.id} (${hfxNumber}) marked as limit_reached. Invoices: ${invoiceCount ?? "n/a"}`);

    // ── Optional: send immediate reminder email via Resend ──────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // Load email notification settings
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .eq("setting_key", "demo_expiry_customer_reminder");
    const customerReminderEnabled =
      (emailSettings ?? []).find((s: any) => s.setting_key === "demo_expiry_customer_reminder")?.is_enabled !== false;

    if (RESEND_API_KEY && demo.email && customerReminderEnabled) {
      const ctaSection = `<tr><td style="padding:0 0 24px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              ${FALLBACK_CTA_TEXT}
            </p>
          </td></tr>`;

      const bodyHtml = `<table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">Guten Tag,</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Ihr kostenloses Testkontingent für <strong>${demo.product_name ?? "HFX-Produkt"}</strong> ist aufgebraucht –
              Sie haben das Limit von <strong>200 Testrechnungen</strong> erreicht.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="color:#856404;font-size:14px;font-weight:700;margin:0 0 4px;">Testkontingent aufgebraucht</p>
                <p style="color:#533f03;font-size:13px;margin:0;">
                  Das kostenlose Kontingent von 200 Testrechnungen ist ausgeschöpft. Um weiterhin unbegrenzt Rechnungen zu erstellen, buchen Sie jetzt die Vollversion.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>
        ${ctaSection}
        <tr>
          <td style="padding:0;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>
      </table>`;

      const bodyText = [
        "Guten Tag,",
        "",
        `Ihr kostenloses Testkontingent für ${demo.product_name ?? "HFX-Produkt"} ist aufgebraucht – Sie haben das Limit von 200 Testrechnungen erreicht.`,
        "",
        FALLBACK_CTA_TEXT,
        "",
        "Mit freundlichen Grüßen,",
        "Ihr HFX Honorarfuchs Team",
      ].join("\n");

      const { html, text } = renderBrandedEmail({
        subheadline: "Ihr Testkontingent ist aufgebraucht",
        bodyHtml,
        bodyText,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          reply_to: "info@hfx-honorarfuchs.de",
          to: [demo.email],
          subject: `Ihr Testkontingent für ${demo.product_name ?? "HFX"} ist aufgebraucht`,
          html,
          text,
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
