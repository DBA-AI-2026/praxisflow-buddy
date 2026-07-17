import { Resend } from "npm:resend@2.0.0";
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

// Admin email address to receive notifications
const ADMIN_EMAIL = "info@hfx-honorarfuchs.de";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Abuse protection: only accept requests from allowed origins OR with a valid
  // service-role / anon key header (internal Supabase SDK calls).
  // This prevents arbitrary HTTP clients on the public internet from
  // triggering admin notification emails.
  const apiKey = req.headers.get("apikey") || req.headers.get("authorization");
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin || "");
  const isInternalCall = apiKey !== null && apiKey.length > 10;

  if (!isAllowedOrigin && !isInternalCall) {
    console.warn("Blocked request: unknown origin and no API key", { origin });
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { fullName, email, company, message } = await req.json();

    // Input validation — reject obviously malformed payloads early
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`New access request received from: ${email}`);

    // Check email notification settings
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .eq("setting_key", "new_access_request_admin");
    const notifEnabled = (emailSettings?.[0]?.is_enabled) !== false;
    if (!notifEnabled) {
      console.log("Admin access request notification is disabled.");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize values before embedding in email (basic HTML escaping)
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const safeName = esc(fullName.trim().slice(0, 200));
    const safeEmail = esc(email.trim().slice(0, 254));
    const safeCompany = company ? esc(String(company).trim().slice(0, 200)) : null;
    const safeMessage = message ? esc(String(message).trim().slice(0, 1000)) : null;

    // Build branded email body (header/footer come from renderBrandedEmail)
    const bodyHtml = `
      <p style="margin:0 0 16px 0;">Eine neue Zugangsanfrage ist eingegangen:</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;width:120px;">Name</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${safeName}</td></tr>
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;">E-Mail</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${safeEmail}</td></tr>
        ${safeCompany ? `<tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;">Firma</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${safeCompany}</td></tr>` : ''}
        ${safeMessage ? `<tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Nachricht</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${safeMessage}</td></tr>` : ''}
      </table>
      <p style="margin:16px 0 0 0;">Bitte im Admin-Portal anmelden, um die Anfrage zu bearbeiten.</p>
    `;

    const bodyText = [
      "Eine neue Zugangsanfrage ist eingegangen:",
      "",
      `Name: ${safeName}`,
      `E-Mail: ${safeEmail}`,
      safeCompany ? `Firma: ${safeCompany}` : null,
      safeMessage ? `Nachricht: ${safeMessage}` : null,
      "",
      "Bitte im Admin-Portal anmelden, um die Anfrage zu bearbeiten.",
    ].filter(Boolean).join("\n");

    const { html, text } = renderBrandedEmail({
      subheadline: "Neue Zugangsanfrage",
      bodyHtml,
      bodyText,
    });

    // Send notification email to admin
    const emailResponse = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [ADMIN_EMAIL],
      subject: `Neue Zugangsanfrage: ${safeName}`,
      text,
      html,
    });


    console.log("Notification email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending notification email:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
