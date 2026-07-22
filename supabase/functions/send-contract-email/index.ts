import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { salesPartnerEmail, customerName, pdfBase64, previewPdfBase64, products, startDate, hfxNumber } = await req.json();

    // Check email notification settings
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: emailSettings } = await supabaseAdmin
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .in("setting_key", ["contract_email_partner"]);
    const settingsMap = Object.fromEntries((emailSettings ?? []).map((s: any) => [s.setting_key, s.is_enabled]));
    const partnerEmailEnabled = settingsMap["contract_email_partner"] !== false;

    if (!salesPartnerEmail) {
      return new Response(
        JSON.stringify({ error: "salesPartnerEmail is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "PDF data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const attachment = {
      filename: `Vertrag-${hfxNumber || "HFX"}.pdf`,
      content: pdfBase64,
    };

    const attachments = [attachment];
    if (previewPdfBase64) {
      attachments.push({
        filename: `Produktvorschau-${hfxNumber || "HFX"}.pdf`,
        content: previewPdfBase64,
      });
    }

    const detailsHtml = `
      <div style="background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">Vertragsdetails</h3>
        ${hfxNumber ? `<p><strong>Kundennummer:</strong> ${hfxNumber}</p>` : ""}
        ${products ? `<p><strong>Produkte:</strong> ${products}</p>` : ""}
        ${startDate ? `<p><strong>Vertragsbeginn:</strong> ${new Date(startDate).toLocaleDateString("de-DE")}</p>` : ""}
      </div>`;

    const results: Record<string, any> = {};

    // --- Sales partner (AD self-copy) email ---
    if (salesPartnerEmail && partnerEmailEnabled) {
      const bodyHtml = `
        <p style="font-size: 16px;">Hallo,</p>
        <p>ein neuer Vertrag wurde erfolgreich für <strong>${customerName || "einen Kunden"}</strong> erstellt. Anbei finden Sie eine Kopie der Vertragsunterlagen für Ihre Unterlagen.</p>
        ${detailsHtml}
        <p>Diese E-Mail dient als Bestätigung des Vertragsabschlusses. Das Vertragsdokument ist als PDF beigefügt.</p>
      `;

      const bodyText = [
        "Hallo,",
        "",
        `ein neuer Vertrag wurde erfolgreich für ${customerName || "einen Kunden"} erstellt.`,
        "",
        hfxNumber ? `Kundennummer: ${hfxNumber}` : null,
        products ? `Produkte: ${products}` : null,
        startDate ? `Vertragsbeginn: ${new Date(startDate).toLocaleDateString("de-DE")}` : null,
        "",
        "Das Vertragsdokument ist als PDF beigefügt.",
      ].filter(Boolean).join("\n");

      const { html, text } = renderBrandedEmail({
        subheadline: "Ihre Vertragskopie",
        bodyHtml,
        bodyText,
      });

      results.partner = await resend.emails.send({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [salesPartnerEmail],
        subject: `Vertragskopie – ${customerName || "Neuer Kunde"} – ${products || "HFX"}`,
        attachments,
        html,
        text,
      });
      console.log("Partner email sent to:", salesPartnerEmail, results.partner);
    }


    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending contract email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
