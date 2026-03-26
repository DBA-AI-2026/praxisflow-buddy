import { Resend } from "npm:resend@2.0.0";

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

// Admin email address to receive notifications
const ADMIN_EMAIL = "info@honorarfuchs.de";

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

    // Send notification email to admin
    const emailResponse = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [ADMIN_EMAIL],
      subject: `Neue Zugangsanfrage: ${safeName}`,
      text: [
        "Neue Zugangsanfrage eingegangen:",
        "",
        `Name: ${safeName}`,
        `E-Mail: ${safeEmail}`,
        safeCompany ? `Firma: ${safeCompany}` : null,
        safeMessage ? `Nachricht: ${safeMessage}` : null,
        "",
        "Bitte im Admin-Portal anmelden, um die Anfrage zu bearbeiten.",
        "",
        "HFX Sales Portal",
      ].filter(Boolean).join("\n"),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .value { margin-top: 4px; font-size: 16px; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">🦊 Neue Zugangsanfrage</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">HFX Sales Portal</p>
            </div>
            <div class="content">
              <p>Eine neue Zugangsanfrage ist eingegangen:</p>
              <div class="field"><div class="label">Name</div><div class="value">${safeName}</div></div>
              <div class="field"><div class="label">E-Mail</div><div class="value">${safeEmail}</div></div>
              ${safeCompany ? `<div class="field"><div class="label">Firma</div><div class="value">${safeCompany}</div></div>` : ''}
              ${safeMessage ? `<div class="field"><div class="label">Nachricht</div><div class="value">${safeMessage}</div></div>` : ''}
              <div class="footer"><p>Bitte loggen Sie sich in das Admin-Portal ein, um die Anfrage zu bearbeiten.</p></div>
            </div>
          </div>
        </body>
        </html>
      `,
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
