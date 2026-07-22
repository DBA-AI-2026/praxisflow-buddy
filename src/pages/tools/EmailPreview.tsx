import { useState, useCallback, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, FileText, Pencil, Eye, RotateCcw, Save, Loader2, Lock, Sparkles, Send, Trash2, RotateCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { useUserRole } from "@/hooks/useUserRole";
// generateContractPdf: lazy via dynamic import (C.3a)
import { generateInvoicePdf } from "@/lib/generateInvoicePdf";
import { showPdfInViewer } from "@/lib/pdfViewerState";
import { Textarea } from "@/components/ui/textarea";
import { renderBrandedEmail, renderBrandedButton } from "@/lib/emailLayout";

// ─── Logo URLs (Legacy — nur noch für STALE/NO_LIVE-Vorschauen relevant) ──────
const LOGO_OLD = "https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg";
const LOGO_NEW = "https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fuchs-bildmarke.png";

function patchLogo(html: string): string {
  return html.split(LOGO_OLD).join(LOGO_NEW);
}

// IDs, deren Vorschau ECHT über renderBrandedEmail (SSOT) gebaut wird.
// Für diese: kein patchLogo, kein Editor, kein KI, kein Löschen, kein Reset.
const WIRED_IDS: ReadonlySet<string> = new Set([
  "lead-confirmation",
  "invoice",
  "dashboard-credentials",
  "ad-new-lead",
  "demo-expiry-customer",
  "demo-limit-customer",
  "ad-demo-reminder",
  "ad-tipp-lead",
  "admin-access-request",
  "contract-partner",
  "ad-lead-assignment",
]);

// STALE: Live-Mail existiert, aber wurde noch nicht auf renderBrandedEmail migriert.
const STALE_IDS: ReadonlySet<string> = new Set([]);

// NO_LIVE: Kein Live-Mail-Pendant (Leiche oder PDF-Vorschau).
const NO_LIVE_IDS: ReadonlySet<string> = new Set([
  "invoice-pdf",
]);

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK = {
  hfx_customer_number: "HFX-I01019",
  generated_password: "Ya&P6*e9vmwL",
  praxis_name: "Testpraxis Dr. Müller",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max.mustermann@example.com",
  plz: "80331",
  mobilnummer: "+49 170 1234567",
  abrechnungszentrum: "nein",
  invoice_number: "RE-2026-0002",
  customer_name: "Test GmbH",
  invoice_date: "26.02.2026",
  due_date: "12.03.2026",
  net_amount: "150,00 €",
  tax_amount: "28,50 €",
  gross_amount: "178,50 €",
};

// ─── Templates ────────────────────────────────────────────────────────────────
type TemplateId = "lead-confirmation" | "contract-partner" | "post-payment-contract-pdf" | "invoice" | "invoice-pdf" | "dashboard-credentials" | "demo-expiry-customer" | "demo-limit-customer" | "ad-tipp-lead" | "ad-demo-reminder" | "ad-new-lead" | "ad-lead-assignment" | "admin-access-request";

interface Template {
  id: TemplateId;
  label: string;
  subject: string;
  from: string;
  type: "email" | "pdf";
  description: string;
  category: "kunden" | "intern";
  hasPdfPreview?: boolean;
}

const TEMPLATES: Template[] = [
  // ── Kunden-Mails ──────────────────────────────────────────────────────────
  {
    id: "lead-confirmation",
    label: "Lead-Bestätigung",
    subject: "Danke für Ihr Interesse am HFX Honorarfuchs!",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "E-Mail an neuen Interessenten mit Zugangsdaten",
    category: "kunden",
  },
  {
    id: "demo-expiry-customer",
    label: "Testquartal endet bald (EBM)",
    subject: "Erinnerung: Ihr Testquartal endet am 01.04.2026",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Zeitbasiert (HFX EBM), 3 Tage vor Quartalsende. Noch nicht live.",
    category: "kunden",
  },
  {
    id: "demo-limit-customer",
    label: "Testkontingent aufgebraucht (GOÄ · 200 geprüfte Rechnungen)",
    subject: "Ihr Testkontingent für HFX.GOÄ ist aufgebraucht",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Mengenbasiert (HFX GOÄ) — bei 200 geprüften Rechnungen. Live.",
    category: "kunden",
  },
  {
    id: "post-payment-contract-pdf",
    label: "Vertragszusammenfassung (PDF nach Zahlung)",
    subject: "— PDF-Anhang (kein separater Versand) —",
    from: "noreply@hfx-honorarfuchs.de",
    type: "pdf",
    description: "Nach erfolgreicher Stripe-Zahlung wird diese Vertragszusammenfassung automatisch als PDF-Anhang in der Bestätigungs-E-Mail mitgeschickt (zusammen mit den AGB). Das PDF wird via pdf-lib dynamisch generiert.",
    category: "kunden",
    hasPdfPreview: true,
  },
  {
    id: "invoice",
    label: "Rechnung",
    subject: `Rechnung ${MOCK.invoice_number} – ${MOCK.customer_name}`,
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Rechnungs-E-Mail mit PDF-Anhang",
    category: "kunden",
  },
  // ── Interne Mails ─────────────────────────────────────────────────────────
  {
    id: "dashboard-credentials",
    label: "Dashboard-Zugangsdaten",
    subject: "Ihre Zugangsdaten für das HFX Sales Portal",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Zugangsdaten für neue interne Dashboard-Nutzer",
    category: "intern",
  },
  {
    id: "contract-partner",
    label: "Vertragskopie (AD-Selbstkopie)",
    subject: "Vertragskopie – Test GmbH – HFX EBM Professional",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Interne Kopie an den abschließenden Vertriebler, mit Vertrags-PDF.",
    category: "intern",
  },
  {
    id: "ad-new-lead",
    label: "AD: Neuer Website-Lead",
    subject: "Neuer Lead: Testpraxis Dr. Müller (80331)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an AD wenn ein neuer Interessent über die HFX-Webseite eingeht",
    category: "intern",
  },
  {
    id: "ad-lead-assignment",
    label: "AD: Lead manuell zugewiesen",
    subject: "Lead zugewiesen: Testpraxis Dr. Müller (80331)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an AD wenn ihm ein Lead manuell im Portal zugewiesen wird",
    category: "intern",
  },
  {
    id: "ad-tipp-lead",
    label: "AD: Neuer Tipp-Lead",
    subject: "Neuer Lead-Tipp: Praxis Mustermann (PLZ 80331)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an AD bei neuem Tipp-Lead durch Tippgeber",
    category: "intern",
  },
  {
    id: "ad-demo-reminder",
    label: "AD: Testquartal-Ablauf",
    subject: "Testquartal endet bald: Testpraxis GmbH (01.04.2026)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "AD-Benachrichtigung parallel zur Kunden-Erinnerung bei Demo-Ablauf",
    category: "intern",
  },
  {
    id: "admin-access-request",
    label: "Admin: Neue Zugangsanfrage",
    subject: "Neue Zugangsanfrage: Max Mustermann",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an Admin (info@hfx-honorarfuchs.de) wenn jemand über die Login-Seite Zugang zum Sales Portal beantragt",
    category: "intern",
  },
];

// ─── HTML builders ────────────────────────────────────────────────────────────
function buildLeadConfirmationHtml() {
  const { hfx_customer_number, generated_password, praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum } = MOCK;
  const DOWNLOAD_URL_MAC = "https://hfx-honorarfuchs.de/download/mac";
  const DOWNLOAD_URL_WIN = "https://hfx-honorarfuchs.de/download/win";
  const bodyHtml = `<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%">
<tr><td align="left" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt; color:#444444;">
<strong>Danke für Ihr Interesse am HFX Honorarfuchs!<br>Entdecken Sie, was KI aus Ihrer Privatabrechnung holt.</strong>
</td></tr>
<tr><td height="30" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;">Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung. Erkennen Sie Optimierungspotenziale, prüfen Sie Ihre Daten strukturiert und verschaffen Sie sich ein besseres Gefühl für Ihre Privatliquidation – ganz ohne Aufwand.</td></tr>
<tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;"><strong>Das erwartet Sie:</strong><br>Einfacher Import Ihrer Abrechnungsdaten<br>Verständliche Analyse statt komplizierter Prüfung<br>Mehr Transparenz und Sicherheit bei der GOÄ-Abrechnung</td></tr>
<tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;"><strong>Sie nutzen noch kein Abrechnungszentrum?</strong><br>Für die Nutzung von HFX.GOÄ benötigen Sie eine PAD- oder PADnext-Datei. Wenn Ihnen das gerade nichts sagt, kümmern wir uns darum: Ein Mitarbeiter meldet sich zeitnah bei Ihnen und begleitet Sie Schritt für Schritt durch die technischen Voraussetzungen.</td></tr>
<tr><td height="30" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;"><strong>Ihre Zugangsdaten für HFX.GOÄ:</strong></td></tr>
<tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8;border-radius:8px;border:1px solid #d0d5dd;">
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:20pt;">
<strong>Registrierte E-Mail-Adresse:</strong> ${email}<br>
<strong>Benutzername:</strong> ${hfx_customer_number}<br>
<strong>Passwort:</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px;font-size:13pt;letter-spacing:1px;">${generated_password}</code>
</td></tr>
</table>
</td></tr>
<tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#888888;font-family:verdana,geneva,sans-serif;font-size:10pt;line-height:14pt;"><em>Bitte bewahren Sie diese Zugangsdaten sicher auf. Sie benötigen sie für die Anmeldung in HFX.GOÄ.</em></td></tr>
<tr><td height="40" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="font-family:verdana,geneva,sans-serif;font-size:16pt;line-height:24pt;color:#444444;"><strong>Jetzt Testversion downloaden und starten!</strong></td></tr>
<tr><td height="5" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="font-family:verdana,geneva,sans-serif;font-size:10pt;line-height:12pt;color:#444444;">Sie benötigen dafür eine PAD/PAD.next-Schnittstelle.</td></tr>
<tr><td height="15" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
<td align="center" valign="top" width="50%" style="padding:10px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #6d6d6d;border-radius:6px;width:100%;"><tr><td align="center">
<a href="${DOWNLOAD_URL_MAC}" style="display:block;padding:20px 10px;text-decoration:none;color:#444444;font-family:verdana,geneva,sans-serif;font-size:11pt;font-weight:bold;line-height:16pt;">Download MacOS</a>
</td></tr></table></td>
<td align="center" valign="top" width="50%" style="padding:10px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #6d6d6d;border-radius:6px;width:100%;"><tr><td align="center">
<a href="${DOWNLOAD_URL_WIN}" style="display:block;padding:20px 10px;text-decoration:none;color:#444444;font-family:verdana,geneva,sans-serif;font-size:11pt;font-weight:bold;line-height:16pt;">Download Windows</a>
</td></tr></table></td>
</tr></table>
</td></tr>
<tr><td height="60" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="font-family:verdana,geneva,sans-serif;font-size:16pt;line-height:24pt;color:#0b367f;"><strong>So funktioniert HFX.GOÄ</strong></td></tr>
<tr><td height="6" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="font-family:verdana,geneva,sans-serif;font-size:10pt;color:#888888;">In 5 einfachen Schritten zur optimierten Abrechnung</td></tr>
<tr><td height="20" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td>
${[
  ["1", "Vorbereitung – Daten bereitstellen", "Patientenverwaltungssystem kurz offline nehmen<br>PAD-Datei aus dem PVS exportieren", "Saubere Ausgangsbasis für die Analyse"],
  ["2", "Import – Daten in HFX.GOÄ laden", "PAD-Datei hochladen<br>Keine Einrichtung notwendig", "Der Import erfolgt in wenigen Sekunden"],
  ["3", "Analyse – Abrechnung prüfen lassen", "Analyse per Klick starten<br>Auffälligkeiten &amp; Potenziale erkennen", "Automatisiert, strukturiert, nachvollziehbar"],
  ["4", "Entscheidung – Optimierungen bewerten", "Vorschläge prüfen &amp; Entscheidungen selbst treffen<br>Keine automatischen Änderungen", "Sie behalten jederzeit die Kontrolle"],
  ["5", "Abschluss – Optimierte Abrechnung übergeben", "Neue PAD-Datei speichern &amp; optional ins PVS laden<br>Übergabe an Ihr Abrechnungszentrum", "Abrechnung wie gewohnt – nur optimiert"],
].map(([n, title, body, arrow]) => `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff;border-radius:8px;border-left:4px solid #0b367f;margin-bottom:10px;"><tr><td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;"><div style="background:#0b367f;color:#ffffff;font-family:verdana,sans-serif;font-size:13pt;font-weight:bold;width:32px;height:32px;border-radius:50%;text-align:center;line-height:32px;">${n}</div></td><td valign="top" style="padding:14px 14px 14px 10px;font-family:verdana,geneva,sans-serif;font-size:11pt;color:#333333;line-height:18pt;"><strong style="color:#0b367f;">${title}</strong><br>${body}<br><span style="color:#0b367f;">→ ${arrow}</span></td></tr></table>`).join("")}
</td></tr>
<tr><td height="20" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="background:#0b367f;border-radius:8px;padding:14px 20px;color:#ffffff;font-family:verdana,geneva,sans-serif;font-size:11pt;line-height:18pt;"><strong>Alle Schritte erfolgen lokal und nachvollziehbar!<br>Sie behalten jederzeit die volle Kontrolle über Ihre Abrechnungsdaten.</strong></td></tr>
<tr><td height="40" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;"><strong>Folgende Daten haben Sie an uns übermittelt:</strong></td></tr>
<tr><td>
<table border="0" cellpadding="3" cellspacing="0" width="100%">
<tr><td colspan="2" height="20" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td colspan="2" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;"><strong>Praxisdaten</strong></td></tr>
${[
  ["Praxisname:", praxis_name],
  ["Vorname:", vorname],
  ["Nachname:", nachname],
  ["E-Mail:", email],
  ["PLZ:", plz],
  ["Mobilnummer:", mobilnummer],
].map(([k, v]) => `<tr><td style="border-top:1px solid #444444;padding-top:6px;color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;">${k}</td><td style="border-top:1px solid #444444;padding-top:6px;color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;">${v}&nbsp;</td></tr>`).join("")}
<tr><td colspan="2" height="20" style="font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td colspan="2" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;"><strong>Abrechnungszentrum</strong></td></tr>
<tr><td style="border-top:1px solid #444444;padding-top:6px;color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;">Nutzen Sie ein Abrechnungszentrum?</td><td style="border-top:1px solid #444444;padding-top:6px;color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:16pt;">${abrechnungszentrum}&nbsp;</td></tr>
</table>
</td></tr>
</table>`;
  return renderBrandedEmail({
    subheadline: "Ihre Zugangsdaten",
    bodyHtml,
    bodyText: `Danke für Ihr Interesse am HFX Honorarfuchs!\n\nIhre Zugangsdaten für HFX.GOÄ\nE-Mail: ${email}\nBenutzername: ${hfx_customer_number}\nPasswort: ${generated_password}\n\nDownload MacOS: ${DOWNLOAD_URL_MAC}\nDownload Windows: ${DOWNLOAD_URL_WIN}`,
  }).html;
}

function buildDemoExpiryCustomerHtml() {
  const productName = "HFX EBM";
  const companyName = "Testpraxis Dr. Müller";
  const contactName = "Dr. Max Müller";
  const hfxNr = "HFX-D01234";
  const testEndFormatted = "01.04.2026";
  const stripeCheckoutUrl = "#stripe-checkout-demo-link";
  const ctaHtml = `
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff;border-radius:8px;border:1px solid #bfdbfe;margin:0 0 24px 0;">
          <tr><td style="padding:24px;">
            <p style="color:#0b367f;font-size:12pt;font-weight:700;margin:0 0 8px 0;">Jetzt direkt weiterbuchen</p>
            <p style="color:#333333;font-size:11pt;line-height:1.5;margin:0 0 16px 0;">
              Gefällt Ihnen <strong>${productName}</strong>? Buchen Sie jetzt direkt online und nutzen Sie das Produkt ohne Unterbrechung weiter.
            </p>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background-color:#0b367f;border-radius:6px;">
                <a href="${stripeCheckoutUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:11pt;font-weight:700;text-decoration:none;">Jetzt kostenpflichtig buchen</a>
              </td>
            </tr></table>
            <p style="color:#777777;font-size:9pt;margin:10px 0 0 0;">Sichere Zahlung per Kreditkarte oder SEPA-Lastschrift über Stripe.</p>
          </td></tr>
        </table>`;
  const bodyHtml = `
        <p style="margin:0 0 16px 0;">Guten Tag ${contactName},</p>
        <p style="margin:0 0 16px 0;">
          wir möchten Sie daran erinnern, dass Ihr Testquartal für <strong>${productName}</strong> (${companyName}) in 3 Tagen endet – am <strong>${testEndFormatted}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4ff;border-radius:6px;margin:0 0 24px 0;">
          <tr><td style="padding:16px 20px;">
            <p style="color:#0b367f;font-size:10pt;font-weight:700;margin:0 0 8px 0;">Ihr Testquartal</p>
            <p style="color:#333333;font-size:10pt;margin:0;"><strong>Produkt:</strong> ${productName}</p>
            <p style="color:#333333;font-size:10pt;margin:4px 0 0 0;"><strong>HFX-Nr.:</strong> ${hfxNr}</p>
            <p style="color:#333333;font-size:10pt;margin:4px 0 0 0;"><strong>Testende:</strong> ${testEndFormatted}</p>
          </td></tr>
        </table>
        ${ctaHtml}
        <p style="margin:0;">Mit freundlichen Grüßen,<br><strong>Ihr HFX Honorarfuchs Team</strong></p>`;
  return renderBrandedEmail({
    subheadline: "Ihr Testquartal endet bald",
    bodyHtml,
    bodyText: `Guten Tag ${contactName},\n\nIhr Testquartal für ${productName} (${companyName}) endet in 3 Tagen – am ${testEndFormatted}.\n\nProdukt: ${productName}\nHFX-Nr.: ${hfxNr}\nTestende: ${testEndFormatted}\n\nJetzt direkt weiterbuchen: ${stripeCheckoutUrl}\n\nMit freundlichen Grüßen,\nIhr HFX Honorarfuchs Team`,
  }).html;
}

function buildDemoLimitCustomerHtml() {
  const productName = "HFX GOÄ - die KI für ihre Privatabrechnung";
  const FALLBACK_CTA_TEXT =
    "Möchten Sie HFX weiter nutzen? Sprechen Sie uns an – wir erstellen Ihnen gerne ein individuelles Angebot.";
  const bodyHtml = `<table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">Guten Tag,</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Ihr kostenloses Testkontingent für <strong>${productName}</strong> ist aufgebraucht –
              Sie haben das Limit von <strong>200 geprüften Rechnungen</strong> erreicht.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="color:#856404;font-size:14px;font-weight:700;margin:0 0 4px;">Testkontingent aufgebraucht</p>
                <p style="color:#533f03;font-size:13px;margin:0;">
                  Das kostenlose Kontingent von 200 geprüften Rechnungen ist ausgeschöpft. Um weiterhin unbegrenzt Rechnungen zu erstellen, buchen Sie jetzt die Vollversion.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 0 24px;">
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
            ${FALLBACK_CTA_TEXT}
          </p>
        </td></tr>
        <tr>
          <td style="padding:0;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>
      </table>`;
  const bodyText = [
    "Guten Tag,",
    "",
    `Ihr kostenloses Testkontingent für ${productName} ist aufgebraucht – Sie haben das Limit von 200 geprüften Rechnungen erreicht.`,
    "",
    FALLBACK_CTA_TEXT,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr HFX Honorarfuchs Team",
  ].join("\n");
  return renderBrandedEmail({
    subheadline: "Ihr Testkontingent ist aufgebraucht",
    bodyHtml,
    bodyText,
  }).html;
}



function buildContractPartnerHtml() {
  const { customer_name, hfx_customer_number } = MOCK;
  const products = "HFX EBM Professional";
  const startDate = "01.03.2026";
  const detailsHtml = `
      <div style="background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">Vertragsdetails</h3>
        <p><strong>Kundennummer:</strong> ${hfx_customer_number}</p>
        <p><strong>Produkte:</strong> ${products}</p>
        <p><strong>Vertragsbeginn:</strong> ${startDate}</p>
      </div>`;

  const bodyHtml = `
        <p style="font-size: 16px;">Hallo,</p>
        <p>ein neuer Vertrag wurde erfolgreich für <strong>${customer_name}</strong> erstellt. Anbei finden Sie eine Kopie der Vertragsunterlagen für Ihre Unterlagen.</p>
        ${detailsHtml}
        <p>Diese E-Mail dient als Bestätigung des Vertragsabschlusses. Das Vertragsdokument ist als PDF beigefügt.</p>
      `;

  const bodyText = [
    "Hallo,",
    "",
    `ein neuer Vertrag wurde erfolgreich für ${customer_name} erstellt.`,
    "",
    `Kundennummer: ${hfx_customer_number}`,
    `Produkte: ${products}`,
    `Vertragsbeginn: ${startDate}`,
    "",
    "Das Vertragsdokument ist als PDF beigefügt.",
  ].join("\n");

  return renderBrandedEmail({
    subheadline: "Ihre Vertragskopie",
    bodyHtml,
    bodyText,
  }).html;
}

function buildInvoiceHtml() {
  const { invoice_number, customer_name, invoice_date, net_amount, tax_amount, gross_amount } = MOCK;
  const collectionDate = "03.03.2026"; // = invoice_date + 3 Werktage (live-Logik)
  const paymentMethodNote = "Der Betrag wird automatisch per SEPA-Lastschrift von Ihrem Konto eingezogen.";
  const bodyHtml = `<p style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:8px 12px;border-radius:6px;font-size:10pt;margin:0 0 16px 0;"><strong>Beispiel: SEPA-Einzug</strong> · Diese Vorschau zeigt einen von zwei Zahlwegen (SEPA-Lastschrift).</p>
<p style="font-size:16px;">Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie Ihre Rechnung <strong>${invoice_number}</strong> vom <strong>${invoice_date}</strong>.</p>
<p><strong>Rechnungsempfänger:</strong> ${customer_name} (${MOCK.hfx_customer_number})</p>
<p><strong>Adresse:</strong> Musterstraße 12, 80331 München</p>

<table style="width:100%;border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
  <thead><tr>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:left;">Beschreibung</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Menge</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Einzelpreis</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Gesamt</th>
  </tr></thead>
  <tbody>
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">HFX EBM Lizenz – Februar 2026</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">1</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">150,00 €</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">150,00 €</td>
    </tr>
  </tbody>
</table>

<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
  <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Nettobetrag:</span><strong>${net_amount}</strong></div>
  <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>MwSt. (19%):</span><span>${tax_amount}</span></div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:18px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${gross_amount}</strong></div>
</div>

<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
  <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>Automatischer Einzug</strong></p>
  <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">${paymentMethodNote}</p>
  <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;"><strong>Einzugsdatum:</strong> ${collectionDate}</p>
</div>`;
  return renderBrandedEmail({
    subheadline: "Ihre Rechnung",
    bodyHtml,
    bodyText: `Rechnung ${invoice_number} vom ${invoice_date}\nGesamtbetrag: ${gross_amount}\n${paymentMethodNote}\nEinzugsdatum: ${collectionDate}`,
  }).html;
}

function buildInvoicePdfPreviewHtml() {
  const { invoice_number, customer_name, invoice_date, due_date, net_amount, tax_amount, gross_amount } = MOCK;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f4f6fb; }
  .page { background: #fff; max-width: 595px; margin: 0 auto; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
  .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 20px 28px; display: flex; align-items: center; gap: 14px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 4px 0 0; font-size: 11px; opacity: 0.85; }
  .body { padding: 28px; }
  .meta { display: flex; gap: 24px; margin-bottom: 20px; font-size: 12px; color: #555; }
  .meta strong { color: #111; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: #0b367f; color: #fff; padding: 8px 10px; text-align: left; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  tbody td:last-child { text-align: right; }
  tbody tr:nth-child(even) td { background: #f5f7fa; }
  .totals { margin-top: 20px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; font-size: 13px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; color: #555; }
  .totals .total { display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #0b367f; margin-top: 8px; font-size: 15px; color: #0b367f; font-weight: bold; }
  .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 12px 28px; font-size: 10px; color: #9ca3af; text-align: center; }
  .badge { background: rgba(255,255,255,0.2); color: #fff; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: auto; }
</style>
</head><body>
<div class="page">
  <div class="header">
    <div>
      <h1>Rechnung ${invoice_number}</h1>
      <p>HFX Honorarfuchs – eine Marke der MCC Medical CareCapital GmbH</p>
    </div>
    <span class="badge">ENTWURF</span>
  </div>
  <div class="body">
    <div class="meta">
      <div><strong>Rechnungsempfänger</strong><br/>${customer_name}</div>
      <div><strong>Rechnungsnummer</strong><br/>${invoice_number}</div>
      <div><strong>Datum</strong><br/>${invoice_date}</div>
      <div><strong>Fällig am</strong><br/>${due_date}</div>
    </div>
    <table>
      <thead><tr>
        <th>Beschreibung</th>
        <th style="text-align:right">Menge</th>
        <th style="text-align:right">Einzelpreis</th>
        <th style="text-align:right">Gesamt</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>HFX EBM Lizenz – Februar 2026</td>
          <td style="text-align:right">1</td>
          <td style="text-align:right">150,00 €</td>
          <td style="text-align:right">150,00 €</td>
        </tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Nettobetrag:</span><span>${net_amount}</span></div>
      <div class="row"><span>Umsatzsteuer 19%:</span><span>${tax_amount}</span></div>
      <div class="total"><span>Gesamtbetrag (brutto):</span><span>${gross_amount}</span></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#555;">Bitte überweisen Sie den Betrag bis zum <strong>${due_date}</strong> auf unser Konto.</p>
    <p style="font-size:10px;color:#9ca3af;margin-top:4px;">Im ausgewiesenen Betrag sind 28,50 € Umsatzsteuer (19%) enthalten.</p>
  </div>
  <div class="footer">
    <p style="margin:0;font-weight:600;color:#374151;">HFX Honorarfuchs – eine Marke der MCC Medical CareCapital GmbH</p>
    <p style="margin:3px 0 0;">Hohenzollernstr. 47, 47799 Krefeld</p>
    <p style="margin:3px 0 0;">Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke &nbsp;·&nbsp; Amtsgericht Krefeld, HRB 14709</p>
    <p style="margin:3px 0 0;">USt-Id-Nr: DE 227 420 712 &nbsp;·&nbsp; www.hfx-honorarfuchs.de</p>
  </div>
</div>
</body></html>`;
}

function buildDashboardCredentialsHtml() {
  const { full_name, email } = { full_name: "Max Mustermann", email: MOCK.email };
  const roleLabel = "Vertriebspartner";
  const portalUrl = "https://sales.hfx-honorarfuchs.de";
  const password = "Ax7$kP2mQz9wLn3R";
  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:12pt;color:#333;">Hallo <strong>${full_name}</strong>,</p>
    <p style="margin:0 0 24px 0;font-size:11pt;color:#555;">Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als <strong>${roleLabel}</strong> registriert.</p>
    <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8;border-radius:8px;border:1px solid #d0d5dd;margin-bottom:8px;">
      <tr><td style="color:#444;font-size:12pt;line-height:20pt;">
        <strong style="font-size:10pt;color:#0b367f;text-transform:uppercase;letter-spacing:0.5px;">Ihre Zugangsdaten</strong><br><br>
        <strong>Registrierte E-Mail-Adresse:</strong> ${email}<br>
        <strong>Temporäres Passwort:</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px;font-size:13pt;letter-spacing:1px;">${password}</code>
      </td></tr>
    </table>
    ${renderBrandedButton({ href: portalUrl, label: "Zum Portal anmelden" })}
    <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background:#fff8e1;border-radius:6px;border:1px solid #f59e0b;">
      <tr><td style="font-size:10pt;color:#92400e;">
        <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung unter Einstellungen &rarr; Sicherheit.
      </td></tr>
    </table>
  `;
  return renderBrandedEmail({
    subheadline: "Ihre Zugangsdaten",
    bodyHtml,
    bodyText: `Hallo ${full_name},\n\nIhre Zugangsdaten:\nE-Mail: ${email}\nTemporäres Passwort: ${password}\n\nPortal: ${portalUrl}`,
  }).html;
}

function buildAdTippLeadHtml() {
  const tippgeberName = "Maria Musterfrau";
  const bodyHtml = `
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          Ein neuer Lead-Tipp von <strong>${tippgeberName}</strong> wurde eingereicht und Ihnen zugeordnet.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td width="160" style="padding:4px 0;font-size:13px;color:#6b7280;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">Dr. Max Mustermann</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">Praxis Mustermann</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:4px 0;font-size:13px;color:#111827;">80331</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">E-Mail Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:praxis@example.com" style="color:#0b367f;">praxis@example.com</a></td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Telefon Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="tel:+4989123456" style="color:#0b367f;">+49 89 123456</a></td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Geschäftsbereich</td><td style="padding:4px 0;font-size:13px;color:#111827;">HFX GOÄ</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">Dienstleistung</td><td style="padding:4px 0;font-size:13px;color:#111827;">Interesse an HFX.GOÄ – Demo gewünscht</td></tr>
            </table>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Empfohlen von</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td width="160" style="padding:4px 0;font-size:13px;color:#6b7280;">Tippgeber</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tippgeberName}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Kontakt</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:maria@example.com" style="color:#0b367f;">maria@example.com</a></td></tr>
            </table>
          </td></tr>
        </table>`;
  return renderBrandedEmail({
    subheadline: "Neuer Lead-Tipp eingegangen",
    bodyHtml,
    bodyText: `Hallo,\n\nEin neuer Lead-Tipp von ${tippgeberName} wurde eingereicht und Ihnen zugeordnet.\n\nLead-Details:\n- Arzt / Ärztin: Dr. Max Mustermann\n- Praxis: Praxis Mustermann\n- PLZ: 80331\n- Geschäftsbereich: HFX GOÄ`,
  }).html;
}


function buildAdDemoReminderHtml() {
  const testEndFormatted = "01.04.2026";
  const bodyHtml = `
        <p style="margin:0 0 16px 0;">Hallo,</p>
        <p style="margin:0 0 24px 0;">
          Das Testquartal eines Interessenten aus Ihrem Gebiet endet in <strong style="color:#0b367f;">3 Tagen</strong> am <strong style="color:#0b367f;">${testEndFormatted}</strong>. Dies ist ein guter Zeitpunkt, um Kontakt aufzunehmen.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 20px 0;">
          <tr><td style="background-color:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#777777;">Interessent</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;width:160px;">Unternehmen</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-weight:500;">Testpraxis GmbH</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">Ansprechpartner</td><td style="padding:4px 0;font-size:10pt;color:#111827;">Dr. Hans Mustermann</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">E-Mail</td><td style="padding:4px 0;font-size:10pt;color:#0b367f;"><a href="mailto:praxis@testgmbh.de" style="color:#0b367f;">praxis@testgmbh.de</a></td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">Telefon</td><td style="padding:4px 0;font-size:10pt;color:#0b367f;"><a href="tel:+4989654321" style="color:#0b367f;">+49 89 654321</a></td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">Produkt</td><td style="padding:4px 0;font-size:10pt;color:#111827;">HFX GOÄ - die KI für ihre Privatabrechnung</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">HFX-Nr.</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-family:monospace;">HFX-D01234</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#777777;">Testende</td><td style="padding:4px 0;font-size:10pt;color:#0b367f;font-weight:600;">${testEndFormatted}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0;">Bitte nehmen Sie zeitnah Kontakt auf, um einen Abschluss zu begleiten.</p>`;
  return renderBrandedEmail({
    subheadline: "Testquartal endet in 3 Tagen",
    bodyHtml,
    bodyText: `Hallo,\n\nDas Testquartal eines Interessenten aus Ihrem Gebiet endet in 3 Tagen am ${testEndFormatted}.\n\nUnternehmen: Testpraxis GmbH\nAnsprechpartner: Dr. Hans Mustermann\nTestende: ${testEndFormatted}\n\nBitte nehmen Sie zeitnah Kontakt auf.`,
  }).html;
}


