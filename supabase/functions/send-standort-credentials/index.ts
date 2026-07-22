// Phase 2b — Standort-Zugangsdaten-Versand
// Sendet die Qodia-Zugangsdaten (E-Mail + Benutzername=-NN-HFX + Passwort) an die
// Standort-E-Mail. STRIKTE Grenzen:
//  - Nur über Standort-HFX (`-NN`). Nie Träger.
//  - KEIN auth.admin-Touch, KEIN leads-Touch.
//  - Passwort kommt unverändert aus contracts.generated_password (NIE neu erzeugen).
//  - Idempotenz weich: bei fehlendem generated_password -> 400 (Qodia-Registrierung fehlt).
//  - MAIL_SENT_CREDENTIALS wird vom Aufrufer erst nach erfolgreichem Send geloggt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isStandortHfx(hfx: string | null | undefined): boolean {
  if (!hfx) return false;
  return /^HFX-[A-Z0-9]+-\d{2}$/i.test(hfx);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const contractId = body?.contractId;
    if (!contractId || typeof contractId !== "string") {
      return json(400, { error: "contractId is required" });
    }

    const { data: contract, error: contractError } = await supabaseAdmin
      .from("contracts")
      .select(
        "id, hfx_customer_number, email, praxis, customer_name, generated_password, qodia_synced",
      )
      .eq("id", contractId)
      .maybeSingle();

    if (contractError || !contract) {
      return json(404, { error: "Contract not found" });
    }

    if (!isStandortHfx(contract.hfx_customer_number)) {
      return json(400, {
        error: "Vertrag ist kein Standort (-NN-HFX erforderlich).",
      });
    }

    if (!contract.email) {
      return json(400, { error: "Keine E-Mail-Adresse am Standort hinterlegt." });
    }

    if (!contract.generated_password) {
      return json(400, {
        error:
          "Kein gespeichertes Passwort am Vertrag. Bitte zuerst bei Qodia registrieren.",
      });
    }

    const praxisName = contract.praxis || contract.customer_name || "Ihre Praxis";

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
    const emailHtml = buildCredentialsEmailHtml({
      praxis_name: praxisName,
      email: contract.email,
      hfx_customer_number: contract.hfx_customer_number,
      generated_password: contract.generated_password,
    });

    await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [contract.email],
      subject: "Ihre Zugangsdaten – Honorarfuchs (Standort)",
      html: emailHtml,
      text: [
        `Hallo ${praxisName},`,
        "",
        "anbei Ihre Zugangsdaten für das Honorarfuchs-Portal (Standort):",
        "",
        `E-Mail-Adresse: ${contract.email}`,
        `Benutzername: ${contract.hfx_customer_number}`,
        `Passwort: ${contract.generated_password}`,
        "",
        "Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.",
        "",
        "--",
        "HFX Honorarfuchs – eine Marke der MCC Medical CareCapital GmbH",
        "Hohenzollernstr. 47 · 47799 Krefeld",
        "",
        "Geschäftsführer: Olaf Hagelkruys, Thilo Wiers-Keiser und Robbin Zielke",
        "Registergericht: Amtsgericht Krefeld · HRB 14709",
        "Umsatzsteueridentifikationsnummer gemäß §27a Umsatzsteuergesetz: DE 227 420 712",
        "",
        "© 2026 HFX Honorarfuchs · Bei Fragen: info@hfx-honorarfuchs.de",
      ].join("\n"),
    });

    console.log(
      `[send-standort-credentials] sent to ${contract.email} for ${contract.hfx_customer_number}`,
    );

    return json(200, {
      success: true,
      message: `Zugangsdaten an ${contract.email} gesendet.`,
    });
  } catch (err: any) {
    console.error("[send-standort-credentials] error:", err);
    return json(500, { error: err?.message || "Internal server error" });
  }
});

// ⚠ SYNCHRONIZE MIT resend-lead-credentials/index.ts (buildCredentialsEmailHtml).
// Etappe 2b duplicate; spätere Konsolidierung nach _shared offen.
function buildCredentialsEmailHtml(fields: {
  praxis_name: string;
  email: string;
  hfx_customer_number: string;
  generated_password: string;
}) {
  const { praxis_name, email, hfx_customer_number, generated_password } = fields;
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>
    <td bgcolor="#ffffff" style="background-color:#ffffff;padding:30px 40px;text-align:center;">
      <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/8270-Logo-RZ-Honorarfuchs-HFX.png" alt="HFX Honorarfuchs" style="display:block;max-width:280px;height:auto;margin:0 auto;border:0;" />
      <p style="color:#0b367f;font-size:11pt;margin:16px 0 0 0;">Ihre Zugangsdaten (Standort)</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px;">
      <p style="font-size:12pt;color:#333333;margin:0 0 16px 0;">Hallo <strong>${praxis_name}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">anbei Ihre Zugangsdaten für das Honorarfuchs-Portal an diesem Standort.</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff;border-radius:8px;border:1px solid #c8d8f0;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="font-size:10pt;color:#0b367f;font-weight:bold;text-transform:uppercase;margin:0 0 12px 0;">Ihre Zugangsdaten</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;width:140px;">E-Mail-Adresse</td>
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
      <p style="font-size:10pt;color:#888888;margin:0 0 8px 0;">Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.</p>
    </td>
  </tr>
  <tr>
    <td style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eeeeee;text-align:center;">
      <p style="font-size:9pt;color:#777777;margin:0 0 8px 0;line-height:1.5;">
        <strong>HFX Honorarfuchs &ndash; eine Marke der MCC Medical CareCapital GmbH</strong><br>
        Hohenzollernstr. 47 &middot; 47799 Krefeld
      </p>
      <p style="font-size:9pt;color:#777777;margin:0 0 8px 0;line-height:1.5;">
        Gesch&auml;ftsf&uuml;hrer: Olaf Hagelkruys, Thilo Wiers-Keiser und Robbin Zielke<br>
        Registergericht: Amtsgericht Krefeld &middot; HRB 14709<br>
        Umsatzsteueridentifikationsnummer gem&auml;&szlig; &sect;27a Umsatzsteuergesetz: DE 227 420 712
      </p>
      <p style="font-size:9pt;color:#aaaaaa;margin:8px 0 0 0;">&copy; 2026 HFX Honorarfuchs &middot; Bei Fragen: info@hfx-honorarfuchs.de</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
