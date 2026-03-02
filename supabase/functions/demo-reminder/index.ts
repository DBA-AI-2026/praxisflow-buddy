import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // Find demos expiring in exactly 3 days (between tomorrow+2d 00:00 and tomorrow+2d 23:59)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const dateStr = targetDate.toISOString().split("T")[0];

    const { data: demos, error } = await supabase
      .from("demo_downloads")
      .select("*")
      .eq("test_phase_end", dateStr)
      .eq("status", "testphase")
      .is("reminder_sent_at", null)
      .not("email", "is", null);

    if (error) throw error;

    console.log(`Found ${demos?.length ?? 0} demos expiring on ${dateStr}`);

    let sent = 0;
    let failed = 0;

    for (const demo of demos ?? []) {
      const testEndFormatted = new Date(demo.test_phase_end + "T00:00:00").toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric"
      });

      const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 40px;text-align:center;">
            <p style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">HFX Honorarfuchs</p>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">Ihre Testphase läuft bald ab</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">Guten Tag${demo.contact_name ? ` ${demo.contact_name}` : ""},</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              wir möchten Sie daran erinnern, dass Ihre Testphase für <strong>${demo.product_name ?? "HFX-Produkt"}</strong>
              ${demo.company_name ? ` (${demo.company_name})` : ""} in <strong>3 Tagen</strong> – am <strong>${testEndFormatted}</strong> – abläuft.
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Wir hoffen, dass Sie von den Möglichkeiten unserer Software überzeugt sind. Gerne beraten wir Sie jetzt über die nächsten Schritte und ein passendes Angebot für Ihre Praxis.
            </p>
            <!-- CTA Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#0b367f;font-size:14px;font-weight:700;margin:0 0 8px;">📋 Ihre Testphase</p>
                <p style="color:#374151;font-size:14px;margin:0;"><strong>Produkt:</strong> ${demo.product_name ?? "–"}</p>
                ${demo.hfx_customer_number ? `<p style="color:#374151;font-size:14px;margin:4px 0 0;"><strong>HFX-Nr.:</strong> ${demo.hfx_customer_number}</p>` : ""}
                <p style="color:#374151;font-size:14px;margin:4px 0 0;"><strong>Testende:</strong> ${testEndFormatted}</p>
              </td></tr>
            </table>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          to: [demo.email],
          subject: `⏰ Erinnerung: Ihre Testphase endet am ${testEndFormatted}`,
          html,
        }),
      });

      if (res.ok) {
        sent++;
        console.log(`Reminder sent to ${demo.email} for demo ${demo.id}`);
        // Mark as sent to prevent duplicates
        await supabase
          .from("demo_downloads")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", demo.id);
      } else {
        failed++;
        const err = await res.text();
        console.error(`Failed to send to ${demo.email}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, checked: demos?.length ?? 0, date: dateStr }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
