import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { leadId, assignedToUserId } = await req.json();

    if (!leadId || !assignedToUserId) {
      return new Response(
        JSON.stringify({ error: "leadId and assignedToUserId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if manual assignment notification is enabled
    const { data: notifSetting } = await supabase
      .from("email_notification_settings")
      .select("is_enabled")
      .eq("setting_key", "lead_manual_assignment_notification")
      .maybeSingle();

    if (notifSetting?.is_enabled === false) {
      return new Response(
        JSON.stringify({ success: true, message: "Notification disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch AD profile (email + name)
    const { data: adProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", assignedToUserId)
      .maybeSingle();

    if (!adProfile?.email) {
      console.log("AD has no email address, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "AD has no email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adName = adProfile.full_name || adProfile.email;
    const adEmail = adProfile.email;

    const abrechnungLabel: Record<string, string> = {
      nein: "Kein Abrechnungszentrum",
      ja: "Ja",
      qodia: "Qodia",
      honorarplus: "HonorarPlus",
    };

    const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Lead zugewiesen</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#b6193d,#d42050);padding:32px 24px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#f9c0cc;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Lead-Zuweisung</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Dir wurde ein Interessent zugewiesen</h1>
        <p style="margin:8px 0 0;color:#f9c0cc;font-size:14px;">Manuelle Zuweisung durch das HFX-Team</p>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>${adName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          ein Interessent wurde dir manuell zugewiesen. Bitte nimm zeitnah Kontakt auf.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#fef2f4;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#b6193d;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:160px;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:700;">${lead.hfx_customer_number}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${lead.praxis_name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Name</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${lead.vorname} ${lead.nachname}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:5px 0;font-size:13px;color:#b6193d;">${lead.email}</td></tr>
              ${lead.mobilnummer ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${lead.mobilnummer}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ / Ort</td><td style="padding:5px 0;font-size:13px;color:#111827;">${lead.plz}${lead.ort ? ` ${lead.ort}` : ""}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Abrechnung</td><td style="padding:5px 0;font-size:13px;color:#111827;">${abrechnungLabel[lead.abrechnungszentrum] ?? lead.abrechnungszentrum}</td></tr>
              ${lead.mp_nummer ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">MP-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;">${lead.mp_nummer}</td></tr>` : ""}
              ${lead.nachricht ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;vertical-align:top;">Nachricht</td><td style="padding:5px 0;font-size:13px;color:#111827;font-style:italic;">${lead.nachricht}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:5px 0;font-size:13px;color:#111827;">${lead.status}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;background:#fafafa;border-left:3px solid #b6193d;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [adEmail],
      subject: `📋 Lead zugewiesen: ${lead.praxis_name} (${lead.plz})`,
      html,
      text: [
        `Hallo ${adName},`,
        "",
        "ein Interessent wurde dir manuell zugewiesen. Bitte nimm zeitnah Kontakt auf.",
        "",
        `HFX-Nummer: ${lead.hfx_customer_number}`,
        `Praxis: ${lead.praxis_name}`,
        `Name: ${lead.vorname} ${lead.nachname}`,
        `E-Mail: ${lead.email}`,
        lead.mobilnummer ? `Telefon: ${lead.mobilnummer}` : null,
        `PLZ / Ort: ${lead.plz}${lead.ort ? ` ${lead.ort}` : ""}`,
        lead.nachricht ? `Nachricht: ${lead.nachricht}` : null,
        "",
        "Den Lead findest du im HFX-Portal unter Interessenten.",
        "",
        "HFX Honorarfuchs",
      ].filter(Boolean).join("\n"),
    });

    console.log(`Assignment notification sent to ${adEmail} for lead ${lead.hfx_customer_number}`);

    return new Response(
      JSON.stringify({ success: true, message: `Notification sent to ${adEmail}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in notify-lead-assignment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
