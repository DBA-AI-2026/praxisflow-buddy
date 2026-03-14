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

  try {
    const { fullName, email, company, message } = await req.json();

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
      return new Response(JSON.stringify({ success: true, skipped: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!fullName || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fullName and email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notification email to admin
    const emailResponse = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [ADMIN_EMAIL],
      subject: `Neue Zugangsanfrage: ${fullName}`,
      text: [
        "Neue Zugangsanfrage eingegangen:",
        "",
        `Name: ${fullName}`,
        `E-Mail: ${email}`,
        company ? `Firma: ${company}` : null,
        message ? `Nachricht: ${message}` : null,
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
              <div class="field"><div class="label">Name</div><div class="value">${fullName}</div></div>
              <div class="field"><div class="label">E-Mail</div><div class="value">${email}</div></div>
              ${company ? `<div class="field"><div class="label">Firma</div><div class="value">${company}</div></div>` : ''}
              ${message ? `<div class="field"><div class="label">Nachricht</div><div class="value">${message}</div></div>` : ''}
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
