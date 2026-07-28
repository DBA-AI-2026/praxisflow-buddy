// ============================================================================
// baseEmailLayout.ts — Kanonisches HTML+Text-Layout für transaktionale HFX-Mails
// ============================================================================
//
// Abgrenzung: Diese Datei ist NICHT mit den React-Email-Templates unter
// supabase/functions/_shared/email-templates/*.tsx (auth-email-hook) verwandt.
// Die .tsx-Dateien rendern Supabase-Auth-Mails (signup, recovery, …) via
// React-Email-Komponenten. Dieses Modul liefert reines Inline-HTML+Text für
// klassische Edge-Function-Mails (capture-lead AD-Notify, später weitere).
//
// Konsumenten verwenden `renderBrandedEmail({ subheadline?, bodyHtml, bodyText })`
// und erhalten `{ html, text }` mit konsistentem weißem Header (LOGO_URL),
// optionaler Sub-Headline (#0b367f) und kanonischem Footer aus HFX-Kontext §8.4.
//
// Logo-Quelle: aktuell WP-gehostet. Bei Self-Hosting nur LOGO_URL anpassen.
// ============================================================================

import { ENTITY_TAGLINE } from "../entityCanon.ts";

export const LOGO_URL =
  "https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/8270-Logo-RZ-Honorarfuchs-HFX.png";

export interface RenderBrandedEmailInput {
  /** Optionale Sub-Headline unterhalb des Logos, #0b367f. */
  subheadline?: string;
  /** Inhalts-HTML; wird innerhalb der weißen Card mit 32px/40px Padding gerendert. */
  bodyHtml: string;
  /** Inhalts-Text (Klartext); Footer wird automatisch angehängt. */
  bodyText: string;
}

export interface RenderBrandedEmailOutput {
  html: string;
  text: string;
}

export function renderBrandedEmail(
  input: RenderBrandedEmailInput,
): RenderBrandedEmailOutput {
  const year = new Date().getFullYear();
  const subheadlineHtml = input.subheadline
    ? `<p style="color:#0b367f;font-size:11pt;margin:16px 0 0 0;font-family:verdana,geneva,sans-serif;">${input.subheadline}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>
    <td bgcolor="#ffffff" style="background-color:#ffffff;padding:30px 40px;text-align:center;border-bottom:3px solid #b6193d;">
      <img src="${LOGO_URL}" alt="HFX Honorarfuchs" style="display:block;max-width:280px;height:auto;margin:0 auto;border:0;" />
      ${subheadlineHtml}
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px;font-family:verdana,geneva,sans-serif;color:#333333;font-size:11pt;line-height:1.5;">
${input.bodyHtml}
    </td>
  </tr>
  <tr>
    <td style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eeeeee;text-align:center;">
      <p style="font-size:9pt;color:#777777;margin:0 0 8px 0;line-height:1.5;font-family:verdana,geneva,sans-serif;">
        <strong>${ENTITY_TAGLINE}</strong><br>
        Hohenzollernstr. 47 &middot; 47799 Krefeld
      </p>
      <p style="font-size:9pt;color:#777777;margin:0 0 8px 0;line-height:1.5;font-family:verdana,geneva,sans-serif;">
        Gesch&auml;ftsf&uuml;hrer: Olaf Hagelkruys, Thilo Wiers-Keiser und Robbin Zielke<br>
        Registergericht: Amtsgericht Krefeld &middot; HRB 14709<br>
        Umsatzsteueridentifikationsnummer gem&auml;&szlig; &sect;27a Umsatzsteuergesetz: DE 227 420 712
      </p>
      <p style="font-size:9pt;color:#aaaaaa;margin:8px 0 0 0;font-family:verdana,geneva,sans-serif;">&copy; ${year} HFX Honorarfuchs &middot; Bei Fragen: info@hfx-honorarfuchs.de</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.bodyText,
    "",
    "--",
    ENTITY_TAGLINE,
    "Hohenzollernstr. 47 · 47799 Krefeld",
    "",
    "Geschäftsführer: Olaf Hagelkruys, Thilo Wiers-Keiser und Robbin Zielke",
    "Registergericht: Amtsgericht Krefeld · HRB 14709",
    "Umsatzsteueridentifikationsnummer gemäß §27a Umsatzsteuergesetz: DE 227 420 712",
    "",
    `© ${year} HFX Honorarfuchs · Bei Fragen: info@hfx-honorarfuchs.de`,
  ].join("\n");

  return { html, text };
}

export interface RenderBrandedButtonInput {
  href: string;
  label: string;
}

/**
 * Kanonischer Brand-CTA-Button (rot #b6193d), Outlook-sicheres Bulletproof-Muster.
 * bgcolor auf <td>, align="center" am <table>, kein display:inline-block am <a>.
 * Phase 1: nur exportiert, noch nicht konsumiert (Mandat-Mail behält Navy bis Schritt 2).
 */
export function renderBrandedButton(input: RenderBrandedButtonInput): string {
  return `<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:26px auto;"><tr><td align="center" bgcolor="#b6193d" style="border-radius:8px;padding:14px 28px;"><a href="${input.href}" target="_blank" rel="noopener noreferrer" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;font-family:verdana,geneva,sans-serif;">${input.label}</a></td></tr></table>`;
}
