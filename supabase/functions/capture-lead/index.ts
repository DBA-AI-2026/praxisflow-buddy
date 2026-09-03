import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";
import { isStandortHfx } from "../_shared/multiLocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const DOWNLOAD_URL_MAC = "https://download.qodia.de/production/hfx/latest/mac/hfx-desktop.dmg";
const DOWNLOAD_URL_WIN = "https://download.qodia.de/production/hfx/latest/windows/hfx-desktop.exe";

function buildConfirmationEmail(fields: {
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
}): { html: string; text: string } {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum, mp_nummer, nachricht, hfx_customer_number, generated_password } = fields;

  const mpSection = mp_nummer ? `<tr>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Medizinpartner-Nummer (falls bekannt):</td>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${mp_nummer}&nbsp;</td>
  </tr>` : "";

  const nachrichtSection = nachricht ? `<tr>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nachricht:</td>
    <td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${nachricht}&nbsp;</td>
  </tr>` : "";

  const bodyHtml = `<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%">
<tr><td align="left" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt; color:#444444;">
<strong>Danke für Ihr Interesse am HFX Honorarfuchs!<br>Entdecken Sie, was KI aus Ihrer Privatabrechnung holt.</strong>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="30">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung. Erkennen Sie Optimierungspotenziale, prüfen Sie Ihre Daten strukturiert und verschaffen Sie sich ein besseres Gefühl für Ihre Privatliquidation – ganz ohne Aufwand.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Das erwartet Sie:</strong><br>Einfacher Import Ihrer Abrechnungsdaten<br>Verständliche Analyse statt komplizierter Prüfung<br>Mehr Transparenz und Sicherheit bei der GOÄ-Abrechnung</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Sie nutzen noch kein Abrechnungszentrum?</strong><br>Für die Nutzung von HFX.GOÄ benötigen Sie eine PAD- oder PADnext-Datei. Wenn Ihnen das gerade nichts sagt, kümmern wir uns darum: Ein Mitarbeiter meldet sich zeitnah bei Ihnen und begleitet Sie Schritt für Schritt durch die technischen Voraussetzungen.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="30">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Ihr Zugang zu HFX.GOÄ:</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8; border-radius:8px; border:1px solid #d0d5dd;">
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;">
<strong>Anmelde-E-Mail-Adresse:</strong> ${email}<br>
<strong>Passwort:</strong> <code style="background:#fff; padding:2px 8px; border-radius:4px; font-size:13pt; letter-spacing:1px;">${generated_password}</code><br>
<strong>Ihre HFX-Kundennummer:</strong> ${hfx_customer_number}
</td>
</tr>
</table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Melden Sie sich in der Anwendung mit Ihrer Anmelde-E-Mail-Adresse und dem Passwort an. Die Kundennummer brauchen Sie nur für Rückfragen an uns – sie ist kein Benutzername.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Sie möchten lieber ein eigenes Passwort?</strong> Das geht jederzeit direkt in der Anwendung:</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">
1. Anwendung öffnen und Ihre Anmelde-E-Mail-Adresse in das Feld „E-Mail" eintragen.<br>
2. Auf „Passwort vergessen?" klicken. Der Link wird aktiv, sobald die Adresse im Feld steht.<br>
3. Den 6-stelligen Code aus Ihrem Postfach eingeben (ggf. Spam-Ordner prüfen) und ein eigenes Passwort vergeben.
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#444444;"><strong>Jetzt Testversion downloaden und starten!</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="5">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:10pt; line-height:12pt; color:#444444;">Sie benötigen dafür eine PAD/PAD.next-Schnittstelle.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="15">&nbsp;</td></tr>
<tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
<td align="center" valign="top" width="50%" style="padding: 10px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #6d6d6d; border-radius: 6px; width: 100%;"><tr><td align="center" style="padding:0;">
<a href="${DOWNLOAD_URL_MAC}" target="_blank" rel="noopener noreferrer" style="display:block; padding:20px 10px; text-decoration:none; color:#444444; font-family:verdana, geneva, sans-serif; font-size:11pt; font-weight:bold; line-height:16pt;">
<img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/apple-100.png" width="25" height="25" alt="" style="vertical-align:middle; border:0; margin-right:10px;">Download MacOS
</a>
</td></tr></table></td>
<td align="center" valign="top" width="50%" style="padding: 10px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #6d6d6d; border-radius: 6px; width: 100%;"><tr><td align="center" style="padding:0;">
<a href="${DOWNLOAD_URL_WIN}" target="_blank" rel="noopener noreferrer" style="display:block; padding:20px 10px; text-decoration:none; color:#444444; font-family:verdana, geneva, sans-serif; font-size:11pt; font-weight:bold; line-height:16pt;">
<img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Windows.png" width="25" height="25" alt="" style="vertical-align:middle; border:0; margin-right:10px;">Download Windows
</a>
</td></tr></table></td>
</tr></table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
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
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Folgende Daten haben Sie an uns übermittelt:</strong></td></tr>
<tr><td>
<table border="0" cellpadding="3" cellspacing="0" width="100%"><tbody>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
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
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Abrechnungszentrum</strong></td>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"></td>
</tr>
<tr>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nutzen Sie ein Abrechnungszentrum?</td>
<td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${abrechnungszentrum}&nbsp;</td>
</tr>
${mpSection}
${nachricht ? `<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Nachricht</strong></td>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"></td>
</tr>
${nachrichtSection}` : ""}
</tbody></table>
</td></tr>
</table>`;

  const bodyText = [
    "Danke für Ihr Interesse am HFX Honorarfuchs!",
    "Entdecken Sie, was KI aus Ihrer Privatabrechnung holt.",
    "",
    "Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung. Erkennen Sie Optimierungspotenziale, prüfen Sie Ihre Daten strukturiert und verschaffen Sie sich ein besseres Gefühl für Ihre Privatliquidation – ganz ohne Aufwand.",
    "",
    "Ihr Zugang zu HFX.GOÄ:",
    "",
    `Anmelde-E-Mail-Adresse: ${email}`,
    `Passwort: ${generated_password}`,
    `Ihre HFX-Kundennummer: ${hfx_customer_number}`,
    "",
    "Melden Sie sich in der Anwendung mit Ihrer Anmelde-E-Mail-Adresse und dem Passwort an. Die Kundennummer brauchen Sie nur für Rückfragen an uns – sie ist kein Benutzername.",
    "",
    "Sie möchten lieber ein eigenes Passwort? Das geht jederzeit direkt in der Anwendung:",
    "",
    "Anwendung öffnen und Ihre Anmelde-E-Mail-Adresse in das Feld „E-Mail\" eintragen.",
    "Auf „Passwort vergessen?\" klicken. Der Link wird aktiv, sobald die Adresse im Feld steht.",
    "Den 6-stelligen Code aus Ihrem Postfach eingeben (ggf. Spam-Ordner prüfen) und ein eigenes Passwort vergeben.",
    "",
    "Jetzt Testversion downloaden und starten (PAD/PAD.next-Schnittstelle erforderlich):",
    `Download MacOS: ${DOWNLOAD_URL_MAC}`,
    `Download Windows: ${DOWNLOAD_URL_WIN}`,
    "",
    "Folgende Daten haben Sie an uns übermittelt:",
    `Praxisname: ${praxis_name}`,
    `Vorname: ${vorname}`,
    `Nachname: ${nachname}`,
    `E-Mail: ${email}`,
    `PLZ: ${plz}`,
    `Mobilnummer: ${mobilnummer}`,
    `Abrechnungszentrum: ${abrechnungszentrum}`,
    mp_nummer ? `Medizinpartner-Nummer: ${mp_nummer}` : null,
    nachricht ? `Nachricht: ${nachricht}` : null,
  ].filter(Boolean).join("\n");

  return renderBrandedEmail({ subheadline: "Ihre Zugangsdaten", bodyHtml, bodyText });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = corsHeaders;

  try {
    const rawBody = await req.json();
    
    // Detect whether this is a manual internal entry or a homepage submission
    const leadSource: string = rawBody.source === "manual" ? "manual" : "homepage";
    // Confirmation email is ALWAYS sent, regardless of source or parameter
    const sendConfirmationEmail = true;
    console.log(`Lead request – source: ${leadSource}, sendEmail: always true`);
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

    // Normalize abrechnungszentrum: known values stay as-is, unknown free-text from
    // WordPress (e.g. "anderes Abrechnungszentrum") is accepted and stored as-is.
    // Only reject if completely empty (already caught by required-field check above).
    const knownAbrechnungszentren = ["nein", "keins", "CareCapital", "privadis", "anderes", "ZAB", "PVS", "DZR", "ARZ", "Sonstiges"];
    const normalizedAz = knownAbrechnungszentren.includes(abrechnungszentrum) ? abrechnungszentrum : abrechnungszentrum;
    // Log if we received an unknown but accepted value
    if (!knownAbrechnungszentren.includes(abrechnungszentrum)) {
      console.log(`Abrechnungszentrum "${abrechnungszentrum}" is not in known list – accepting as free-text value`);
    }

    // MP-Nummer validation: must be exactly 5 digits if provided (homepage only; manual entries allow free text)
    if (leadSource === "homepage" && mp_nummer && !/^\d{5}$/.test(mp_nummer.trim())) {
      console.log(`MP-Nummer "${mp_nummer}" is not 5 digits – accepting anyway for homepage lead`);
    }

    // MP-Nummer is optional for CareCapital/privadis – log a warning but don't reject
    if ((abrechnungszentrum === "CareCapital" || abrechnungszentrum === "privadis") && !mp_nummer) {
      console.log(`MP-Nummer missing for ${abrechnungszentrum} – accepting lead without it`);
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
      .select("id, hfx_customer_number, generated_password, praxis_name, vorname, nachname, registration_attempts")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // For homepage submissions we keep strict deduplication by email.
    // For manual internal entries we allow a new lead row, even with same email.
    if (existingLead && leadSource === "homepage") {
      console.log(`Duplicate registration attempt for ${normalizedEmail}, resending credentials for ${existingLead.hfx_customer_number}`);

      // Resend existing credentials
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const existingPassword = existingLead.generated_password || "Sie haben bereits ein eigenes Passwort vergeben. Falls Sie es nicht mehr wissen: „Passwort vergessen?" in der Anwendung – die Schritte stehen oben.";
          const { html: emailHtml, text: emailText } = buildConfirmationEmail({
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
            subject: `Ihre bestehenden Zugangsdaten – HFX Honorarfuchs`,
            html: emailHtml,
            text: emailText,
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

    if (existingLead && leadSource === "manual") {
      console.log(`Manual lead with existing email ${normalizedEmail} – creating a new lead record.`);
    }

    // Generate password for Qodia access
    const generatedPassword = generatePassword(12);

    // ── PLZ-Zuordnung: Zentrale Logik via DB-Funktion resolve_plz_ad() ────────
    // Manuelle Zuweisung überschreibt immer die Automatik.
    // Quelle: src-of-truth = plz_gebietsleiter_mapping, verwaltet via Admin > PLZ-Zuordnung
    let assignedTo: string | null = rawBody.assigned_to || null;
    const manualAssignment = !!assignedTo;
    let assignedName: string | null = null;
    let assignmentSource = manualAssignment ? "manual" : "none";
    let matchedRule: string | null = null;

    // Bei homepage-Leads UND bei manuellen Leads ohne explizite Zuweisung: PLZ-Auto
    if (!manualAssignment) {
      try {
        const { data: resolved, error: plzErr } = await supabase
          .rpc("resolve_plz_ad", { plz_input: plz });

        if (plzErr) {
          console.error("resolve_plz_ad error:", plzErr.message);
        } else if (resolved && resolved.length > 0 && resolved[0].gebietsleiter_id) {
          assignedTo = resolved[0].gebietsleiter_id;
          assignedName = resolved[0].gebietsleiter_name;
          matchedRule = resolved[0].matched_rule;
          assignmentSource = "plz_auto";
          console.log(`Lead PLZ ${plz} → assigned to ${assignedName} (rule: ${matchedRule})`);
        } else {
          console.log(`No GL mapping found for PLZ ${plz}`);
        }
      } catch (plzErr) {
        console.error("PLZ mapping lookup error:", plzErr);
      }
    } else {
      console.log(`Manual assignment: assigned_to=${assignedTo}`);
    }

    // Fallback bei manuellem Lead ohne Treffer: anlegender User wird assigned_to,
    // damit der Ersteller seinen eigenen Lead in der Liste sehen kann (RLS).
    if (!assignedTo && leadSource === "manual") {
      const authHeader = req.headers.get("authorization") ?? "";
      if (authHeader) {
        try {
          const userClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { authorization: authHeader } } }
          );
          const { data: { user } } = await userClient.auth.getUser();
          if (user) {
            assignedTo = user.id;
            assignmentSource = "manual";
            console.log(`Fallback: assigned_to=creator ${user.id}`);
          }
        } catch (e) {
          console.error("Creator fallback failed:", e);
        }
      }
    }

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        praxis_name: praxis_name.trim().slice(0, 200),
        vorname: vorname.trim().slice(0, 100),
        nachname: nachname.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 255),
        plz: plz.trim().slice(0, 10),
        mobilnummer: (mobilnummer || "").trim().slice(0, 30) || "nicht angegeben",
        abrechnungszentrum,
        mp_nummer: mp_nummer?.trim().slice(0, 50) || null,
        nachricht: nachricht?.trim().slice(0, 2000) || null,
        adresse: adresse?.trim().slice(0, 300) || null,
        ort: ort?.trim().slice(0, 100) || null,
        interested_products: rawBody.interested_products || [],
        generated_password: generatedPassword,
        assigned_to: assignedTo,
        tippgeber_id: rawBody.tippgeber_id || null,
        source: leadSource,
        assignment_source: assignmentSource,
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

    console.log(`Lead created: ${lead.hfx_customer_number} for ${email} (source: ${leadSource}, assignment: ${assignmentSource})`);

    // Protokolliere Zuordnung im zentralen PLZ-Assignment-Log
    supabase.from("plz_assignment_log").insert({
      entity_type: "lead",
      entity_id: lead.id,
      plz: plz.trim(),
      resolved_gebietsleiter_id: assignedTo ?? null,
      resolved_gebietsleiter_name: assignedName ?? null,
      assignment_source: assignmentSource,
      matched_rule: matchedRule,
    }).then(({ error: logErr }) => {
      if (logErr) console.error("plz_assignment_log insert error:", logErr.message);
    });



    // Send confirmation email via Resend (skipped if sendConfirmationEmail=false)
    if (sendConfirmationEmail) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
          console.error("RESEND_API_KEY not configured – skipping confirmation email");
        } else {
          const resend = new Resend(resendApiKey);
          const { html: emailHtml, text: emailText } = buildConfirmationEmail({ praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum, mp_nummer, nachricht, hfx_customer_number: lead.hfx_customer_number, generated_password: generatedPassword });

          console.log(`Attempting to send confirmation email to ${email} from noreply@hfx-honorarfuchs.de`);
          const sendResult = await resend.emails.send({
            from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
            to: [email],
            subject: `Danke für Ihr Interesse am HFX Honorarfuchs!`,
            html: emailHtml,
            text: emailText,
          });

          if (sendResult.error) {
            console.error(`Resend API error for ${email}:`, JSON.stringify(sendResult.error));
          } else {
            await supabase
              .from("leads")
              .update({ confirmation_email_sent: true })
              .eq("id", lead.id);
            console.log(`Confirmation email sent successfully to ${email}, Resend ID: ${sendResult.data?.id}`);
          }
        }
      } catch (emailErr: any) {
        console.error(`Exception sending confirmation email to ${email}:`, emailErr?.message || emailErr);
      }
    } else {
      console.log(`Confirmation email skipped (send_confirmation_email=false) for ${email}`);
    }

    // Notify assigned AD (Außendienst / Gebietsleiter) about the new lead
    if (assignedTo) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) throw new Error("No RESEND_API_KEY");

        // Check if AD notification is enabled
        const { data: notifSetting } = await supabase
          .from("email_notification_settings")
          .select("is_enabled")
          .eq("setting_key", "new_lead_ad_notification")
          .maybeSingle();
        const notifEnabled = notifSetting?.is_enabled !== false;

        if (notifEnabled) {
          // Load AD profile for email address
          const { data: adProfile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("user_id", assignedTo)
            .maybeSingle();

          const adEmail = adProfile?.email;
          const adName = adProfile?.full_name ?? assignedName ?? "Unbekannt";

          if (adEmail) {
            const abrechnungLabel: Record<string, string> = {
              nein: "Kein Abrechnungszentrum",
              CareCapital: "CareCapital",
              privadis: "Privadis",
              anderes: "Anderes Abrechnungszentrum",
            };

            const adBodyHtml = `
        <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>${adName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          ein neuer Interessent hat sich über die HFX-Webseite registriert und wurde dir automatisch aufgrund der PLZ-Zuordnung zugewiesen.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#f0f5ff;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#0b367f;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:160px;">Praxis</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${praxis_name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Name</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${vorname} ${nachname}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:5px 0;font-size:13px;color:#0b367f;">${email}</td></tr>
              ${mobilnummer ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mobilnummer}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:5px 0;font-size:13px;color:#111827;">${plz}</td></tr>
              ${ort ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Ort</td><td style="padding:5px 0;font-size:13px;color:#111827;">${ort}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Abrechnung</td><td style="padding:5px 0;font-size:13px;color:#111827;">${abrechnungLabel[abrechnungszentrum] ?? abrechnungszentrum}</td></tr>
              ${mp_nummer ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">MP-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mp_nummer}</td></tr>` : ""}
              ${nachricht ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;vertical-align:top;">Nachricht</td><td style="padding:5px 0;font-size:13px;color:#111827;font-style:italic;">${nachricht}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${lead.hfx_customer_number}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 0;font-size:13px;color:#374151;line-height:1.6;background:#f0f5ff;border-left:3px solid #0b367f;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>`;

            const adBodyText = [
              `Hallo ${adName},`,
              "",
              "ein neuer Interessent hat sich über die HFX-Webseite registriert und wurde dir automatisch aufgrund der PLZ-Zuordnung zugewiesen.",
              "",
              "Lead-Details:",
              `Praxis: ${praxis_name}`,
              `Name: ${vorname} ${nachname}`,
              `E-Mail: ${email}`,
              mobilnummer ? `Telefon: ${mobilnummer}` : null,
              `PLZ: ${plz}`,
              ort ? `Ort: ${ort}` : null,
              `Abrechnung: ${abrechnungLabel[abrechnungszentrum] ?? abrechnungszentrum}`,
              mp_nummer ? `MP-Nummer: ${mp_nummer}` : null,
              nachricht ? `Nachricht: ${nachricht}` : null,
              `HFX-Nummer: ${lead.hfx_customer_number}`,
              "",
              "Nächster Schritt: Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter Interessenten.",
            ].filter(Boolean).join("\n");

            const { html: adNotificationHtml, text: adNotificationText } = renderBrandedEmail({
              subheadline: "Neuer Lead eingegangen",
              bodyHtml: adBodyHtml,
              bodyText: adBodyText,
            });

            const resend = new Resend(resendApiKey);
            await resend.emails.send({
              from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
              to: [adEmail],
              subject: `🔔 Neuer Lead: ${praxis_name} (${plz})`,
              html: adNotificationHtml,
              text: adNotificationText,
            });
            console.log(`AD notification sent to ${adEmail} (${adName}) for lead ${lead.hfx_customer_number}`);
          } else {
            console.log(`AD ${adName} has no email address, skipping notification`);
          }
        } else {
          console.log("AD notification disabled via email_notification_settings");
        }
      } catch (adNotifErr) {
        console.error("Error sending AD notification:", adNotifErr);
      }
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
        await supabase.from("leads").update({ qodia_synced: true, qodia_conflict: false }).eq("id", lead.id);
        console.log(`Lead synced to Qodia: ${lead.hfx_customer_number}`);

        // Freikontingent-Trial-Grant (Phase 1): genau ein Auto-Trial über 200 Stück
        // pro Basis-HFX-Nummer. Standorte (-NN) erhalten KEINEN Auto-Grant.
        // Idempotenz via partiellem Unique-Index (grant_type='trial').
        if (!isStandortHfx(lead.hfx_customer_number)) {
          const { error: grantErr } = await supabase.from("free_quota_grants").insert({
            hfx_customer_number: lead.hfx_customer_number,
            grant_type: "trial",
            menge: 200,
            quelle: "qodia_signup_auto",
            created_by: null,
          });
          if (grantErr && !String(grantErr.message || "").toLowerCase().includes("duplicate")) {
            console.error("free_quota_grants insert error:", grantErr);
          }
        }
      } else {
        const errText = await qodiaResponse.text();
        console.error(`Qodia sync failed (${qodiaResponse.status}):`, errText);
        // Mark conflict if Qodia reports email already exists (409)
        if (qodiaResponse.status === 409) {
          await supabase.from("leads").update({ qodia_conflict: true }).eq("id", lead.id);
          console.log(`Qodia conflict (409) for ${lead.hfx_customer_number} – marked as conflict`);
        }
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
