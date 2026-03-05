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
  // Server-to-server requests (no origin header) are allowed
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    };
  }
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  if (!allowedOrigin) {
    return null; // Origin not allowed
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Maps CF7 to Webhook / CF7 to Any API field names to our internal format.
 * Supports multiple common CF7 field naming conventions.
 */
function mapCf7Fields(body: Record<string, any>): Record<string, any> {
  // If the body already has our expected field names, return as-is
  if (body.praxis_name && body.vorname && body.nachname) {
    return body;
  }

  // CF7 to Webhook wraps data in various ways depending on plugin config
  // Check for nested "data" or "fields" wrapper
  const data = body.data || body.fields || body;

  return {
    praxis_name: data.praxis_name || data["praxis-name"] || data["your-praxis"] || data.praxisname || data.company || data.firma || "",
    vorname: data.vorname || data["your-vorname"] || data["first-name"] || data.firstname || data.first_name || "",
    nachname: data.nachname || data["your-nachname"] || data["last-name"] || data.lastname || data.last_name || data["your-name"] || "",
    email: data.email || data["your-email"] || data.mail || "",
    plz: data.plz || data["your-plz"] || data.postleitzahl || data.zip || data.postal_code || "",
    mobilnummer: data.mobilnummer || data["your-mobilnummer"] || data.telefon || data.phone || data.tel || data["your-tel"] || data.mobile || "",
    abrechnungszentrum: data.abrechnungszentrum || data["your-abrechnungszentrum"] || data.abrechnung || "nein",
    mp_nummer: data.mp_nummer || data["your-mp-nummer"] || data.mp_nr || data.mpnummer || null,
    nachricht: data.nachricht || data["your-message"] || data.message || null,
    adresse: data.adresse || data["your-adresse"] || data.strasse || data.street || data.address || null,
    ort: data.ort || data["your-ort"] || data.city || data.stadt || null,
  };
}

/**
 * Generates a secure random password (12 chars: uppercase, lowercase, digits, special).
 */
function generatePassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);

  // Ensure at least one of each category
  const result = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    special[arr[3] % special.length],
  ];

  for (let i = 4; i < length; i++) {
    result.push(all[arr[i] % all.length]);
  }

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
}

