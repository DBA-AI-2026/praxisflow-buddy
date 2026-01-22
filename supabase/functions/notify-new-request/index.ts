import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Admin email address to receive notifications
const ADMIN_EMAIL = "info@honorarfuchs.de";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fullName, email, company, message } = await req.json();

    console.log(`New access request received from: ${email}`);

    if (!fullName || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fullName and email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notification email to admin
    const emailResponse = await resend.emails.send({
      from: "HFX Sales Portal <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: `Neue Zugangsanfrage: ${fullName}`,
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
            .button { display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
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
              
              <div class="field">
                <div class="label">Name</div>
                <div class="value">${fullName}</div>
              </div>
              
              <div class="field">
                <div class="label">E-Mail</div>
                <div class="value">${email}</div>
              </div>
              
              ${company ? `
              <div class="field">
                <div class="label">Firma</div>
                <div class="value">${company}</div>
              </div>
              ` : ''}
              
              ${message ? `
              <div class="field">
                <div class="label">Nachricht</div>
                <div class="value">${message}</div>
              </div>
              ` : ''}
              
              <div class="footer">
                <p>Bitte loggen Sie sich in das Admin-Portal ein, um die Anfrage zu bearbeiten.</p>
              </div>
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