function buildAdNewLeadHtml() {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, hfx_customer_number } = MOCK;
  const adName = "Uwe Waldenmeyer";
  const bodyHtml = `
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
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mobilnummer}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:5px 0;font-size:13px;color:#111827;">${plz}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Abrechnung</td><td style="padding:5px 0;font-size:13px;color:#111827;">Kein Abrechnungszentrum</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${hfx_customer_number}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 0;font-size:13px;color:#374151;line-height:1.6;background:#f0f5ff;border-left:3px solid #0b367f;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>`;
  return renderBrandedEmail({
    subheadline: "Neuer Lead eingegangen",
    bodyHtml,
    bodyText: `Hallo ${adName},\n\nein neuer Interessent hat sich über die HFX-Webseite registriert und wurde dir automatisch aufgrund der PLZ-Zuordnung zugewiesen.\n\nPraxis: ${praxis_name}\nName: ${vorname} ${nachname}\nE-Mail: ${email}\nTelefon: ${mobilnummer}\nPLZ: ${plz}\nHFX-Nummer: ${hfx_customer_number}`,
  }).html;
}


function buildAdLeadAssignmentHtml() {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, hfx_customer_number } = MOCK;
  const adName = "Uwe Waldenmeyer";
  const ort = "München";
  const abrechnung = "Qodia";
  const status = "neu";

  const bodyHtml = `
      <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>${adName}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        dir wurde ein Interessent manuell zugewiesen. Bitte nimm zeitnah Kontakt auf.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <tr><td style="background:#fef2f4;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#b6193d;">Lead-Details</p>
        </td></tr>
        <tr><td style="padding:16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:160px;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:700;">${hfx_customer_number}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${praxis_name}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Name</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${vorname} ${nachname}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:5px 0;font-size:13px;color:#b6193d;">${email}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mobilnummer}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ / Ort</td><td style="padding:5px 0;font-size:13px;color:#111827;">${plz} ${ort}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Abrechnung</td><td style="padding:5px 0;font-size:13px;color:#111827;">${abrechnung}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:5px 0;font-size:13px;color:#111827;">${status}</td></tr>
          </table>
        </td></tr>
      </table>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;background:#fafafa;border-left:3px solid #b6193d;padding:12px 16px;border-radius:0 4px 4px 0;">
        <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
      </p>
    `;

  const bodyText = [
    `Hallo ${adName},`,
    "",
    "ein Interessent wurde dir manuell zugewiesen. Bitte nimm zeitnah Kontakt auf.",
    "",
    `HFX-Nummer: ${hfx_customer_number}`,
    `Praxis: ${praxis_name}`,
    `Name: ${vorname} ${nachname}`,
    `E-Mail: ${email}`,
    `Telefon: ${mobilnummer}`,
    `PLZ / Ort: ${plz} ${ort}`,
    "",
    "Den Lead findest du im HFX-Portal unter Interessenten.",
  ].join("\n");

  return renderBrandedEmail({
    subheadline: "Lead-Zuweisung",
    bodyHtml,
    bodyText,
  }).html;
}


