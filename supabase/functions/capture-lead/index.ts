import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";
import { isStandortHfx } from "../_shared/multiLocation.ts";
import { bodyTargetIds, decideAssignment } from "./assignmentPolicy.ts";

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

const CONTACT_EMAIL = "info@hfx-honorarfuchs.de";
const RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RATE_PER_HOUR = 5;
const RATE_PER_DAY = 20;

async function sha256Hex(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  generated_password: string | null; // null = erneuter Versand ohne Passwort
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

  const accessBlockHtml = generated_password === null
    ? `<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Ihr Zugang zu HFX.GOÄ</strong><br>Sie haben sich erneut angemeldet. Für diese E-Mail-Adresse besteht bereits ein Zugang.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8; border-radius:8px; border:1px solid #d0d5dd;">
<tr>
<td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;">
<strong>Anmelde-E-Mail-Adresse:</strong> ${email}<br>
<strong>HFX-Kundennummer:</strong> ${hfx_customer_number}
</td>
</tr>
</table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Aus Sicherheitsgründen senden wir Ihr Passwort nicht erneut. So vergeben Sie ein neues:</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">
1. HFX.GOÄ öffnen und Ihre Anmelde-E-Mail-Adresse in das Feld „E-Mail" eintragen.<br>
2. Auf „Passwort vergessen?" klicken.<br>
3. Den 6-stelligen Code aus Ihrem Postfach eingeben und ein neues Passwort vergeben. Kein Code da? Bitte auch den Spam-Ordner prüfen.
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Die Kundennummer brauchen Sie nur für Rückfragen. Sie ist kein Benutzername.</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="10">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;">Fragen? <a href="mailto:${CONTACT_EMAIL}" style="color:#444444;">${CONTACT_EMAIL}</a></td></tr>
`
    : `<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Ihr Zugang zu HFX.GOÄ:</strong></td></tr>
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
`;

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
${accessBlockHtml}<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
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

  const accessBlockText: string[] = generated_password === null ? [
    "Ihr Zugang zu HFX.GOÄ",
    "Sie haben sich erneut angemeldet. Für diese E-Mail-Adresse besteht bereits ein Zugang.",
    "",
    `Anmelde-E-Mail-Adresse: ${email}`,
    `HFX-Kundennummer: ${hfx_customer_number}`,
    "",
    "Aus Sicherheitsgründen senden wir Ihr Passwort nicht erneut. So vergeben Sie ein neues:",
    "",
    "1. HFX.GOÄ öffnen und Ihre Anmelde-E-Mail-Adresse in das Feld „E-Mail\" eintragen.",
    "2. Auf „Passwort vergessen?\" klicken.",
    "3. Den 6-stelligen Code aus Ihrem Postfach eingeben und ein neues Passwort vergeben. Kein Code da? Bitte auch den Spam-Ordner prüfen.",
    "",
    "Die Kundennummer brauchen Sie nur für Rückfragen. Sie ist kein Benutzername.",
    "",
    `Fragen? ${CONTACT_EMAIL}`,
  ] : [
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
    "1. Anwendung öffnen und Ihre Anmelde-E-Mail-Adresse in das Feld „E-Mail\" eintragen.",
    "2. Auf „Passwort vergessen?\" klicken. Der Link wird aktiv, sobald die Adresse im Feld steht.",
    "3. Den 6-stelligen Code aus Ihrem Postfach eingeben (ggf. Spam-Ordner prüfen) und ein eigenes Passwort vergeben.",
  ];

  const bodyText = [
    "Danke für Ihr Interesse am HFX Honorarfuchs!",
    "Entdecken Sie, was KI aus Ihrer Privatabrechnung holt.",
    "",
    "Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung. Erkennen Sie Optimierungspotenziale, prüfen Sie Ihre Daten strukturiert und verschaffen Sie sich ein besseres Gefühl für Ihre Privatliquidation – ganz ohne Aufwand.",
    "",
    ...accessBlockText,
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

  return renderBrandedEmail({ subheadline: generated_password === null ? "Ihr Zugang zu HFX.GOÄ" : "Ihre Zugangsdaten", bodyHtml, bodyText });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = corsHeaders;

  try {
    const rawBody = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // Schlankes Protokoll: kein Request, keine E-Mail — nur Lead-ID und Ergebnis.
    const done = (result: string, extra: Record<string, unknown> = {}) =>
      console.log(JSON.stringify({ fn: "capture-lead", result, ...extra }));

    // ── Aufrufer-Identität + Rollen (serverseitig belegt) ─────────────────────
    // Quelle ist ausschließlich das JWT aus dem Authorization-Header, niemals der
    // Body. Extern = hat Rolle sales_partner und KEINE interne Rolle
    // (user, regional_lead, sales_lead, admin). Mehrfachrollen sind möglich.
    let callerId: string | null = null;
    let callerRoles: string[] = [];
    {
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
            callerId = user.id;
            const { data: roleRows, error: roleErr } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", user.id)
              .eq("is_active", true);
            if (roleErr) {
              console.error("Rollen-Lookup fehlgeschlagen:", roleErr.message);
            } else {
              callerRoles = (roleRows || []).map((r: any) => r.role);
            }
          }
        } catch (_e) {
          console.error("Caller-Identität konnte nicht ermittelt werden");
        }
      }
    }
    // Portal-Aufruf = angemeldet mit mindestens einer aktiven Rolle.
    const isPortalCaller = !!callerId && callerRoles.length > 0;

    // "manual" nur für Portal-Aufrufe; von außen gilt immer "homepage".
    const leadSource: string = rawBody?.source === "manual" && isPortalCaller ? "manual" : "homepage";
    const sendConfirmationEmail = true;

    // ── IP-Grenze (nur öffentliche Aufrufe): über der Grenze still 200 ohne Wirkung ──
    if (!isPortalCaller) {
      try {
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
        const ipHash = await sha256Hex(`capture-lead:${ip}`);
        const now = Date.now();
        const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
        const hourAgo = new Date(now - 3600 * 1000).toISOString();
        const [{ count: perDay }, { count: perHour }] = await Promise.all([
          supabase.from("capture_lead_rate").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", dayAgo),
          supabase.from("capture_lead_rate").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
        ]);
        if ((perHour ?? 0) >= RATE_PER_HOUR || (perDay ?? 0) >= RATE_PER_DAY) {
          done("rate_limited");
          return new Response(
            JSON.stringify({ success: true, message: "Ihre Anfrage wurde erfolgreich übermittelt." }),
            { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
        await supabase.from("capture_lead_rate").insert({ ip_hash: ipHash });
        await supabase.from("capture_lead_rate").delete().lt("created_at", new Date(now - 2 * 24 * 3600 * 1000).toISOString());
      } catch (_e) {
        console.error("IP-Grenze nicht prüfbar – Aufruf wird zugelassen");
      }
    }

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

    // MP-Nummer validation: must be exactly 5 digits if provided (homepage only; manual entries allow free text)

    // MP-Nummer is optional for CareCapital/privadis – log a warning but don't reject
    if ((abrechnungszentrum === "CareCapital" || abrechnungszentrum === "privadis") && !mp_nummer) {
      // MP-Nummer fehlt – Lead wird trotzdem angenommen.
    }


    // Check if email already exists
    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, hfx_customer_number, praxis_name, vorname, nachname, registration_attempts, credentials_sent_at")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Dublette: bei Homepage UND manueller Anlage kein neuer Lead (keine Ausnahme).
    if (existingLead && leadSource === "manual") {
      done("duplicate_manual", { lead_id: existingLead.id });
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          hfx_customer_number: existingLead.hfx_customer_number,
          message: "Ein Interessent mit dieser E-Mail-Adresse existiert bereits.",
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (existingLead) {
      // Erneuter Versand ohne Passwort, höchstens einmal in 24 Stunden.
      const lastSent = existingLead.credentials_sent_at ? new Date(existingLead.credentials_sent_at).getTime() : 0;
      let mail = "skipped_24h";
      if (Date.now() - lastSent >= RESEND_INTERVAL_MS) {
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (!resendApiKey) {
            mail = "no_key";
          } else {
            const resend = new Resend(resendApiKey);
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
              generated_password: null,
            });
            const sendResult = await resend.emails.send({
              from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
              to: [normalizedEmail],
              subject: `Ihr Zugang zu HFX.GOÄ – HFX Honorarfuchs`,
              html: emailHtml,
              text: emailText,
            });
            if (sendResult?.error) {
              mail = "failed";
            } else {
              mail = "sent";
              await supabase.from("leads").update({ credentials_sent_at: new Date().toISOString() }).eq("id", existingLead.id);
            }
          }
        } catch (_emailErr) {
          mail = "failed";
        }
      }

      await supabase
        .from("leads")
        .update({ registration_attempts: (existingLead.registration_attempts ?? 1) + 1 })
        .eq("id", existingLead.id);

      done("duplicate", { lead_id: existingLead.id, mail });
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

    // [REVIEW REQUIRED] Zuordnungsfelder aus dem Body nur nach Rollenprüfung
    // (Aufrufer + Ziel) übernehmen. Regeln: ./assignmentPolicy.ts.
    // Rollback: diesen Block und den Import entfernen, vorherige Inline-Logik wiederherstellen.
    const targetRoles: Record<string, string[]> = {};
    const targetIds = callerId ? bodyTargetIds(rawBody) : [];
    if (targetIds.length > 0) {
      const { data: tRows, error: tErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", targetIds)
        .eq("is_active", true);
      if (tErr) console.error("Ziel-Rollen-Lookup fehlgeschlagen:", tErr.message);
      for (const r of (tRows || []) as any[]) (targetRoles[r.user_id] ||= []).push(r.role);
    }
    const decision = decideAssignment({ callerId, callerRoles, body: rawBody, targetRoles });
    const callerIsExternalPartner = decision.callerIsExternalPartner;

    // ── PLZ-Zuordnung: Zentrale Logik via DB-Funktion resolve_plz_ad() ────────
    // Manuelle Zuweisung überschreibt immer die Automatik.
    // Quelle: src-of-truth = plz_gebietsleiter_mapping, verwaltet via Admin > PLZ-Zuordnung
    // B.1b: Für externe Aufrufer wird ein im Body übergebenes assigned_to ignoriert —
    // die Zuweisung erfolgt dann ausschließlich über die PLZ-Automatik oder bleibt leer.
    if (rawBody.assigned_to && !decision.manualAssignedTo) {
      console.log("assigned_to aus dem Body ignoriert (anonym, extern oder ungültiges Ziel) – PLZ-Automatik.");
    }
    let assignedTo: string | null = decision.manualAssignedTo;
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
        } else {
        }
      } catch (plzErr) {
        console.error("PLZ mapping lookup error:", plzErr);
      }
    } else {
    }

    // Fallback bei manuellem Lead ohne Treffer: anlegende Person wird assigned_to,
    // damit sie den eigenen Lead in der Liste sehen kann (RLS).
    // B.1: Für externe Aufrufer (sales_partner ohne interne Rolle) gilt der Fallback
    // NICHT mehr — ohne PLZ-Treffer bleibt der Lead unzugewiesen (Pool).
    if (!assignedTo && leadSource === "manual" && callerId && decision.callerHasInternalRole) {
      assignedTo = callerId;
      assignmentSource = "manual";
    }

    // B.2: Vermittlung rein erfassend stempeln — ausschließlich aus der belegten
    // Aufrufer-Identität. Ein aus dem Body übergebenes vermittler_id wird ignoriert.
    // Anonyme/öffentliche und interne Anlage: NULL.
    const vermittlerId: string | null = decision.vermittlerId;


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
        assigned_to: assignedTo,
        tippgeber_id: decision.tippgeberId,
        vermittler_id: vermittlerId,

        source: leadSource,
        assignment_source: assignmentSource,
      })
      .select("id, hfx_customer_number")
      .single();


    if (insertError) {
      console.error("Error inserting lead:", insertError.code ?? "unknown");
      return new Response(
        JSON.stringify({ error: "Fehler beim Speichern" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }


    // Credential-Speicherung: alleiniger Schreibpfad ist die geschuetzte Tabelle
    // lead_credentials. Ein Fehler hier ist hart (500) — ohne Credential ist der
    // Lead fachlich unvollstaendig. Kein Rollback des Lead-Inserts (bewusste
    // Entscheidung): der Lead bleibt erhalten, das Passwort ist ueber den
    // Sync-Pfad nachtraeglich erzeugbar.
    const { error: credErr } = await supabase
      .from("lead_credentials")
      .upsert({
        lead_id: lead.id,
        generated_password: generatedPassword,
        updated_at: new Date().toISOString(),
      }, { onConflict: "lead_id" });
    if (credErr) {
      console.error("lead_credentials upsert failed (fatal):", credErr.code ?? "unknown");
      return new Response(
        JSON.stringify({ error: "Fehler beim Speichern" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }



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



    // ── Qodia zuerst: Zugangsmail nur, wenn das Qodia-Konto angelegt ist ──────
    let qodiaOk = false;
    let qodiaConflict = false;
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
        signal: AbortSignal.timeout(15000),
      });

      if (qodiaResponse.ok) {
        qodiaOk = true;
        await supabase.from("leads").update({ qodia_synced: true, qodia_conflict: false, qodia_signup_error: null }).eq("id", lead.id);

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
            console.error("free_quota_grants insert error:", grantErr.code ?? "unknown");
          }
        }
      } else {
        qodiaConflict = qodiaResponse.status === 409;
        await qodiaResponse.text().catch(() => "");
        await markQodiaFailure(`HTTP ${qodiaResponse.status}`);
      }
    } catch (qodiaErr) {
      const name = (qodiaErr as Error)?.name === "TimeoutError" ? "timeout" : "network";
      await markQodiaFailure(name);
    }

    async function markQodiaFailure(reason: string) {
      await supabase.from("leads").update({
        qodia_synced: false,
        ...(qodiaConflict ? { qodia_conflict: true } : {}),
        qodia_signup_error: reason.slice(0, 200),
      }).eq("id", lead.id);
      const { error: evErr } = await supabase.from("customer_events").insert({
        event_type: "QODIA_SIGNUP_FAILED",
        entity_type: "lead",
        entity_id: lead.id,
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
        event_data: { reason: reason.slice(0, 200), conflict: qodiaConflict },
        created_by: null,
      });
      if (evErr) console.error("QODIA_SIGNUP_FAILED event insert error:", evErr.code ?? "unknown");
    }

    // Zugangsmail nur nach erfolgreichem Qodia-Sign-up.
    let mailResult = "skipped_qodia_failed";
    if (sendConfirmationEmail && qodiaOk) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
          mailResult = "no_key";
        } else {
          const resend = new Resend(resendApiKey);
          const { html: emailHtml, text: emailText } = buildConfirmationEmail({ praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum, mp_nummer, nachricht, hfx_customer_number: lead.hfx_customer_number, generated_password: generatedPassword });

          const sendResult = await resend.emails.send({
            from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
            to: [email],
            subject: `Danke für Ihr Interesse am HFX Honorarfuchs!`,
            html: emailHtml,
            text: emailText,
          });

          if (sendResult.error) {
            mailResult = "failed";
          } else {
            await supabase
              .from("leads")
              .update({ confirmation_email_sent: true, credentials_sent_at: new Date().toISOString() })
              .eq("id", lead.id);
            mailResult = "sent";
          }
        }
      } catch (emailErr: any) {
        mailResult = "failed";
      }
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

            const qodiaBoxHtml = qodiaOk ? "" : `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff4e5;border:1px solid #f0a040;border-radius:8px;margin:0 0 16px 0;">
          <tr><td style="padding:12px 16px;font-family:verdana,geneva,sans-serif;font-size:11pt;line-height:16pt;color:#8a4b00;">
            <strong>Achtung: Der HFX.GOÄ-Zugang konnte nicht angelegt werden.</strong><br>
            Der Interessent hat deshalb <strong>keine</strong> Zugangsdaten erhalten.<br>
            Bitte zuerst im HFX-Portal unter <em>Interessenten</em> den Lead öffnen und den Qodia-Abgleich erneut starten. Erst danach Kontakt aufnehmen.${qodiaConflict ? "<br>Die E-Mail-Adresse ist bei Qodia bereits vergeben. Bitte mit dem Interessenten klären, ob schon ein Konto besteht." : ""}
          </td></tr>
        </table>`;
            const adBodyHtml = `
        <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>${adName}</strong>,</p>
        ${qodiaBoxHtml}
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
        ${qodiaOk ? `<p style="margin:0 0 0;font-size:13px;color:#374151;line-height:1.6;background:#f0f5ff;border-left:3px solid #0b367f;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>` : ""}`;

            const adBodyText = [
              `Hallo ${adName},`,
              "",
              ...(qodiaOk ? [] : [
                "ACHTUNG: Der HFX.GOÄ-Zugang konnte nicht angelegt werden.",
                "Der Interessent hat deshalb KEINE Zugangsdaten erhalten.",
                "Bitte zuerst im HFX-Portal unter Interessenten den Lead öffnen und den Qodia-Abgleich erneut starten. Erst danach Kontakt aufnehmen.",
                ...(qodiaConflict ? ["Die E-Mail-Adresse ist bei Qodia bereits vergeben. Bitte mit dem Interessenten klären, ob schon ein Konto besteht."] : []),
                "",
              ]),
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
              qodiaOk ? "Nächster Schritt: Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter Interessenten." : null,
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
              subject: `🔔 Neuer Lead: ${praxis_name} (${plz})${qodiaOk ? "" : " – Zugang nicht angelegt"}`,
              html: adNotificationHtml,
              text: adNotificationText,
            });
          } else {
          }
        } else {
          console.log("AD notification disabled via email_notification_settings");
        }
      } catch (adNotifErr) {
        console.error("Error sending AD notification");
      }
    }

    // Sync to Salesforce
    let sfResult = "not_connected";
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
          sfResult = "ok";
        } else {
          await sfResponse.text().catch(() => "");
          sfResult = `failed_${sfResponse.status}`;
        }
      }
    } catch (sfErr) {
      sfResult = "error";
    }

    done("created", { lead_id: lead.id, source: leadSource, qodia: qodiaOk ? "ok" : (qodiaConflict ? "conflict" : "failed"), mail: mailResult, salesforce: sfResult });

    return new Response(
      JSON.stringify({
        success: true,
        hfx_customer_number: lead.hfx_customer_number,
        message: "Ihre Anfrage wurde erfolgreich übermittelt.",
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in capture-lead:", error?.message ?? "unknown");
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
