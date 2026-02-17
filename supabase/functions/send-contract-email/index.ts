import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const LOGO_URL = "https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg";
const DEPARTMENT_EMAIL = "info@honorarfuchs.de";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const {
      email,
      salesPartnerEmail,
      departmentEmail,
      customerName,
      pdfBase64,
      products,
      startDate,
      hfxNumber,
      emailType,
    } = await req.json();

    if (!email && !salesPartnerEmail && !departmentEmail) {
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

    const detailsHtml = `
      <div style="background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">Vertragsdetails</h3>
        ${hfxNumber ? `<p><strong>Kundennummer:</strong> ${hfxNumber}</p>` : ""}
        ${products ? `<p><strong>Produkte:</strong> ${products}</p>` : ""}
        ${startDate ? `<p><strong>Vertragsbeginn:</strong> ${new Date(startDate).toLocaleDateString("de-DE")}</p>` : ""}
      </div>`;

    const isSignedNotification = emailType === "gezeichnet";
    const results: Record<string, any> = {};

    // --- Customer email ---
    if (email) {
      const customerSubject = isSignedNotification
        ? `Ihr Vertrag wurde eingereicht – ${products || "Honorarfuchs"}`
        : `Ihre Vertragsunterlagen – ${products || "Honorarfuchs"}`;
      const customerIntro = isSignedNotification
        ? `<p>vielen Dank! Ihr Vertrag wurde erfolgreich gezeichnet und zur Freigabe an unsere Vertragsabteilung weitergeleitet.</p>
           <p>Sie erhalten eine weitere Benachrichtigung, sobald der Vertrag aktiviert wurde. Anbei finden Sie Ihre Vertragsunterlagen als PDF.</p>`
        : `<p>vielen Dank für Ihr Vertrauen! Anbei erhalten Sie Ihre Vertragsunterlagen als PDF-Dokument.</p>
           <p>Bitte prüfen Sie die beigefügten Unterlagen sorgfältig. Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`;

      const customerHtml = `<!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
      </style></head><body><div class="container">
        <div class="header">
          <img src="${LOGO_URL}" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 28px;">${isSignedNotification ? "Vertrag eingereicht" : "Vertragsbestätigung"}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Honorarfuchs</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Sehr geehrte/r <strong>${customerName || "Kunde"}</strong>,</p>
          ${customerIntro}
          ${detailsHtml}
        </div>
        <div class="footer">
          <p style="margin: 0;">Bei Fragen wenden Sie sich bitte an Ihren Ansprechpartner.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
        </div>
      </div></body></html>`;

      results.customer = await resend.emails.send({
        from: "HFX Sales Portal <onboarding@resend.dev>",
        to: [email],
        subject: customerSubject,
        attachments: [attachment],
        html: customerHtml,
      });
      console.log("Customer email sent to:", email, results.customer);
    }

    // --- Sales partner email ---
    if (salesPartnerEmail) {
      const partnerSubject = isSignedNotification
        ? `Neuer Vertrag gezeichnet – ${customerName || "Kunde"} – ${products || "Honorarfuchs"}`
        : `Vertragskopie – ${customerName || "Neuer Kunde"} – ${products || "Honorarfuchs"}`;
      const partnerIntro = isSignedNotification
        ? `<p>ein neuer Vertrag wurde für <strong>${customerName || "einen Kunden"}</strong> gezeichnet und liegt nun zur Freigabe bei der Vertragsabteilung vor.</p>
           <p>Anbei finden Sie eine Kopie der Vertragsunterlagen für Ihre Unterlagen.</p>`
        : `<p>ein neuer Vertrag wurde erfolgreich für <strong>${customerName || "einen Kunden"}</strong> erstellt. Anbei finden Sie eine Kopie der Vertragsunterlagen für Ihre Unterlagen.</p>`;

      const partnerHtml = `<!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #b6193d, #d42050); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
      </style></head><body><div class="container">
        <div class="header">
          <img src="${LOGO_URL}" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 28px;">${isSignedNotification ? "Vertrag gezeichnet" : "Neuer Vertrag abgeschlossen"}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Vertriebspartner-Kopie</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Hallo,</p>
          ${partnerIntro}
          ${detailsHtml}
          <p>Diese E-Mail dient als Bestätigung. Das Vertragsdokument ist als PDF beigefügt.</p>
        </div>
        <div class="footer">
          <p style="margin: 0;">Dies ist eine automatische Benachrichtigung aus dem HFX Sales Portal.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
        </div>
      </div></body></html>`;

      results.partner = await resend.emails.send({
        from: "HFX Sales Portal <onboarding@resend.dev>",
        to: [salesPartnerEmail],
        subject: partnerSubject,
        attachments: [attachment],
        html: partnerHtml,
      });
      console.log("Partner email sent to:", salesPartnerEmail, results.partner);
    }

    // --- Department email (Vertragsabteilung) ---
    if (departmentEmail) {
      const deptHtml = `<!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
        .cta { display: inline-block; background: #b6193d; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0; }
        .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
      </style></head><body><div class="container">
        <div class="header">
          <img src="${LOGO_URL}" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 28px;">Neuer Vertrag zur Freigabe</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Vertragsabteilung</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Hallo Vertragsabteilung,</p>
          <p><strong>ein neuer Vertrag liegt zur Freigabe vor.</strong></p>
          <p>Der Vertrag für <strong>${customerName || "einen Kunden"}</strong> wurde gezeichnet und wartet auf Ihre Prüfung und Freigabe.</p>
          ${detailsHtml}
          <p>Das vollständige Vertragsdokument ist als PDF beigefügt. Bitte prüfen Sie die Unterlagen und geben Sie den Vertrag im Portal frei.</p>
        </div>
        <div class="footer">
          <p style="margin: 0;">Dies ist eine automatische Benachrichtigung aus dem HFX Sales Portal.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
        </div>
      </div></body></html>`;

      results.department = await resend.emails.send({
        from: "HFX Sales Portal <onboarding@resend.dev>",
        to: [departmentEmail],
        subject: `Neuer Vertrag zur Freigabe – ${customerName || "Kunde"} – ${hfxNumber || ""}`,
        attachments: [attachment],
        html: deptHtml,
      });
      console.log("Department email sent to:", departmentEmail, results.department);
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