// ─── Mock data for PDF preview ─────────────────────────────────────────────────
const MOCK_CONTRACT_PDF_DATA = {
  hfx_customer_number: "HFX-I01019",
  praxis: "Testpraxis Dr. Müller",
  fachrichtung: "Allgemeinmedizin",
  vorname: "Max",
  nachname: "Mustermann",
  adresse: "Musterstraße 12, 80331 München",
  telefon: "+49 89 1234567",
  email: "max.mustermann@example.com",
  mp_nr: "MP-001019",
  sales_partner_name: "Uwe Waldenmeyer",
  product_name: "HFX EBM",
  modules: ["HFX EBM", "HFX GOÄ"],
  license_count: 1,
  start_date: new Date().toISOString().split("T")[0],
  end_date: "2099-12-31",
  duration_months: 0,
  cancellation_period_months: 6,
  auto_renewal: true,
  monthly_price: 99.0,
  one_time_fee: 0,
  discount_percent: 0,
  payment_interval: "monatlich",
  kontoinhaber: "Max Mustermann",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "COBADEFFXXX",
  status: "aktiv",
  notes: "Muster-Vertrag zur Vorschau. Kein rechtlich bindendes Dokument.",
  product_price_details: [
    {
      name: "HFX EBM",
      monthly_price: 79.0,
      price_per_unit: 0.05,
      price_per_unit_label: "GOÄ-Ziffer",
      has_active_promo: false,
    },
    {
      name: "HFX GOÄ",
      monthly_price: 20.0,
      price_per_unit: null,
      has_active_promo: false,
    },
  ],
};

