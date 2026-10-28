import { Resend } from "npm:resend@4.8.0";
import { createClient } from "npm:@supabase/supabase-js@2";
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

// Admin email address to receive notifications
const ADMIN_EMAIL = "info@hfx-honorarfuchs.de";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Origin only selects CORS headers; authorization is the atomic DB claim below.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  try {
    const payload = await req.json().catch(() => null);
    const email = payload?.email;
    // Email is only a lookup key. Normalize exactly like submit_registration_request.
    if (typeof email !== "string" || email.trim().length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Check email notification settings
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .eq("setting_key", "new_access_request_admin");
    if (settingsError) throw new Error("Notification settings lookup failed");
    const notifEnabled = (emailSettings?.[0]?.is_enabled) !== false;
    if (!notifEnabled) {
      console.log("Admin access request notification is disabled.");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("Email not configured");
    const resend = new Resend(resendApiKey);
    const now = new Date();
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    // Atomic at-most-once claim. Pending/fresh/NULL conditions are evaluated in the UPDATE itself.
    // Never clear this timestamp on a mail error or uncertain outcome.
    const { data: request, error: claimError } = await supabase
      .from("registration_requests")
      .update({ notification_claimed_at: now.toISOString() })
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .gt("created_at", cutoff)
      .lte("created_at", now.toISOString())
      .is("notification_claimed_at", null)
      .select("id, full_name, email, company, message")
      .maybeSingle();
    if (claimError) throw new Error("Notification claim failed");
    if (!request) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize values before embedding in email (basic HTML escaping)
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const safeName = esc(request.full_name.trim().slice(0, 200));
    const safeEmail = esc(request.email.trim().slice(0, 254));
    const safeCompany = request.company ? esc(String(request.company).trim().slice(0, 200)) : null;
    const safeMessage = request.message ? esc(String(request.message).trim().slice(0, 1000)) : null;

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
    }, { idempotencyKey: `new-access-request-${request.id}` });

    if (emailResponse.error) {
      console.error("Access request notification failed:", emailResponse.error);
      throw new Error("Notification email failed");
    }
    console.log("Notification email sent successfully");

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
