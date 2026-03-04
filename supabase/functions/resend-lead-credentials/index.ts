import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Verify caller is authenticated and has a valid role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!lead.generated_password) {
      return new Response(JSON.stringify({ error: "Kein gespeichertes Passwort für diesen Lead vorhanden." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    const emailHtml = buildCredentialsEmailHtml({
      praxis_name: lead.praxis_name,
      vorname: lead.vorname,
      nachname: lead.nachname,
      email: lead.email,
      hfx_customer_number: lead.hfx_customer_number,
      generated_password: lead.generated_password,
    });

    await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      to: [lead.email],
      subject: "Ihre Zugangsdaten – Honorarfuchs (erneute Zusendung)",
      html: emailHtml,
    });

    console.log(`Credentials manually resent for lead ${lead.hfx_customer_number} to ${lead.email}`);

    return new Response(
      JSON.stringify({ success: true, message: `Zugangsdaten wurden erneut an ${lead.email} gesendet.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildCredentialsEmailHtml(fields: {
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  hfx_customer_number: string;
  generated_password: string;
}) {
  const { praxis_name, vorname, nachname, email, hfx_customer_number, generated_password } = fields;
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr>
    <td style="background-color:#0b367f;padding:30px 40px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22pt;margin:0;font-family:verdana,geneva,sans-serif;">🦊 Honorarfuchs</h1>
      <p style="color:#c8d8f0;font-size:11pt;margin:8px 0 0 0;">Ihre Zugangsdaten (erneute Zusendung)</p>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 40px;">
      <p style="font-size:12pt;color:#333333;margin:0 0 16px 0;">Hallo <strong>${vorname} ${nachname}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">auf Wunsch senden wir Ihnen Ihre Zugangsdaten für das Honorarfuchs-Portal erneut zu.</p>

      <!-- Credentials Box -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff;border-radius:8px;border:1px solid #c8d8f0;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="font-size:10pt;color:#0b367f;font-weight:bold;text-transform:uppercase;margin:0 0 12px 0;">Ihre Zugangsdaten</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;width:140px;">Registrierte E-Mail-Adresse</td>
                <td style="padding:6px 0;font-size:11pt;color:#333333;">${email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;">Benutzername</td>
                <td style="padding:6px 0;font-size:11pt;color:#0b367f;font-weight:bold;font-family:monospace;">${hfx_customer_number}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;">Passwort</td>
                <td style="padding:6px 0;font-size:11pt;color:#0b367f;font-weight:bold;font-family:monospace;">${generated_password}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="font-size:10pt;color:#888888;margin:0 0 8px 0;">
        Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.
      </p>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background-color:#f8f8f8;padding:16px 40px;border-top:1px solid #eeeeee;text-align:center;">
      <p style="font-size:9pt;color:#aaaaaa;margin:0;">© Honorarfuchs GmbH · Bei Fragen: info@honorarfuchs.de</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