const MOCK_INVOICE_PDF_DATA = {
  invoice_number: "RE-2026-0002",
  customer_name: "Test GmbH",
  customer_number: "HFX-I01019",
  adresse: "Musterstraße 12",
  plz: "80331",
  ort: "München",
  rechnungs_email: "rechnung@test-gmbh.de",
  invoice_date: new Date().toISOString().split("T")[0],
  due_date: null,
  positions: [
    { description: "HFX EBM Lizenz – März 2026", quantity: 1, unit_price: 150.00 },
  ],
  net_amount: 150.00,
  tax_rate: 19,
  tax_amount: 28.50,
  gross_amount: 178.50,
  status: "entwurf",
  notes: null,
};

function buildAdminAccessRequestHtml() {
  const { vorname, nachname, email } = MOCK;
  const fullName = `${vorname} ${nachname}`;
  const company = "Muster Praxis GmbH";
  const message = "Ich würde gerne Zugang zum HFX Sales Portal beantragen.";
  const bodyHtml = `
      <p style="margin:0 0 16px 0;">Eine neue Zugangsanfrage ist eingegangen:</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;width:120px;">Name</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${fullName}</td></tr>
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;">E-Mail</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${email}</td></tr>
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;">Firma</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${company}</td></tr>
        <tr><td style="padding:6px 0;font-size:11pt;color:#777777;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Nachricht</td><td style="padding:6px 0;font-size:11pt;color:#333333;">${message}</td></tr>
      </table>
      <p style="margin:16px 0 0 0;">Bitte im Admin-Portal anmelden, um die Anfrage zu bearbeiten.</p>
  `;
  return renderBrandedEmail({
    subheadline: "Neue Zugangsanfrage",
    bodyHtml,
    bodyText: `Neue Zugangsanfrage von ${fullName} (${email}, ${company}).\n\nNachricht: ${message}`,
  }).html;
}

