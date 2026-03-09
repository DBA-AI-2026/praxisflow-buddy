import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify internal secret — only the cron scheduler (or admins) may call this
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  const incomingSecret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || incomingSecret !== CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // Find demos expiring in exactly 3 days (between tomorrow+2d 00:00 and tomorrow+2d 23:59)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const dateStr = targetDate.toISOString().split("T")[0];

    const { data: demos, error } = await supabase
      .from("demo_downloads")
      .select("*")
      .eq("test_phase_end", dateStr)
      .eq("status", "testphase")
      .is("reminder_sent_at", null)
      .not("email", "is", null);

    if (error) throw error;

    // Load email notification settings
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .in("setting_key", ["demo_expiry_customer_reminder", "demo_expiry_ad_notification"]);
    const settingsMap = Object.fromEntries((emailSettings ?? []).map((s: any) => [s.setting_key, s.is_enabled]));
    const customerReminderEnabled = settingsMap["demo_expiry_customer_reminder"] !== false;
    const adNotifEnabled = settingsMap["demo_expiry_ad_notification"] !== false;

    console.log(`Found ${demos?.length ?? 0} demos expiring on ${dateStr}`);

    let sent = 0;
    let failed = 0;

    // Stripe product map – must match src/lib/stripeProducts.ts
    const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
      "HFX EBM": { price_id: "price_1T4HDh6v0qHdbOipecPqXas5", recurring: true },
      "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1T4HEl6v0qHdbOipmPO3EKHl", recurring: true },
      "HFX GOÄ/GOZ Live-Check": { price_id: "price_1T4HF76v0qHdbOipbBG04A5Q", recurring: false },
    };

    for (const demo of demos ?? []) {
      const testEndFormatted = new Date(demo.test_phase_end + "T00:00:00").toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric"
      });

      // ── Build Stripe Checkout URL for this demo ─────────────────────────
      let stripeCheckoutUrl: string | null = null;
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && demo.product_name && STRIPE_PRODUCT_MAP[demo.product_name]) {
        try {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          const priceInfo = STRIPE_PRODUCT_MAP[demo.product_name];
          const checkoutSession = await stripe.checkout.sessions.create({
            customer_email: demo.email,
            line_items: [{ price: priceInfo.price_id, quantity: 1 }],
            mode: priceInfo.recurring ? "subscription" : "payment",
            payment_method_types: ["card", "sepa_debit"],
            success_url: "https://praxisflow-buddy.lovable.app/demo-success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "https://praxisflow-buddy.lovable.app/demo-cancel",
            metadata: {
              source: "demo_booking",
              demo_id: demo.id,
            },
            subscription_data: priceInfo.recurring ? { metadata: { demo_id: demo.id } } : undefined,
          });
          stripeCheckoutUrl = checkoutSession.url;
          console.log(`[demo-reminder] Stripe checkout session created for ${demo.id}: ${checkoutSession.id}`);
        } catch (stripeErr) {
          console.error("[demo-reminder] Failed to create Stripe session:", stripeErr);
        }
      }

      const ctaSection = stripeCheckoutUrl
        ? `
        <!-- Direct Booking CTA -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0f7ff,#e8f0fe);border-radius:8px;border:1px solid #bfdbfe;margin:0 0 24px;">
              <tr><td style="padding:24px;">
                <p style="color:#1e40af;font-size:16px;font-weight:700;margin:0 0 8px;">🚀 Jetzt direkt weiterbuchen</p>
                <p style="color:#374151;font-size:14px;line-height:1.5;margin:0 0 16px;">
                  Gefällt Ihnen <strong>${demo.product_name}</strong>? Buchen Sie jetzt direkt online und nutzen Sie das Produkt ohne Unterbrechung weiter.
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
          </td>
        </tr>`
        : `
        <!-- Fallback CTA (no Stripe price mapped) -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.
            </p>
          </td>
        </tr>`;

      const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 40px;text-align:center;">
            <p style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">HFX Honorarfuchs</p>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">Ihre Testphase läuft bald ab</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">Guten Tag${demo.contact_name ? ` ${demo.contact_name}` : ""},</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              wir möchten Sie daran erinnern, dass Ihre Testphase für <strong>${demo.product_name ?? "HFX-Produkt"}</strong>
              ${demo.company_name ? ` (${demo.company_name})` : ""} in <strong>3 Tagen</strong> – am <strong>${testEndFormatted}</strong> – abläuft.
            </p>
            <!-- Test phase info box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="color:#0b367f;font-size:13px;font-weight:700;margin:0 0 8px;">📋 Ihre Testphase</p>
                <p style="color:#374151;font-size:13px;margin:0;"><strong>Produkt:</strong> ${demo.product_name ?? "–"}</p>
                ${demo.hfx_customer_number ? `<p style="color:#374151;font-size:13px;margin:4px 0 0;"><strong>HFX-Nr.:</strong> ${demo.hfx_customer_number}</p>` : ""}
                <p style="color:#374151;font-size:13px;margin:4px 0 0;"><strong>Testende:</strong> ${testEndFormatted}</p>
              </td></tr>
            </table>
          </td>
        </tr>
        ${ctaSection}
        <!-- Sign off -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      if (!customerReminderEnabled) {
        console.log(`Customer reminder disabled, skipping customer email for ${demo.email}`);
      }

      const res = customerReminderEnabled ? await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          reply_to: "info@hfx-honorarfuchs.de",
          to: [demo.email],
          subject: `⏰ Erinnerung: Ihre Testphase endet am ${testEndFormatted}`,
          html,
          text: [
            `Guten Tag${demo.contact_name ? ` ${demo.contact_name}` : ""},`,
            "",
            `Ihre Testphase für ${demo.product_name ?? "HFX-Produkt"}${demo.company_name ? ` (${demo.company_name})` : ""} endet in 3 Tagen – am ${testEndFormatted}.`,
            "",
            `Produkt: ${demo.product_name ?? "–"}`,
            demo.hfx_customer_number ? `HFX-Nr.: ${demo.hfx_customer_number}` : null,
            `Testende: ${testEndFormatted}`,
            "",
            stripeCheckoutUrl
              ? `Jetzt direkt weiterbuchen: ${stripeCheckoutUrl}`
              : "Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.",
            "",
            "Mit freundlichen Grüßen,",
            "Ihr HFX Honorarfuchs Team",
          ].filter(Boolean).join("\n"),
        }),
      }) : { ok: true };

      if (res.ok) {
        if (customerReminderEnabled) sent++;
        console.log(`Reminder sent to ${demo.email} for demo ${demo.id}`);
        // Mark as sent to prevent duplicates
        await supabase
          .from("demo_downloads")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", demo.id);

        // ── Notify assigned AD (via PLZ mapping) ─────────────────────────
        const plzPrefix2 = demo.hfx_customer_number ? null : null; // fallback: look up AD by plz if available
        // For demo_downloads we don't have PLZ, so we look up by hfx_customer_number in leads table
        let adEmail: string | null = null;
        if (demo.hfx_customer_number) {
          const { data: leadData } = await supabase
            .from("leads")
            .select("plz, assigned_to")
            .eq("hfx_customer_number", demo.hfx_customer_number)
            .maybeSingle();
          if (leadData?.assigned_to) {
            const { data: adProfile } = await supabase
              .from("profiles")
              .select("email")
              .eq("user_id", leadData.assigned_to)
              .maybeSingle();
            if (adProfile?.email) adEmail = adProfile.email;
          }
          // fallback: plz_gebietsleiter_mapping if no assigned_to
          if (!adEmail && leadData?.plz) {
            const plz2 = leadData.plz.slice(0, 2);
            const plz1 = leadData.plz.slice(0, 1);
            const { data: mappings } = await supabase
              .from("plz_gebietsleiter_mapping")
              .select("gebietsleiter_id, plz_prefix")
              .eq("is_active", true)
              .in("plz_prefix", [plz2, plz1])
              .order("priority", { ascending: false });
            const bestMatch = mappings?.find(m => m.plz_prefix === plz2) ?? mappings?.find(m => m.plz_prefix === plz1) ?? null;
            if (bestMatch?.gebietsleiter_id) {
              const { data: gp } = await supabase.from("profiles").select("email").eq("user_id", bestMatch.gebietsleiter_id).maybeSingle();
              if (gp?.email) adEmail = gp.email;
            }
          }
        }

        if (adEmail) {
          const adHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Testphase läuft in 3 Tagen ab ⏰</h1>
        <p style="margin:8px 0 0;color:#c7d7f5;font-size:14px;">Jetzt Kontakt aufnehmen!</p>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          Die Testphase eines Interessenten aus Ihrem Gebiet endet in <strong style="color:#0b367f;">3 Tagen</strong> am <strong style="color:#0b367f;">${testEndFormatted}</strong>. Dies ist ein guter Zeitpunkt, um Kontakt aufzunehmen.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Interessent</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Unternehmen</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${demo.company_name}</td></tr>
              ${demo.contact_name ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Ansprechpartner</td><td style="padding:4px 0;font-size:13px;color:#111827;">${demo.contact_name}</td></tr>` : ""}
              ${demo.email ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:${demo.email}" style="color:#0b367f;">${demo.email}</a></td></tr>` : ""}
              ${demo.telefon ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="tel:${demo.telefon}" style="color:#0b367f;">${demo.telefon}</a></td></tr>` : ""}
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Produkt</td><td style="padding:4px 0;font-size:13px;color:#111827;">${demo.product_name ?? "–"}</td></tr>
              ${demo.hfx_customer_number ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">HFX-Nr.</td><td style="padding:4px 0;font-size:13px;color:#111827;font-family:monospace;">${demo.hfx_customer_number}</td></tr>` : ""}
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Testende</td><td style="padding:4px 0;font-size:13px;color:#0b367f;font-weight:600;">${testEndFormatted}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">Bitte nehmen Sie zeitnah Kontakt auf, um einen Abschluss zu begleiten.</p>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

          if (adNotifEnabled) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
              reply_to: "info@hfx-honorarfuchs.de",
              to: [adEmail],
              subject: `⏰ Testphase endet bald: ${demo.company_name} (${testEndFormatted})`,
              html: adHtml,
              text: [
                "Hallo,",
                "",
                `Die Testphase eines Interessenten aus Ihrem Gebiet endet in 3 Tagen am ${testEndFormatted}.`,
                "",
                `Unternehmen: ${demo.company_name}`,
                demo.contact_name ? `Ansprechpartner: ${demo.contact_name}` : null,
                demo.email ? `E-Mail: ${demo.email}` : null,
                demo.telefon ? `Telefon: ${demo.telefon}` : null,
                `Produkt: ${demo.product_name ?? "–"}`,
                demo.hfx_customer_number ? `HFX-Nr.: ${demo.hfx_customer_number}` : null,
                `Testende: ${testEndFormatted}`,
                "",
                "Bitte nehmen Sie zeitnah Kontakt auf.",
                "",
                "HFX Honorarfuchs",
              ].filter(Boolean).join("\n"),
            }),
          });
          console.log(`AD reminder sent to ${adEmail} for demo ${demo.id}`);
          } // end adNotifEnabled
        }
      } else {
        failed++;
        const err = await res.text();
        console.error(`Failed to send to ${demo.email}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, checked: demos?.length ?? 0, date: dateStr }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