function buildConfirmationEmailHtml(fields: {
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  plz: string;
  mobilnummer: string;
  abrechnungszentrum: string;
  mp_nummer?: string | null;
  nachricht?: string | null;
  hfx_customer_number: string;
  generated_password: string;
}): string {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum, mp_nummer, nachricht, hfx_customer_number, generated_password } = fields;

  const mpSection = mp_nummer ? `<tr>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Medizinpartner-Nummer (falls bekannt):</td>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${mp_nummer}&nbsp;</td>
  </tr>` : "";

  const nachrichtSection = nachricht ? `<tr>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nachricht:</td>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${nachricht}&nbsp;</td>
  </tr>` : "";

  return `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
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
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="30">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Ihre Zugangsdaten für HFX.GOÄ:</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8; border-radius:8px; border:1px solid #d0d5dd;">
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;">
<strong>Registrierte E-Mail-Adresse:</strong> ${email}<br>
<strong>Benutzername:</strong> ${hfx_customer_number}<br>
<strong>Passwort:</strong> <code style="background:#fff; padding:2px 8px; border-radius:4px; font-size:13pt; letter-spacing:1px;">${generated_password}</code>
</td>
</tr>
</table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#888888; font-family:verdana, geneva, sans-serif; font-size:10pt; line-height:14pt;"><em>Bitte bewahren Sie diese Zugangsdaten sicher auf. Sie benötigen sie für die Anmeldung in HFX.GOÄ.</em></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
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
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#0b367f;"><strong>So funktioniert HFX.GOÄ</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="6">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:10pt; color:#888888;">In 5 einfachen Schritten zur optimierten Abrechnung</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding-bottom:10px;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">1</div></td><td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;"><strong style="color:#0b367f;">Vorbereitung – Daten bereitstellen</strong><br>Patientenverwaltungssystem kurz offline nehmen<br>PAD-Datei aus dem PVS exportieren<br><span style="color:#0b367f;">→ Saubere Ausgangsbasis für die Analyse</span></td></tr></table></td></tr>
<tr><td style="padding-bottom:10px;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">2</div></td><td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;"><strong style="color:#0b367f;">Import – Daten in HFX.GOÄ laden</strong><br>PAD-Datei hochladen<br>Keine Einrichtung notwendig<br><span style="color:#0b367f;">→ Der Import erfolgt in wenigen Sekunden</span></td></tr></table></td></tr>
<tr><td style="padding-bottom:10px;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">3</div></td><td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;"><strong style="color:#0b367f;">Analyse – Abrechnung prüfen lassen</strong><br>Analyse per Klick starten<br>Auffälligkeiten &amp; Potenziale erkennen<br><span style="color:#0b367f;">→ Automatisiert, strukturiert, nachvollziehbar</span></td></tr></table></td></tr>
<tr><td style="padding-bottom:10px;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">4</div></td><td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;"><strong style="color:#0b367f;">Entscheidung – Optimierungen bewerten</strong><br>Vorschläge prüfen &amp; Entscheidungen selbst treffen<br>Keine automatischen Änderungen<br><span style="color:#0b367f;">→ Sie behalten jederzeit die Kontrolle</span></td></tr></table></td></tr>
<tr><td style="padding-bottom:0;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">5</div></td><td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;"><strong style="color:#0b367f;">Abschluss – Optimierte Abrechnung übergeben</strong><br>Neue PAD-Datei speichern &amp; optional ins PVS laden<br>Übergabe an Ihr Abrechnungszentrum<br><span style="color:#0b367f;">→ Abrechnung wie gewohnt – nur optimiert</span></td></tr></table></td></tr>
</table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="background:#0b367f; border-radius:8px; padding:14px 20px; color:#ffffff; font-family:verdana, geneva, sans-serif; font-size:11pt; line-height:18pt;"><strong>Alle Schritte erfolgen lokal und nachvollziehbar!<br>Sie behalten jederzeit die volle Kontrolle über Ihre Abrechnungsdaten.</strong></td></tr>
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
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Block browser requests from unknown origins
  if (origin && !corsHeaders) {
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers = corsHeaders || {};

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const rawBody = await req.json();
    
    // Log source for debugging
    const source = origin ? `browser:${origin}` : "server-to-server";
    console.log(`Lead request from: ${source}`);
    console.log(`Raw body received:`, JSON.stringify(rawBody));

    // Map CF7 field names to our internal format
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
      adresse,
      ort,
    } = mapCf7Fields(rawBody);

    // Validate required fields (mobilnummer is optional – website form may omit it)
    if (!praxis_name || !vorname || !nachname || !email || !plz || !abrechnungszentrum) {
      return new Response(
        JSON.stringify({ error: "Fehlende Pflichtfelder", details: { praxis_name: !!praxis_name, vorname: !!vorname, nachname: !!nachname, email: !!email, plz: !!plz, abrechnungszentrum: !!abrechnungszentrum } }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Ungültige E-Mail-Adresse" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Validate abrechnungszentrum values
    const validAbrechnungszentren = ["nein", "CareCapital", "privadis", "anderes"];
    if (!validAbrechnungszentren.includes(abrechnungszentrum)) {
      return new Response(
        JSON.stringify({ error: "Ungültiges Abrechnungszentrum" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // MP-Nummer validation: must be exactly 5 digits if provided
    if (mp_nummer && !/^\d{5}$/.test(mp_nummer.trim())) {
      return new Response(
        JSON.stringify({ error: "MP-Nummer muss genau 5-stellig sein (nur Ziffern)" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // MP-Nummer required for CareCapital and privadis
    if ((abrechnungszentrum === "CareCapital" || abrechnungszentrum === "privadis") && !mp_nummer) {
      return new Response(
        JSON.stringify({ error: "MP-Nummer ist bei CareCapital/privadis erforderlich" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Save to database using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if email already exists
    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, hfx_customer_number, generated_password, praxis_name, vorname, nachname")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLead) {
      console.log(`Duplicate registration attempt for ${normalizedEmail}, resending credentials for ${existingLead.hfx_customer_number}`);

      // Resend existing credentials
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const existingPassword = existingLead.generated_password || "(gespeichertes Passwort nicht verfügbar)";
          const emailHtml = buildConfirmationEmailHtml({
            praxis_name: existingLead.praxis_name,
            vorname: existingLead.vorname,
            nachname: existingLead.nachname,
            email: normalizedEmail,
            plz,
            mobilnummer,
            abrechnungszentrum,
            mp_nummer,
            nachricht,
            hfx_customer_number: existingLead.hfx_customer_number,
            generated_password: existingPassword,
          });

          await resend.emails.send({
            from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
            to: [normalizedEmail],
            subject: `Ihre bestehenden Zugangsdaten – Honorarfuchs`,
            html: emailHtml,
          });
          console.log(`Existing credentials resent to ${normalizedEmail}`);
        }
      } catch (emailErr) {
        console.error("Error resending credentials:", emailErr);
      }

      // Increment registration_attempts counter
      await supabase
        .from("leads")
        .update({ registration_attempts: (existingLead.registration_attempts ?? 1) + 1 })
        .eq("id", existingLead.id);

      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          hfx_customer_number: existingLead.hfx_customer_number,
          message: "Ein Konto mit dieser E-Mail-Adresse existiert bereits. Ihre Zugangsdaten wurden erneut zugesendet.",
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Generate password for Qodia access
    const generatedPassword = generatePassword(12);

    // Auto-assign Gebietsleiter based on PLZ prefix
    // Tries 2-digit match first (more specific), then falls back to 1-digit.
    // Among matches of the same prefix length, highest priority wins.
    let assignedTo: string | null = null;
    let assignedName: string | null = null;
    try {
      const plzClean = plz.trim().replace(/\s/g, "");
      if (plzClean.length >= 1) {
        const prefix2 = plzClean.substring(0, 2);
        const prefix1 = plzClean.substring(0, 1);
        const prefixes = plzClean.length >= 2 ? [prefix2, prefix1] : [prefix1];

        const { data: mappings } = await supabase
          .from("plz_gebietsleiter_mapping")
          .select("gebietsleiter_id, gebietsleiter_name, plz_prefix, priority")
          .eq("is_active", true)
          .in("plz_prefix", prefixes)
          .order("priority", { ascending: false });

        // Prefer 2-digit match over 1-digit (more specific wins regardless of priority)
        const bestMatch =
          mappings?.find((m) => m.plz_prefix === prefix2) ??
          mappings?.find((m) => m.plz_prefix === prefix1) ??
          null;

        if (bestMatch?.gebietsleiter_id) {
          assignedTo = bestMatch.gebietsleiter_id;
          assignedName = bestMatch.gebietsleiter_name;
          console.log(`Lead PLZ ${plzClean} → assigned to ${assignedName} (prefix: ${bestMatch.plz_prefix})`);
        } else {
          console.log(`No GL mapping found for PLZ ${plzClean} (tried prefixes: ${prefixes.join(", ")})`);
        }
      }
    } catch (plzErr) {
      console.error("PLZ mapping lookup error:", plzErr);
    }

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        praxis_name: praxis_name.trim().slice(0, 200),
        vorname: vorname.trim().slice(0, 100),
        nachname: nachname.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 255),
        plz: plz.trim().slice(0, 10),
        mobilnummer: (mobilnummer || "").trim().slice(0, 30),
        abrechnungszentrum,
        mp_nummer: mp_nummer?.trim().slice(0, 50) || null,
        nachricht: nachricht?.trim().slice(0, 2000) || null,
        adresse: adresse?.trim().slice(0, 300) || null,
        ort: ort?.trim().slice(0, 100) || null,
        generated_password: generatedPassword,
        assigned_to: assignedTo,
      })
      .select("id, hfx_customer_number")
      .single();

    if (insertError) {
      console.error("Error inserting lead:", insertError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Speichern" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    console.log(`Lead created: ${lead.hfx_customer_number} for ${email}`);

    // Send confirmation email via Resend
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const emailHtml = buildConfirmationEmailHtml({ praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum, mp_nummer, nachricht, hfx_customer_number: lead.hfx_customer_number, generated_password: generatedPassword });

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

    // Sync to Qodia (HFX-Nummer + Passwort)
    try {
      const QODIA_SIGNUP_URL = "https://auth.qodia.de/api/external/sign-up";
      const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
      const qodiaResponse = await fetch(QODIA_SIGNUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(qodiaApiKey ? { "x-api-key": qodiaApiKey } : {}),
        },
        body: JSON.stringify({
          email: email,
          password: generatedPassword,
          name: lead.hfx_customer_number,
        }),
      });

      if (qodiaResponse.ok) {
        await supabase.from("leads").update({ qodia_synced: true }).eq("id", lead.id);
        console.log(`Lead synced to Qodia: ${lead.hfx_customer_number}`);
      } else {
        const errText = await qodiaResponse.text();
        console.error(`Qodia sync failed (${qodiaResponse.status}):`, errText);
      }
    } catch (qodiaErr) {
      console.error("Qodia sync error:", qodiaErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        hfx_customer_number: lead.hfx_customer_number,
        message: "Ihre Anfrage wurde erfolgreich übermittelt.",
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in capture-lead:", error);
    const origin2 = req.headers.get("origin");
    const fallbackHeaders = getCorsHeaders(origin2) || {};
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...fallbackHeaders, "Content-Type": "application/json" } }
    );
  }
});