const DEFAULT_HTML: Record<string, () => string> = {
  "lead-confirmation": buildLeadConfirmationHtml,
  "contract-partner": buildContractPartnerHtml,
  
  "invoice": buildInvoiceHtml,
  "invoice-pdf": buildInvoicePdfPreviewHtml,
  "dashboard-credentials": buildDashboardCredentialsHtml,
  "demo-expiry-customer": buildDemoExpiryCustomerHtml,
  "demo-limit-customer": buildDemoLimitCustomerHtml,
  "ad-tipp-lead": buildAdTippLeadHtml,
  "ad-demo-reminder": buildAdDemoReminderHtml,
  "ad-new-lead": buildAdNewLeadHtml,
  "ad-lead-assignment": buildAdLeadAssignmentHtml,
  "admin-access-request": buildAdminAccessRequestHtml,
};

function getHtmlForTemplate(id: TemplateId) {
  const raw = DEFAULT_HTML[id]?.() ?? "";
  // WIRED IDs werden über renderBrandedEmail (SSOT) gebaut und brauchen kein Logo-Patching.
  return WIRED_IDS.has(id) ? raw : patchLogo(raw);
}

/** IDs where we show the live pdf-lib PDF preview button */
const PDF_PREVIEW_TEMPLATE_IDS: TemplateId[] = ["post-payment-contract-pdf", "invoice"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailPreview() {
  const { isAdmin } = useUserRole();
  const [activeModal, setActiveModal] = useState<{ template: Template; mode: "email" | "pdf" } | null>(null);
  const [editModal, setEditModal] = useState<{ template: Template; mode: "email" | "pdf" } | null>(null);

  // Persisted custom HTML per template key (loaded from backend)
  const [customHtml, setCustomHtml] = useState<Record<string, string>>({});
  // Editor buffer
  const [editorValue, setEditorValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // PDF preview (uses PdfViewerOverlay via showPdfInViewer)

  // AI assistant state
  const [aiModal, setAiModal] = useState<{ template: Template; mode: "email" | "pdf" } | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreviewHtml, setAiPreviewHtml] = useState<string | null>(null);

  const openPdfPreview = async (tpl: Template) => {
    try {
      // Fetch logo for the PDF header
      let logoBytes: ArrayBuffer | undefined;
      try {
        const logoRes = await fetch("/logo.png");
        if (logoRes.ok) logoBytes = await logoRes.arrayBuffer();
      } catch { /* proceed without logo */ }

      let pdfBytes: Uint8Array;
      if (tpl.id === "invoice") {
        pdfBytes = await generateInvoicePdf(MOCK_INVOICE_PDF_DATA, logoBytes);
      } else {
        const { generateContractPdf } = await import("@/lib/generateContractPdf");
        pdfBytes = await generateContractPdf(MOCK_CONTRACT_PDF_DATA, logoBytes);
      }
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = tpl.id === "invoice" ? "Rechnung-Vorschau.pdf" : "Vertrag-Vorschau.pdf";
      showPdfInViewer(url, filename);
    } catch (err) {
      console.error("PDF preview error:", err);
      toast.error("PDF konnte nicht generiert werden.");
    }
  };


  // Load saved templates on mount
  useEffect(() => {
    async function loadTemplates() {
      const { data, error } = await supabase
        .from("email_template_overrides" as any)
        .select("template_key, html_content");
      if (!error && data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((row) => { map[row.template_key] = row.html_content; });
        setCustomHtml(map);
      }
      setIsLoading(false);
    }
    loadTemplates();
  }, []);

  const getStorageKey = (tpl: Template, mode: "email" | "pdf") =>
    mode === "pdf" ? "invoice-pdf" : tpl.id;

  const getRenderedHtml = useCallback(
    (tpl: Template, mode: "email" | "pdf") => {
      const key = getStorageKey(tpl, mode);
      const raw = WIRED_IDS.has(key)
        ? getHtmlForTemplate(key as TemplateId)              // WIRED: nur Builder
        : (customHtml[key] ?? getHtmlForTemplate(key as TemplateId));
      return WIRED_IDS.has(key) ? raw : patchLogo(raw);
    },
    [customHtml]
  );

  const openEdit = (tpl: Template, mode: "email" | "pdf") => {
    const key = getStorageKey(tpl, mode);
    setEditorValue(customHtml[key] ?? getHtmlForTemplate(key as TemplateId));
    setEditModal({ template: tpl, mode });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    const key = getStorageKey(editModal.template, editModal.mode);
    setIsSaving(true);
    const { error } = await supabase
      .from("email_template_overrides" as any)
      .upsert({ template_key: key, html_content: editorValue }, { onConflict: "template_key" });
    setIsSaving(false);
    if (error) {
      toast.error("Fehler beim Speichern: " + error.message);
      return;
    }
    setCustomHtml((prev) => ({ ...prev, [key]: editorValue }));
    setEditModal(null);
    toast.success("Vorlage gespeichert");
  };

  const resetTemplate = async (tpl: Template, mode: "email" | "pdf") => {
    const key = getStorageKey(tpl, mode);
    const { error } = await supabase
      .from("email_template_overrides" as any)
      .delete()
      .eq("template_key", key);
    if (error) {
      toast.error("Fehler beim Zurücksetzen: " + error.message);
      return;
    }
    setCustomHtml((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Vorlage zurückgesetzt");
  };

  const hasCustom = (tpl: Template, mode: "email" | "pdf") => {
    const key = getStorageKey(tpl, mode);
    return !!customHtml[key];
  };

  const openAiEditor = (tpl: Template, mode: "email" | "pdf") => {
    setAiInstruction("");
    setAiPreviewHtml(null);
    setAiModal({ template: tpl, mode });
  };

  const runAiEdit = async () => {
    if (!aiModal || !aiInstruction.trim()) return;
    const key = getStorageKey(aiModal.template, aiModal.mode);
    const currentHtml = aiPreviewHtml ?? customHtml[key] ?? getHtmlForTemplate(key as TemplateId);

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("edit-email-template", {
        body: { html: currentHtml, instruction: aiInstruction.trim() },
      });
      if (error) throw error;
      if (data?.html) {
        setAiPreviewHtml(data.html);
        setAiInstruction("");
        toast.success("Änderung angewendet – prüfe die Vorschau");
      } else {
        throw new Error("Keine Antwort erhalten");
      }
    } catch (err: any) {
      toast.error(err?.message || "KI-Fehler");
    } finally {
      setAiLoading(false);
    }
  };

  const saveAiResult = async () => {
    if (!aiModal || !aiPreviewHtml) return;
    const key = getStorageKey(aiModal.template, aiModal.mode);
    setIsSaving(true);
    const { error } = await supabase
      .from("email_template_overrides" as any)
      .upsert({ template_key: key, html_content: aiPreviewHtml }, { onConflict: "template_key" });
    setIsSaving(false);
    if (error) {
      toast.error("Fehler beim Speichern: " + error.message);
      return;
    }
    setCustomHtml((prev) => ({ ...prev, [key]: aiPreviewHtml }));
    setAiModal(null);
    setAiPreviewHtml(null);
    toast.success("Vorlage gespeichert");
  };

  // ─── Hidden templates (localStorage) ─────────────────────────────────────
  const HIDDEN_KEY = "hfx-email-preview-hidden";
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
    } catch { return []; }
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const hideTemplate = async (id: string) => {
    // Also delete any saved custom HTML overrides for this template
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      const emailKey = getStorageKey(tpl, "email");
      const pdfKey = getStorageKey(tpl, "pdf");
      // Delete from DB
      await supabase.from("email_template_overrides" as any).delete().in("template_key", [emailKey, pdfKey]);
      // Remove from local state
      setCustomHtml((prev) => {
        const next = { ...prev };
        delete next[emailKey];
        delete next[pdfKey];
        return next;
      });
    }
    const next = [...hiddenIds, id];
    setHiddenIds(next);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    toast.success("Vorlage endgültig gelöscht");
    setDeleteConfirmId(null);
  };

  const restoreTemplate = (id: string) => {
    const next = hiddenIds.filter((h) => h !== id);
    setHiddenIds(next);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    toast.success("Vorlage wiederhergestellt");
  };

  const restoreAll = () => {
    setHiddenIds([]);
    localStorage.removeItem(HIDDEN_KEY);
    toast.success("Alle Vorlagen wiederhergestellt");
  };

  return (
    <MainLayout title="E-Mail & PDF Vorschau" subtitle={isAdmin ? "Vorschau aller E-Mail- und PDF-Vorlagen" : "Nur-Lese-Ansicht – Bearbeitung nur für Admins"}>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground mb-1">Vorlagen-Übersicht</h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Klicke auf eine Vorlage, um die Vorschau zu öffnen oder den Inhalt zu bearbeiten. Änderungen werden dauerhaft gespeichert."
                : "Klicke auf eine Vorlage, um die Vorschau zu öffnen. Das Bearbeiten ist nur Administratoren vorbehalten."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hiddenIds.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={restoreAll}>
                <RotateCw className="w-3.5 h-3.5" />
                {hiddenIds.length} ausgeblendet – alle zurücksetzen
              </Button>
            )}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {!isAdmin && <Lock className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Template groups */}
        {(["kunden", "intern"] as const).map((cat) => {
          const groupTemplates = TEMPLATES.filter((t) => t.category === cat && !hiddenIds.includes(t.id));
          const groupLabel = cat === "kunden" ? "Kunden-Mails" : "Interne Mails";
          const groupDesc = cat === "kunden"
            ? "E-Mails, die direkt an Interessenten und Kunden gesendet werden"
            : "Benachrichtigungen an Vertriebsmitarbeiter und interne Nutzer";
          if (groupTemplates.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{groupLabel}</h3>
                  <p className="text-xs text-muted-foreground">{groupDesc}</p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {groupTemplates.length} Vorlagen
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groupTemplates.map((tpl) => (
                  <div key={tpl.id} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {tpl.type === "pdf" ? <FileText className="w-4 h-4 text-primary" /> : <Mail className="w-4 h-4 text-primary" />}
                        <span className="font-semibold text-foreground">{tpl.label}</span>
                        {WIRED_IDS.has(tpl.id) && (
                          <span
                            className="ml-auto text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30"
                            title="Vorschau kommt aus dem Live-SSOT (renderBrandedEmail)."
                          >
                            Live-SSOT
                          </span>
                        )}
                        {STALE_IDS.has(tpl.id) && (
                          <span
                            className="ml-auto text-[10px] font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40"
                            title="Diese Vorschau ist ein Mock — die echte Live-Mail wurde noch nicht auf renderBrandedEmail umgestellt."
                          >
                            Vorschau veraltet — Live-Mail noch nicht umgestellt
                          </span>
                        )}
                        {NO_LIVE_IDS.has(tpl.id) && (
                          <span
                            className="ml-auto text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border"
                            title="Für diese Vorlage gibt es keine echte Live-Mail (Leiche oder reine PDF-Vorschau)."
                          >
                            Kein Live-Pendant
                          </span>
                        )}
                        {!WIRED_IDS.has(tpl.id) && (hasCustom(tpl, "email") || (tpl.id === "invoice" && hasCustom(tpl, "pdf"))) && (
                          <span className="text-[10px] font-medium bg-warning/20 text-warning-foreground px-1.5 py-0.5 rounded border border-warning/30">Bearbeitet</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">Betreff: {tpl.subject}</p>
                      <div className="flex justify-end mt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                          title={WIRED_IDS.has(tpl.id) ? "Vorschau ist an den Live-SSOT gebunden" : "Vorlage löschen"}
                          disabled={WIRED_IDS.has(tpl.id)}
                          onClick={() => setDeleteConfirmId(tpl.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* E-Mail row — only for email-type templates */}
                    {tpl.type === "email" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => setActiveModal({ template: tpl, mode: "email" })}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        E-Mail
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={WIRED_IDS.has(tpl.id)}
                            title={WIRED_IDS.has(tpl.id) ? "Vorschau ist an den Live-SSOT gebunden" : undefined}
                            onClick={() => openAiEditor(tpl, "email")}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            KI
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={WIRED_IDS.has(tpl.id)}
                            title={WIRED_IDS.has(tpl.id) ? "Vorschau ist an den Live-SSOT gebunden" : undefined}
                            onClick={() => openEdit(tpl, "email")}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            HTML
                          </Button>
                          {hasCustom(tpl, "email") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                              title={WIRED_IDS.has(tpl.id) ? "Vorschau ist an den Live-SSOT gebunden" : "Zurücksetzen"}
                              disabled={WIRED_IDS.has(tpl.id)}
                              onClick={() => resetTemplate(tpl, "email")}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    )}



                    {/* PDF row – live pdf-lib preview (post-payment-contract-pdf, invoice) */}
                    {PDF_PREVIEW_TEMPLATE_IDS.includes(tpl.id) && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => openPdfPreview(tpl)}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {tpl.id === "invoice" ? "Rechnungs-PDF (Design 2)" : "Vertragszusammenfassung PDF"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Preview Modal ── */}
      <Dialog open={!!activeModal} onOpenChange={() => setActiveModal(null)}>
        <DialogContent className="max-w-3xl w-full p-0 gap-0 overflow-hidden" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-5 py-3 border-b border-border bg-muted/40 flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-sm font-semibold">
                {activeModal?.mode === "pdf" ? "📄 PDF Vorschau" : "✉️ E-Mail Vorschau"} — {activeModal?.template.label}
              </DialogTitle>
              {activeModal?.mode === "email" && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span><span className="font-mono">Von:</span> {activeModal.template.from}</span>
                  <span><span className="font-mono">Betreff:</span> {activeModal.template.subject}</span>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="overflow-auto" style={{ maxHeight: "calc(90vh - 64px)" }}>
            {activeModal && (
              <iframe
                srcDoc={getRenderedHtml(activeModal.template, activeModal.mode)}
                title="Preview"
                className="w-full border-0"
                style={{ height: 700, minWidth: 0 }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* ── Edit Modal ── */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-6xl w-full p-0 gap-0 overflow-hidden" style={{ maxHeight: "95vh" }}>
          <DialogHeader className="px-5 py-3 border-b border-border bg-muted/40 flex-row items-center gap-3 space-y-0">
            <Pencil className="w-4 h-4 text-primary shrink-0" />
            <DialogTitle className="text-sm font-semibold flex-1">
              Bearbeiten — {editModal?.template.label} ({editModal?.mode === "pdf" ? "PDF" : "E-Mail"})
            </DialogTitle>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setEditModal(null)}>Abbrechen</Button>
              <Button size="sm" onClick={saveEdit} disabled={isSaving} className="gap-1.5">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Speichern
              </Button>
            </div>
          </DialogHeader>

          {/* Split: editor left, live preview right */}
          <div className="flex overflow-hidden" style={{ height: "calc(95vh - 60px)" }}>
            {/* Editor */}
             <div className="w-1/2 flex flex-col border-r border-border overflow-hidden">
              <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border font-mono">
                HTML-Editor
              </div>
              <div className="flex-1 overflow-auto">
                <CodeMirror
                  value={editorValue}
                  onChange={(val) => setEditorValue(val)}
                  extensions={[html()]}
                  theme={oneDark}
                  height="100%"
                  style={{ fontSize: 12, height: "100%" }}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    autocompletion: true,
                    bracketMatching: true,
                  }}
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="w-1/2 flex flex-col">
              <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border font-mono flex items-center gap-2">
                <Eye className="w-3 h-3" />
                Live-Vorschau
              </div>
              <iframe
                srcDoc={editorValue}
                title="Live Preview"
                className="flex-1 w-full border-0"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Assistant Modal ── */}
      <Dialog open={!!aiModal} onOpenChange={() => { setAiModal(null); setAiPreviewHtml(null); }}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden" style={{ maxHeight: "92vh" }}>
          <DialogHeader className="px-5 py-3 border-b border-border bg-muted/40 flex-row items-center gap-3 space-y-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <DialogTitle className="text-sm font-semibold flex-1">
              KI-Assistent — {aiModal?.template.label}
            </DialogTitle>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => { setAiModal(null); setAiPreviewHtml(null); }}>Abbrechen</Button>
              {aiPreviewHtml && (
                <Button size="sm" onClick={saveAiResult} disabled={isSaving} className="gap-1.5">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Übernehmen
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex flex-col overflow-hidden" style={{ height: "calc(92vh - 60px)" }}>
            {/* Preview */}
            <div className="flex-1 overflow-auto">
              {aiModal && (
                <iframe
                  srcDoc={aiPreviewHtml ?? getRenderedHtml(aiModal.template, aiModal.mode)}
                  title="AI Preview"
                  className="w-full border-0"
                  style={{ height: "100%", minHeight: 500 }}
                />
              )}
            </div>

            {/* AI instruction input */}
            <div className="border-t border-border bg-muted/30 p-4">
              <div className="flex gap-3 items-end max-w-3xl mx-auto">
                <Textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder="Beschreibe deine Änderung, z.B. 'Ändere den Button-Text zu Jetzt buchen' oder 'Füge unter der Begrüßung einen Hinweis auf 30 Tage Testphase ein'"
                  className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      runAiEdit();
                    }
                  }}
                />
                <Button
                  onClick={runAiEdit}
                  disabled={aiLoading || !aiInstruction.trim()}
                  size="sm"
                  className="gap-1.5 h-[44px] px-5"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Anwenden
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Mehrere Änderungen nacheinander möglich · Enter zum Absenden · Nach Prüfung auf „Übernehmen" klicken
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage wird aus der Übersicht entfernt und alle gespeicherten Anpassungen (Entwürfe) werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && hideTemplate(deleteConfirmId)}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
