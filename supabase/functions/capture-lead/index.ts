import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const ALLOWED_ORIGINS = [
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "https://www.honorarfuchs.de",
  "https://honorarfuchs.de",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      praxis_name,
      vorname,
      nachname,
      email,
      plz,
      mobilnummer,
      abrechnungszentrum,
      mp_nummer,
      nachricht,
    } = body;

    // Validate required fields
    if (!praxis_name || !vorname || !nachname || !email || !plz || !mobilnummer || !abrechnungszentrum) {
      return new Response(
        JSON.stringify({ error: "Fehlende Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Ungültige E-Mail-Adresse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate abrechnungszentrum values
    const validAbrechnungszentren = ["nein", "CareCapital", "privadis", "anderes"];
    if (!validAbrechnungszentren.includes(abrechnungszentrum)) {
      return new Response(
        JSON.stringify({ error: "Ungültiges Abrechnungszentrum" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MP-Nummer required for CareCapital and privadis
    if ((abrechnungszentrum === "CareCapital" || abrechnungszentrum === "privadis") && !mp_nummer) {
      return new Response(
        JSON.stringify({ error: "MP-Nummer ist bei CareCapital/privadis erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save to database using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        praxis_name: praxis_name.trim().slice(0, 200),
        vorname: vorname.trim().slice(0, 100),
        nachname: nachname.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 255),
        plz: plz.trim().slice(0, 10),
        mobilnummer: mobilnummer.trim().slice(0, 30),
        abrechnungszentrum,
        mp_nummer: mp_nummer?.trim().slice(0, 50) || null,
        nachricht: nachricht?.trim().slice(0, 2000) || null,
      })
      .select("id, hfx_customer_number")
      .single();

    if (insertError) {
      console.error("Error inserting lead:", insertError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Speichern" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Lead created: ${lead.hfx_customer_number} for ${email}`);

    // Send confirmation email via Resend
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);

        // Build conditional sections
        const mpSection = mp_nummer ? `<tr>
          <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Medizinpartner-Nummer (falls bekannt):</td>
          <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${mp_nummer}&nbsp;</td>
        </tr>` : "";

        const nachrichtSection = nachricht ? `<tr>
          <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nachricht:</td>
          <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${nachricht}&nbsp;</td>
        </tr>` : "";

        const emailHtml = `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
<tr><td align="center" valign="top" bgcolor="#ffffff">
<img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Mailheader-Neutral-hfx-1200px.png" alt="Honorarfuchs" width="600" height="80" border="0" style="border-width:0px;" />
</td></tr>
<tr><td bgcolor="#ffffff" align="center">
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600"><tbody><tr><td style="width:10px;"></td><td style="width:580px;">
<table align="center" border="0" cellpadding="0" cellspacing="0" width="580">
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="90">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#444444;">
<strong>Danke für Ihr Interesse am Honorarfuchs!<br>Entdecken Sie, was KI aus Ihrer Privatabrechnung holt.</strong>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="30">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung. Erkennen Sie Optimierungspotenziale, prüfen Sie Ihre Daten strukturiert und verschaffen Sie sich ein besseres Gefühl für Ihre Privatliquidation – ganz ohne Aufwand.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Das erwartet Sie:</strong><br>Einfacher Import Ihrer Abrechnungsdaten<br>Verständliche Analyse statt komplizierter Prüfung<br>Mehr Transparenz und Sicherheit bei der GOÄ-Abrechnung</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Sie nutzen noch kein Abrechnungszentrum?</strong><br>Für die Nutzung von HFX.GOÄ benötigen Sie eine PAD- oder PADnext-Datei. Wenn Ihnen das gerade nichts sagt, kümmern wir uns darum: Ein Mitarbeiter meldet sich zeitnah bei Ihnen und begleitet Sie Schritt für Schritt durch die technischen Voraussetzungen.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="80">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#444444;"><strong>Jetzt Testversion downloaden und starten!</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="5">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:10pt; line-height:12pt; color:#444444;">Sie benötigen dafür eine PAD/PAD.next-Schnittstelle.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="15">&nbsp;</td></tr>
<tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="580"><tr>
<td align="center" valign="top" width="290" style="padding: 10px;">
<a href="https://download.qodia.de/production/hfx/latest/mac/hfx-desktop.dmg" style="text-decoration:none; display:block;">
<table border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #6d6d6d; border-radius: 6px; width: 100%;"><tr><td align="center" style="padding: 15px 10px; height: 65px;">
<table border="0" cellpadding="0" cellspacing="0" align="center"><tr>
<td style="padding-right:10px;"><img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/apple-100.png" width="25" alt="MacOS" style="display:block; border:0; width:25px;"></td>
<td align="left" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:11pt; font-weight:bold; line-height:16pt;">Download MacOS</td>
</tr></table></td></tr></table></a></td>
<td align="center" valign="top" width="290" style="padding: 10px;">
<a href="https://download.qodia.de/production/hfx/latest/windows/hfx-desktop.exe" style="text-decoration:none; display:block;">
<table border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #6d6d6d; border-radius: 6px; width: 100%;"><tr><td align="center" style="padding: 15px 10px; height: 65px;">
<table border="0" cellpadding="0" cellspacing="0" align="center"><tr>
<td style="padding-right:10px;"><img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Windows.png" width="25" alt="Windows" style="display:block; border:0; width:25px;"></td>
<td align="left" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:11pt; font-weight:bold; line-height:16pt;">Download Windows</td>
</tr></table></td></tr></table></a></td>
</tr></table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="80">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#444444;"><strong>So funktioniert HFX.GOÄ</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;"><strong>Step 1: Vorbereitung – Daten bereitstellen</strong><br>Patientenverwaltungssystem kurz offline nehmen<br>PAD-Datei aus dem PVS exportieren<br><strong>→ Saubere Ausgangsbasis für die Analyse</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #acacac; padding-top:10px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;"><strong>Step 2: Import – Daten in HFX.GOÄ laden</strong><br>PAD-Datei hochladen<br>Keine Einrichtung notwendig<br><strong>→ Der Import erfolgt in wenigen Sekunden</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #acacac; padding-top:10px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;"><strong>Step 3: Analyse – Abrechnung prüfen lassen</strong><br>Analyse per Klick starten<br>Auffälligkeiten &amp; Potenziale erkennen<br><strong>→ Automatisiert, strukturiert, nachvollziehbar</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #acacac; padding-top:10px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;"><strong>Step 4: Entscheidung – Optimierungen bewerten</strong><br>Vorschläge prüfen<br>Entscheidungen selbst treffen<br>Keine automatischen Änderungen<br><strong>→ Sie behalten jederzeit die Kontrolle</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #acacac; padding-top:10px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;"><strong>Step 5: Abschluss – Optimierte Abrechnung übergeben</strong><br>Neue PAD-Datei speichern<br>Optional wieder ins PVS laden<br>Übergabe an ihr Abrechnungszentrum<br><strong>→ Abrechnung wie gewohnt – nur optimiert</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="30">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Alle Schritte erfolgen lokal und nachvollziehbar!<br>Sie behalten jederzeit die volle Kontrolle über Ihre Abrechnungsdaten.</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Folgende Daten haben Sie an uns übermittelt:</strong></td></tr>
<tr><td>
<table border="0" cellpadding="3" cellspacing="0" width="100%"><tbody>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Praxisdaten</strong></td>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"></td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Praxisname:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${praxis_name}&nbsp;</td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Vorname:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${vorname}&nbsp;</td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nachname:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${nachname}&nbsp;</td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">E-Mail:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${email}&nbsp;</td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">PLZ:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${plz}&nbsp;</td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Mobilnummer:</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${mobilnummer}&nbsp;</td>
</tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Abrechnungszentrum</strong></td>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"></td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nutzen Sie ein Abrechnungszentrum?</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${abrechnungszentrum}&nbsp;</td>
</tr>
${mpSection}
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Nachricht</strong></td>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"></td>
</tr>
${nachrichtSection}
</tbody></table>
</td></tr>
<tr><td align="center" valign="top" style="font-size:0; line-height:0;" height="120">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" align="center" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:10pt; font-weight:400;">
<img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/8270-Logo-RZ-Honorarfuchs-HFX-Claim.png" width="310" height="80" alt="Honorarfuchs" style="width:310px; height:80px;" />
</td></tr>
<tr><td bgcolor="#ffffff" align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr><td bgcolor="#f8f8f8" align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr><td bgcolor="#f8f8f8" align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:8pt; line-height:12pt; color:#444444;">
Honorarfuchs ist ein Produkt der MCC Medical CareCapital GmbH<br />Hohenzollernstr. 47 · 47799 Krefeld<br />
<a href="https://www.honorarfuchs.de" target="_blank"><strong style="color:#444444; font-weight:normal;">Zur Webseite</strong></a>
</td></tr>
<tr><td bgcolor="#f8f8f8" style="font-size:0; line-height:0;" height="18">&nbsp;</td></tr>
<tr><td bgcolor="#f8f8f8" align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:8pt; line-height:12pt; color:#444444;">
Geschäftsführer:<br />Olaf Hagelkruys, Thilo Wiers-Keiser und Robbin Zielke<br />Registergericht: Amtsgericht Krefeld · HRB 14709<br />Umsatzsteueridentifikationsnummer gemäß §27a Umsatzsteuergesetz: DE 227 420 712
</td></tr>
<tr><td bgcolor="#f8f8f8" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
</table>
</td><td style="width:10px;"></td></tr></tbody></table>
</td></tr>
</table>
</td></tr></table>`;

        await resend.emails.send({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          to: [email],
          subject: `Danke für Ihr Interesse am Honorarfuchs!`,
          html: emailHtml,
        });

        await supabase
          .from("leads")
          .update({ confirmation_email_sent: true })
          .eq("id", lead.id);

        console.log(`Confirmation email sent to ${email}`);
      }
    } catch (emailErr) {
      console.error("Error sending confirmation email:", emailErr);
      // Don't fail the request if email fails
    }

    // Sync to Salesforce (async, don't block response)
    try {
      const { data: sfConn } = await supabase
        .from("salesforce_connections")
        .select("access_token, instance_url, is_connected")
        .eq("id", "default")
        .maybeSingle();

      if (sfConn?.is_connected && sfConn.access_token && sfConn.instance_url) {
        const sfResponse = await fetch(`${sfConn.instance_url}/services/data/v59.0/sobjects/Lead`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sfConn.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Company: praxis_name,
            FirstName: vorname,
            LastName: nachname,
            Email: email,
            PostalCode: plz,
            MobilePhone: mobilnummer,
            Description: nachricht || "",
            LeadSource: "Website",
            MPID__c: mp_nummer || "",
          }),
        });

        if (sfResponse.ok) {
          const sfData = await sfResponse.json();
          await supabase
            .from("leads")
            .update({ salesforce_synced: true, salesforce_id: sfData.id })
            .eq("id", lead.id);
          console.log(`Lead synced to Salesforce: ${sfData.id}`);
        } else {
          const errText = await sfResponse.text();
          console.error("Salesforce sync failed:", errText);
        }
      }
    } catch (sfErr) {
      console.error("Salesforce sync error:", sfErr);
    }

    // TODO: Sync to Qodia API
    // TODO: Sync to HonorarPlus API

    return new Response(
      JSON.stringify({
        success: true,
        hfx_customer_number: lead.hfx_customer_number,
        message: "Ihre Anfrage wurde erfolgreich übermittelt.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in capture-lead:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
