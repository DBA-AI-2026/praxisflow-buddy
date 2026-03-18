import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
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

    const { email, salesPartnerEmail, customerName, pdfBase64, previewPdfBase64, products, startDate, hfxNumber } = await req.json();

    // Check email notification settings
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: emailSettings } = await supabaseAdmin
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .in("setting_key", ["contract_email_customer", "contract_email_partner"]);
    const settingsMap = Object.fromEntries((emailSettings ?? []).map((s: any) => [s.setting_key, s.is_enabled]));
    const customerEmailEnabled = settingsMap["contract_email_customer"] !== false;
    const partnerEmailEnabled = settingsMap["contract_email_partner"] !== false;

    if (!email && !salesPartnerEmail) {
      return new Response(
        JSON.stringify({ error: "At least one email address is required" }),
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
      filename: `Vertrag-${hfxNumber || "Honorarfuchs"}.pdf`,
      content: pdfBase64,
    };

    const attachments = [attachment];
    if (previewPdfBase64) {
      attachments.push({
        filename: `Produktvorschau-${hfxNumber || "Honorarfuchs"}.pdf`,
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

    // --- Customer email ---
    if (email && customerEmailEnabled) {
      const customerHtml = `<!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
      </style></head><body><div class="container">
        <div class="header">
          <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fuchs-bildmarke.png" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; background-color: #ffffff; padding: 4px; object-fit: contain; margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 28px;">Vertragsbestätigung</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Honorarfuchs</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Sehr geehrte/r <strong>${customerName || "Kunde"}</strong>,</p>
          <p>vielen Dank für Ihr Vertrauen! Anbei erhalten Sie Ihre Vertragsunterlagen als PDF-Dokument.</p>
          ${detailsHtml}
          <p>Bitte prüfen Sie die beigefügten Unterlagen sorgfältig. Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
        </div>
        <div class="footer">
          <p style="margin: 0;">Bei Fragen wenden Sie sich bitte an Ihren Ansprechpartner.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
        </div>
      </div></body></html>`;

      results.customer = await resend.emails.send({
        from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [email],
        subject: `Ihre Vertragsunterlagen – ${products || "Honorarfuchs"}`,
        attachments,
        html: customerHtml,
        text: [
          `Sehr geehrte/r ${customerName || "Kunde"},`,
          "",
          "vielen Dank für Ihr Vertrauen! Anbei erhalten Sie Ihre Vertragsunterlagen als PDF-Dokument.",
          "",
          hfxNumber ? `Kundennummer: ${hfxNumber}` : null,
          products ? `Produkte: ${products}` : null,
          startDate ? `Vertragsbeginn: ${new Date(startDate).toLocaleDateString("de-DE")}` : null,
          "",
          "Bitte prüfen Sie die beigefügten Unterlagen sorgfältig.",
          "Bei Fragen wenden Sie sich bitte an Ihren Ansprechpartner.",
          "",
          "© Honorarfuchs - HFX Sales Portal",
        ].filter(Boolean).join("\n"),
      });
      console.log("Customer email sent to:", email, results.customer);
    }

    // --- Sales partner email ---
    if (salesPartnerEmail && partnerEmailEnabled) {
      const partnerHtml = `<!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #b6193d, #d42050); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
      </style></head><body><div class="container">
        <div class="header">
          <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 28px;">Neuer Vertrag abgeschlossen</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Vertriebspartner-Kopie</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Hallo,</p>
          <p>ein neuer Vertrag wurde erfolgreich für <strong>${customerName || "einen Kunden"}</strong> erstellt. Anbei finden Sie eine Kopie der Vertragsunterlagen für Ihre Unterlagen.</p>
          ${detailsHtml}
          <p>Diese E-Mail dient als Bestätigung des Vertragsabschlusses. Das Vertragsdokument ist als PDF beigefügt.</p>
        </div>
        <div class="footer">
          <p style="margin: 0;">Dies ist eine automatische Benachrichtigung aus dem HFX Sales Portal.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
        </div>
      </div></body></html>`;

      results.partner = await resend.emails.send({
        from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [salesPartnerEmail],
        subject: `Vertragskopie – ${customerName || "Neuer Kunde"} – ${products || "Honorarfuchs"}`,
        attachments,
        html: partnerHtml,
        text: [
          "Hallo,",
          "",
          `ein neuer Vertrag wurde erfolgreich für ${customerName || "einen Kunden"} erstellt.`,
          "",
          hfxNumber ? `Kundennummer: ${hfxNumber}` : null,
          products ? `Produkte: ${products}` : null,
          startDate ? `Vertragsbeginn: ${new Date(startDate).toLocaleDateString("de-DE")}` : null,
          "",
          "Das Vertragsdokument ist als PDF beigefügt.",
          "",
          "© Honorarfuchs - HFX Sales Portal",
        ].filter(Boolean).join("\n"),
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
