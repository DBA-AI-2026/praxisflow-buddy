import { useState, useCallback, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, FileText, Pencil, Eye, RotateCcw, Save, Loader2, Lock, Sparkles, Send, Trash2, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { useUserRole } from "@/hooks/useUserRole";
import { generateContractPdf } from "@/lib/generateContractPdf";
import { generateInvoicePdf } from "@/lib/generateInvoicePdf";
import { showPdfInViewer } from "@/lib/pdfViewerState";
import { Textarea } from "@/components/ui/textarea";

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
type TemplateId = "lead-confirmation" | "contract-customer" | "contract-customer-pdf-send" | "contract-partner" | "contract-paper-confirmation" | "booking-link" | "post-payment-contract-pdf" | "invoice" | "invoice-pdf" | "dashboard-credentials" | "demo-expiry-customer" | "ad-tipp-lead" | "ad-demo-reminder" | "ad-new-lead" | "ad-lead-assignment";

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
    subject: "Bestätigung Ihrer Anfrage – Honorarfuchs",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "E-Mail an neuen Interessenten mit Zugangsdaten",
    category: "kunden",
  },
  {
    id: "demo-expiry-customer",
    label: "Testphase läuft ab",
    subject: "⏰ Erinnerung: Ihre Testphase endet am 01.04.2026",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Erinnerungsmail an den Interessenten 3 Tage vor Ablauf der Testphase – mit Stripe-Buchungslink",
    category: "kunden",
  },
  {
    id: "contract-paper-confirmation",
    label: "Vertragsbestätigung (manuell)",
    subject: "Ihr HFX-Vertrag – jetzt verbindlich buchen (HFX-I01019)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "E-Mail an Kunden nach Papiervertrag-Upload durch AD – einziger Button 'Verbindlich buchen' → Stripe. Vertrag aktiviert sich nach Zahlung automatisch.",
    category: "kunden",
  },
  {
    id: "booking-link",
    label: "Digitaler Vertragsabschluss (Buchungslink)",
    subject: "Ihre HFX-Vertragsbestätigung (HFX-I01019)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Wird vom Vertrieb manuell ausgelöst: sendet dem Interessenten einen Buchungslink zur /buchen-Seite. Dort gibt der Kunde Fachrichtung, Rechtsform und ggf. BSNR/LANR an und zahlt via Stripe – der Vertrag aktiviert sich automatisch.",
    category: "kunden",
    hasPdfPreview: true,
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
    id: "contract-customer",
    label: "Vertrag (Kunde)",
    subject: "Ihr Vertrag mit HFX Honorarfuchs",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Vertragsbestätigung an Kunden nach Aktivierung",
    category: "kunden",
  },
  {
    id: "contract-customer-pdf-send",
    label: "Vertrag + Vorschau per Mail (Kunde)",
    subject: "Ihre Vertragsunterlagen – HFX EBM, HFX GOÄ",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Manueller E-Mail-Versand an Kunden: Vertragsdokument + Produktvorschau als Anhang",
    category: "kunden",
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
    label: "Vertrag (Vertrieb)",
    subject: "Neuer Vertrag abgeschlossen – HFX Sales Portal",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an Vertriebspartner nach Vertragsabschluss",
    category: "intern",
  },
  {
    id: "ad-new-lead",
    label: "AD: Neuer Website-Lead",
    subject: "🔔 Neuer Lead: Testpraxis Dr. Müller (80331)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an AD wenn ein neuer Interessent über die HFX-Webseite eingeht",
    category: "intern",
  },
  {
    id: "ad-lead-assignment",
    label: "AD: Lead manuell zugewiesen",
    subject: "📋 Lead zugewiesen: Testpraxis Dr. Müller (80331)",
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
    label: "AD: Testphasen-Ablauf",
    subject: "⏰ Testphase endet bald: Testpraxis GmbH (01.04.2026)",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "AD-Benachrichtigung parallel zur Kunden-Erinnerung bei Demo-Ablauf",
    category: "intern",
  },
];

// ─── HTML builders ────────────────────────────────────────────────────────────
function buildLeadConfirmationHtml() {
  const { hfx_customer_number, generated_password, praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum } = MOCK;
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
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:20pt;">
<strong>E-Mail:</strong> ${email}<br>
<strong>Passwort:</strong> <code style="background:#fff; padding:2px 8px; border-radius:4px; font-size:13pt; letter-spacing:1px;">${generated_password}</code><br>
<strong>Name (Kundennummer):</strong> ${hfx_customer_number}
</td></tr></table>
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
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:16pt; line-height:24pt; color:#0b367f;"><strong>So funktioniert HFX.GOÄ</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="6">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="font-family:verdana, geneva, sans-serif; font-size:10pt; color:#888888;">In 5 einfachen Schritten zur optimierten Abrechnung</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="24">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="0" cellspacing="0" width="100%">

<tr><td style="padding-bottom:10px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;">
<tr>
  <td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;">
    <div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">1</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;">
    <strong style="color:#0b367f;">Vorbereitung – Daten bereitstellen</strong><br>
    Patientenverwaltungssystem kurz offline nehmen<br>
    PAD-Datei aus dem PVS exportieren<br>
    <span style="color:#0b367f;">→ Saubere Ausgangsbasis für die Analyse</span>
  </td>
</tr>
</table>
</td></tr>

<tr><td style="padding-bottom:10px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;">
<tr>
  <td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;">
    <div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">2</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;">
    <strong style="color:#0b367f;">Import – Daten in HFX.GOÄ laden</strong><br>
    PAD-Datei hochladen<br>
    Keine Einrichtung notwendig<br>
    <span style="color:#0b367f;">→ Der Import erfolgt in wenigen Sekunden</span>
  </td>
</tr>
</table>
</td></tr>

<tr><td style="padding-bottom:10px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;">
<tr>
  <td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;">
    <div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">3</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;">
    <strong style="color:#0b367f;">Analyse – Abrechnung prüfen lassen</strong><br>
    Analyse per Klick starten<br>
    Auffälligkeiten &amp; Potenziale erkennen<br>
    <span style="color:#0b367f;">→ Automatisiert, strukturiert, nachvollziehbar</span>
  </td>
</tr>
</table>
</td></tr>

<tr><td style="padding-bottom:10px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;">
<tr>
  <td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;">
    <div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">4</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;">
    <strong style="color:#0b367f;">Entscheidung – Optimierungen bewerten</strong><br>
    Vorschläge prüfen &amp; Entscheidungen selbst treffen<br>
    Keine automatischen Änderungen<br>
    <span style="color:#0b367f;">→ Sie behalten jederzeit die Kontrolle</span>
  </td>
</tr>
</table>
</td></tr>

<tr><td style="padding-bottom:0;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff; border-radius:8px; border-left:4px solid #0b367f;">
<tr>
  <td width="52" align="center" valign="top" style="padding:14px 0 14px 14px;">
    <div style="background:#0b367f; color:#ffffff; font-family:verdana,sans-serif; font-size:13pt; font-weight:bold; width:32px; height:32px; border-radius:50%; text-align:center; line-height:32px;">5</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 10px; font-family:verdana, geneva, sans-serif; font-size:11pt; color:#333333; line-height:18pt;">
    <strong style="color:#0b367f;">Abschluss – Optimierte Abrechnung übergeben</strong><br>
    Neue PAD-Datei speichern &amp; optional ins PVS laden<br>
    Übergabe an Ihr Abrechnungszentrum<br>
    <span style="color:#0b367f;">→ Abrechnung wie gewohnt – nur optimiert</span>
  </td>
</tr>
</table>
</td></tr>

</table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="24">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="background:#0b367f; border-radius:8px; padding:14px 20px; color:#ffffff; font-family:verdana, geneva, sans-serif; font-size:11pt; line-height:18pt;"><strong>Alle Schritte erfolgen lokal und nachvollziehbar!<br>Sie behalten jederzeit die volle Kontrolle über Ihre Abrechnungsdaten.</strong></td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:18pt;"><strong>Folgende Daten haben Sie an uns übermittelt:</strong></td></tr>
<tr><td>
<table border="0" cellpadding="3" cellspacing="0" width="100%"><tbody>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Praxisdaten</strong></td><td></td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Praxisname:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${praxis_name}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Vorname:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${vorname}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nachname:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${nachname}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">E-Mail:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${email}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">PLZ:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${plz}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Mobilnummer:</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${mobilnummer}&nbsp;</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="40">&nbsp;</td><td></td></tr>
<tr><td align="left" valign="top" style="color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;"><strong>Abrechnungszentrum</strong></td><td></td></tr>
<tr><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">Nutzen Sie ein Abrechnungszentrum?</td><td align="left" valign="top" style="border-top:1px solid #444444; padding-top:6px; color:#444444; font-family:verdana, geneva, sans-serif; font-size:12pt; line-height:16pt;">${abrechnungszentrum}&nbsp;</td></tr>
</tbody></table>
</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="60">&nbsp;</td></tr>
<tr><td align="center" valign="top" style="color:#888888; font-family:verdana, geneva, sans-serif; font-size:9pt;">© ${new Date().getFullYear()} Honorarfuchs · Qodia GmbH</td></tr>
<tr><td align="left" valign="top" style="font-size:0; line-height:0;" height="20">&nbsp;</td></tr>
</table></td></tr></table></td></tr></table></td></tr></table>`;
}

function buildDemoExpiryCustomerHtml() {
  const testEndFormatted = "01.04.2026";
  const productName = "HFX GOÄ - die KI für ihre Privatabrechnung";
  const companyName = "Testpraxis Dr. Müller";
  const contactName = "Dr. Max Müller";
  const hfxNr = "HFX-D01234";
  const stripeCheckoutUrl = "#stripe-checkout-demo-link";
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <!-- Header Banner -->
  <tr>
    <td align="center" valign="top" bgcolor="#ffffff">
      <img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Mailheader-Neutral-hfx-1200px.png" alt="Honorarfuchs" width="600" height="80" border="0" style="display:block;border-width:0px;" />
    </td>
  </tr>
  <!-- Blue header bar -->
  <tr>
    <td style="background-color:#0b367f;padding:24px 40px;text-align:center;">
      <p style="color:#ffffff;font-size:18pt;font-weight:bold;margin:0;font-family:verdana,geneva,sans-serif;">⏰ Ihre Testphase läuft bald ab</p>
      <p style="color:#c8d8f0;font-size:11pt;margin:6px 0 0 0;font-family:verdana,geneva,sans-serif;">HFX Honorarfuchs – Erinnerung</p>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 40px 24px;">
      <p style="font-size:12pt;color:#333333;margin:0 0 16px 0;font-family:verdana,geneva,sans-serif;">Guten Tag <strong>${contactName}</strong>,</p>
      <p style="font-size:11pt;color:#555555;line-height:18pt;margin:0 0 16px 0;font-family:verdana,geneva,sans-serif;">
        wir möchten Sie daran erinnern, dass Ihre Testphase für <strong>${productName}</strong>
        (${companyName}) in <strong>3 Tagen</strong> – am <strong>${testEndFormatted}</strong> – abläuft.
      </p>
      <!-- Info box -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff;border-radius:8px;border:1px solid #c8d8f0;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="font-size:10pt;color:#0b367f;font-weight:bold;text-transform:uppercase;margin:0 0 10px 0;font-family:verdana,geneva,sans-serif;">📋 Ihre Testphase</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:5px 0;font-size:10pt;color:#777777;width:140px;font-family:verdana,geneva,sans-serif;">Produkt</td>
                <td style="padding:5px 0;font-size:10pt;color:#333333;font-family:verdana,geneva,sans-serif;"><strong>${productName}</strong></td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:10pt;color:#777777;font-family:verdana,geneva,sans-serif;">HFX-Nr.</td>
                <td style="padding:5px 0;font-size:10pt;color:#0b367f;font-weight:bold;font-family:monospace;">${hfxNr}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:10pt;color:#777777;font-family:verdana,geneva,sans-serif;">Testende</td>
                <td style="padding:5px 0;font-size:11pt;color:#0b367f;font-weight:bold;font-family:verdana,geneva,sans-serif;">${testEndFormatted}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- CTA Box -->
  <tr>
    <td style="padding:0 40px 32px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,#f0f7ff,#e8f0fe);border-radius:8px;border:1px solid #bfdbfe;">
        <tr>
          <td style="padding:24px;">
            <p style="color:#1e40af;font-size:13pt;font-weight:bold;margin:0 0 10px 0;font-family:verdana,geneva,sans-serif;">🚀 Jetzt direkt weiterbuchen</p>
            <p style="color:#374151;font-size:11pt;line-height:17pt;margin:0 0 16px 0;font-family:verdana,geneva,sans-serif;">
              Gefällt Ihnen <strong>${productName}</strong>? Buchen Sie jetzt direkt online und nutzen Sie das Produkt ohne Unterbrechung weiter.
            </p>
            <table border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#0b367f;border-radius:6px;">
                  <a href="${stripeCheckoutUrl}" style="display:block;padding:14px 28px;color:#ffffff;font-size:12pt;font-weight:bold;text-decoration:none;font-family:verdana,geneva,sans-serif;">
                    ✅ Jetzt kostenpflichtig buchen →
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#6b7280;font-size:9pt;margin:10px 0 0;font-family:verdana,geneva,sans-serif;">Sichere Zahlung per Kreditkarte oder SEPA-Lastschrift über Stripe.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- Sign off -->
  <tr>
    <td style="padding:0 40px 32px;">
      <p style="font-size:11pt;color:#374151;line-height:18pt;margin:0;font-family:verdana,geneva,sans-serif;">
        Mit freundlichen Grüßen,<br>
        <strong>Ihr HFX Honorarfuchs Team</strong>
      </p>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background-color:#f8f8f8;padding:16px 40px;border-top:1px solid #eeeeee;text-align:center;">
      <p style="font-size:9pt;color:#aaaaaa;margin:0;font-family:verdana,geneva,sans-serif;">© Honorarfuchs GmbH · Bei Fragen: info@honorarfuchs.de</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildContractCustomerHtml() {
  const { customer_name, hfx_customer_number } = MOCK;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#fff;">
<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
<tr><td align="center">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="HFX Logo" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;"/>
    <h1 style="color:#fff;margin:0;font-size:22px;font-family:Arial,sans-serif;">Ihr Vertrag ist aktiv!</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-family:Arial,sans-serif;font-size:14px;">HFX Honorarfuchs – Sales Portal</p>
  </div>
</td></tr>
<tr><td style="background:#f9fafb;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
  <p style="font-family:Arial,sans-serif;font-size:16px;color:#333;">Sehr geehrte Damen und Herren,</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;">Ihr Vertrag mit HFX Honorarfuchs wurde erfolgreich aktiviert. Vielen Dank für Ihr Vertrauen!</p>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Kundenname:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;font-weight:bold;padding:4px 0;">${customer_name}</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">HFX-Kundennummer:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#0b367f;font-weight:bold;padding:4px 0;">${hfx_customer_number}</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Produkt:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;padding:4px 0;">HFX EBM Professional</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Startdatum:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;padding:4px 0;">01.03.2026</td></tr>
    </table>
  </div>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;">Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;">Mit freundlichen Grüßen,<br/><strong>Das HFX Team</strong></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;margin:0;">© ${new Date().getFullYear()} Honorarfuchs – HFX Sales Portal</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildContractPartnerHtml() {
  const { customer_name, hfx_customer_number } = MOCK;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#fff;">
<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
<tr><td align="center">
  <div style="background:linear-gradient(135deg,#b6193d,#d42050);padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="HFX Logo" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;"/>
    <h1 style="color:#fff;margin:0;font-size:22px;font-family:Arial,sans-serif;">Neuer Vertrag abgeschlossen! 🎉</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-family:Arial,sans-serif;font-size:14px;">HFX Honorarfuchs – Sales Portal</p>
  </div>
</td></tr>
<tr><td style="background:#f9fafb;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
  <p style="font-family:Arial,sans-serif;font-size:16px;color:#333;">Hallo,</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;">Ein neuer Vertrag wurde erfolgreich abgeschlossen und aktiviert.</p>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Kundenname:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;font-weight:bold;padding:4px 0;">${customer_name}</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">HFX-Nummer:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#b6193d;font-weight:bold;padding:4px 0;">${hfx_customer_number}</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Produkt:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;padding:4px 0;">HFX EBM Professional</td></tr>
    <tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#666;padding:4px 0;">Laufzeit:</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;padding:4px 0;">12 Monate ab 01.03.2026</td></tr>
    </table>
  </div>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;">Herzlichen Glückwunsch zum Abschluss!</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;margin:0;">© ${new Date().getFullYear()} Honorarfuchs – HFX Sales Portal</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildInvoiceHtml() {
  const { invoice_number, customer_name, invoice_date, due_date, net_amount, tax_amount, gross_amount } = MOCK;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#fff;">
<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="HFX Logo" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;"/>
    <h1 style="color:#fff;margin:0;font-size:22px;">Rechnung ${invoice_number}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:13px;">Honorarfuchs – HFX Sales Portal</p>
  </div>
  <div style="background:#f9fafb;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
    <p style="font-size:15px;color:#333;">Sehr geehrte Damen und Herren,</p>
    <p style="font-size:14px;color:#555;line-height:1.6;">anbei erhalten Sie Ihre Rechnung <strong>${invoice_number}</strong> vom <strong>${invoice_date}</strong>.</p>
    <p style="font-size:14px;color:#555;"><strong>Rechnungsempfänger:</strong> ${customer_name}</p>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;">
      <thead><tr style="background:#0b367f;">
        <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;">Beschreibung</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;">Menge</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;">Einzelpreis</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;">Gesamt</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">HFX EBM Lizenz – Februar 2026</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">1</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">150,00 €</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">150,00 €</td></tr>
      </tbody>
    </table>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Nettobetrag:</span><strong>${net_amount}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6b7280;"><span>MwSt. (19%):</span><span>${tax_amount}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:16px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${gross_amount}</strong></div>
    </div>
    <p style="margin-top:20px;font-size:14px;color:#555;"><strong>Zahlungsziel:</strong> ${due_date}</p>
    <p style="font-size:12px;color:#6b7280;margin-top:4px;">📎 Das PDF dieser Rechnung ist als Anhang beigefügt.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#374151;font-weight:600;margin:0;">HFX Honorarfuchs – ein Geschäftsbereich von MCC Medical CareCapital GmbH</p>
    <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Hohenzollernstr. 47, 47799 Krefeld</p>
    <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke &nbsp;·&nbsp; Amtsgericht Krefeld, HRB 14709</p>
    <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">USt-Id-Nr: DE 227 420 712 &nbsp;·&nbsp; <a href="https://www.hfx-honorarfuchs.de" style="color:#0b367f;">www.hfx-honorarfuchs.de</a></p>
    <p style="font-size:10px;color:#9ca3af;margin:8px 0 0;">Diese Rechnung wurde automatisch aus dem HFX Sales Portal erstellt.</p>
  </div>
</div>
</body></html>`;
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
      <p>HFX Honorarfuchs GmbH</p>
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
    <p style="margin:0;font-weight:600;color:#374151;">HFX Honorarfuchs – ein Geschäftsbereich von MCC Medical CareCapital GmbH</p>
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
  const portalUrl = "https://praxisflow-buddy.lovable.app";
  const password = "Ax7$kP2mQz9wLn3R";
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>
    <td style="background-color:#0b367f;padding:30px 40px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22pt;margin:0;font-family:verdana,geneva,sans-serif;">🦊 Willkommen!</h1>
      <p style="color:#c8d8f0;font-size:11pt;margin:8px 0 0 0;">HFX Sales Portal · das Portal für den Vertrieb</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px;">
      <p style="font-size:12pt;color:#333333;margin:0 0 12px 0;">Hallo <strong>${full_name}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als <strong>${roleLabel}</strong> registriert.</p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8;border-radius:8px;border:1px solid #d0d5dd;margin-bottom:24px;">
        <tr><td align="left" valign="top" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:20pt;">
          <strong style="font-size:10pt;color:#0b367f;text-transform:uppercase;letter-spacing:0.5px;">Ihre Zugangsdaten</strong><br><br>
          <strong>Registrierte E-Mail-Adresse:</strong> ${email}<br>
          <strong>Temporäres Passwort:</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px;font-size:13pt;letter-spacing:1px;">${password}</code>
        </td></tr>
      </table>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center">
          <a href="${portalUrl}" style="display:inline-block;background-color:#0b367f;color:#ffffff;font-family:verdana,geneva,sans-serif;font-size:12pt;font-weight:bold;padding:12px 32px;border-radius:6px;text-decoration:none;">Zum Portal anmelden</a>
        </td></tr>
      </table>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background:#fff8e1;border-radius:6px;border:1px solid #f59e0b;">
        <tr><td style="font-size:10pt;color:#92400e;font-family:verdana,geneva,sans-serif;">
          ⚠️ <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung unter Einstellungen → Sicherheit.
        </td></tr>
      </table>
    </td>
  </tr>
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

function buildAdTippLeadHtml() {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Neuer Lead-Tipp eingegangen 🎯</h1>
        <p style="margin:8px 0 0;color:#c7d7f5;font-size:14px;">Tippgeber: Maria Musterfrau</p>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          Ein neuer Lead-Tipp wurde durch einen Tippgeber eingereicht und Ihnen zugeordnet.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">Dr. Max Mustermann</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">Praxis Mustermann</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:4px 0;font-size:13px;color:#111827;">80331</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">E-Mail Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:praxis@example.com" style="color:#0b367f;">praxis@example.com</a></td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Telefon Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="tel:+4989123456" style="color:#0b367f;">+49 89 123456</a></td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Geschäftsbereich</td><td style="padding:4px 0;font-size:13px;color:#111827;">MCC</td></tr>
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
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Tippgeber</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">Maria Musterfrau</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Kontakt</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:maria@example.com" style="color:#0b367f;">maria@example.com</a></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${year} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildAdDemoReminderHtml() {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
  <!-- Mailheader Banner -->
  <tr><td align="center" valign="top" bgcolor="#ffffff">
    <img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Mailheader-Neutral-hfx-1200px.png" alt="Honorarfuchs" width="600" height="80" border="0" style="border-width:0px;display:block;" />
  </td></tr>
  <!-- Body -->
  <tr><td bgcolor="#ffffff">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="580" style="margin:0 auto;">
      <tr><td style="font-size:0;line-height:0;height:32px;">&nbsp;</td></tr>
      <!-- Alert banner -->
      <tr><td align="center" valign="top" style="background:#0b367f;border-radius:8px;padding:16px 20px;">
        <p style="margin:0;color:#ffffff;font-family:verdana,geneva,sans-serif;font-size:14pt;font-weight:bold;">⏰ Testphase läuft in 3 Tagen ab</p>
        <p style="margin:6px 0 0;color:#c7d7f5;font-family:verdana,geneva,sans-serif;font-size:10pt;">Jetzt Kontakt aufnehmen!</p>
      </td></tr>
      <tr><td style="font-size:0;line-height:0;height:24px;">&nbsp;</td></tr>
      <!-- Greeting -->
      <tr><td align="left" valign="top" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;">
        Hallo,
      </td></tr>
      <tr><td style="font-size:0;line-height:0;height:12px;">&nbsp;</td></tr>
      <tr><td align="left" valign="top" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:18pt;">
        Die Testphase eines Interessenten aus Ihrem Gebiet endet in <strong style="color:#0b367f;">3 Tagen</strong> am <strong style="color:#0b367f;">01.04.2026</strong>. Dies ist ein guter Zeitpunkt, um Kontakt aufzunehmen.
      </td></tr>
      <tr><td style="font-size:0;line-height:0;height:20px;">&nbsp;</td></tr>
      <!-- Details box -->
      <tr><td>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f4ff;border-radius:8px;border:1px solid #d0d9ef;">
          <tr><td style="background:#0b367f;border-radius:8px 8px 0 0;padding:10px 16px;">
            <p style="margin:0;color:#ffffff;font-family:verdana,geneva,sans-serif;font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">Interessent</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table border="0" cellpadding="3" cellspacing="0" width="100%">
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">Unternehmen</td>
                <td align="left" valign="top" style="color:#111827;font-family:verdana,geneva,sans-serif;font-size:10pt;font-weight:bold;">Testpraxis GmbH</td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">Ansprechpartner</td>
                <td align="left" valign="top" style="color:#111827;font-family:verdana,geneva,sans-serif;font-size:10pt;">Dr. Hans Mustermann</td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">E-Mail</td>
                <td align="left" valign="top" style="font-family:verdana,geneva,sans-serif;font-size:10pt;"><a href="mailto:praxis@testgmbh.de" style="color:#0b367f;">praxis@testgmbh.de</a></td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">Telefon</td>
                <td align="left" valign="top" style="font-family:verdana,geneva,sans-serif;font-size:10pt;"><a href="tel:+4989654321" style="color:#0b367f;">+49 89 654321</a></td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">Produkt</td>
                <td align="left" valign="top" style="color:#111827;font-family:verdana,geneva,sans-serif;font-size:10pt;">HFX.GOÄ Demo</td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">HFX-Nr.</td>
                <td align="left" valign="top" style="color:#111827;font-family:verdana,geneva,sans-serif;font-size:10pt;font-family:monospace;">HFX-D01234</td>
              </tr>
              <tr>
                <td align="left" valign="top" width="160" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;">Testende</td>
                <td align="left" valign="top" style="color:#0b367f;font-family:verdana,geneva,sans-serif;font-size:10pt;font-weight:bold;">01.04.2026</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="font-size:0;line-height:0;height:20px;">&nbsp;</td></tr>
      <tr><td align="left" valign="top" style="color:#666666;font-family:verdana,geneva,sans-serif;font-size:10pt;line-height:16pt;border-left:3px solid #0b367f;padding:10px 14px;background:#f8fafc;border-radius:0 4px 4px 0;">
        <strong>Bitte nehmen Sie zeitnah Kontakt auf</strong>, um einen Abschluss zu begleiten. Den Interessenten finden Sie im HFX-Portal unter <em>Demo-Tracking</em>.
      </td></tr>
      <tr><td style="font-size:0;line-height:0;height:40px;">&nbsp;</td></tr>
    </table>
  </td></tr>
  <!-- Footer -->
  <tr><td bgcolor="#f9fafb" style="border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-family:verdana,geneva,sans-serif;font-size:9pt;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
    <p style="margin:4px 0 0;color:#9ca3af;font-family:verdana,geneva,sans-serif;font-size:9pt;">© ${year} HFX Honorarfuchs GmbH</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildAdNewLeadHtml() {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, hfx_customer_number } = MOCK;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#b6193d,#d42050);padding:32px 24px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#f9c0cc;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Neuer Lead eingegangen</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Neuer Interessent über die HFX-Webseite</h1>
        <p style="margin:8px 0 0;color:#f9c0cc;font-size:14px;">Automatische Zuweisung nach PLZ ${plz}</p>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>Uwe Waldenmeyer</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          ein neuer Interessent hat sich über die HFX-Webseite registriert und wurde dir automatisch aufgrund der PLZ-Zuordnung zugewiesen.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#fef2f4;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#b6193d;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:160px;">Praxis</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${praxis_name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Name</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${vorname} ${nachname}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:5px 0;font-size:13px;color:#b6193d;">${email}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mobilnummer}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:5px 0;font-size:13px;color:#111827;">${plz}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Ort</td><td style="padding:5px 0;font-size:13px;color:#111827;">München</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Abrechnung</td><td style="padding:5px 0;font-size:13px;color:#111827;">Kein Abrechnungszentrum</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${hfx_customer_number}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;background:#fafafa;border-left:3px solid #b6193d;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${year} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildContractCustomerPdfSendHtml() {
  const { vorname, nachname, hfx_customer_number } = MOCK;
  const year = new Date().getFullYear();
  const customerName = `${vorname} ${nachname}`;
  const products = "HFX EBM, HFX GOÄ";
  const startDate = new Date().toLocaleDateString("de-DE");

  const detailsHtml = `
    <div style="background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #374151;">Vertragsdetails</h3>
      <p style="margin:4px 0;"><strong>Kundennummer:</strong> ${hfx_customer_number}</p>
      <p style="margin:4px 0;"><strong>Produkte:</strong> ${products}</p>
      <p style="margin:4px 0;"><strong>Vertragsbeginn:</strong> ${startDate}</p>
    </div>`;

  return `<!DOCTYPE html><html><head><style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
    .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
  </style></head><body><div class="container">
    <div class="header">
      <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="Honorarfuchs Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;" />
      <h1 style="margin: 0; font-size: 28px;">Vertragsbestätigung</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Honorarfuchs</p>
    </div>
    <div class="content">
      <p style="font-size: 16px;">Sehr geehrte/r <strong>${customerName}</strong>,</p>
      <p>vielen Dank für Ihr Vertrauen! Anbei erhalten Sie Ihre Vertragsunterlagen als PDF-Dokument.</p>
      ${detailsHtml}
      <p>Bitte prüfen Sie die beigefügten Unterlagen sorgfältig. Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
      <p style="font-size: 13px; color: #6b7280; background: #f3f4f6; border-radius: 6px; padding: 10px 14px; margin-top: 16px;">
        <strong>Anhänge dieser E-Mail:</strong><br>
        📄 Vertrag-${hfx_customer_number}.pdf – Unterzeichnetes Vertragsdokument<br>
        📊 Produktvorschau-${hfx_customer_number}.pdf – Produktübersicht (falls vorhanden)
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;">Bei Fragen wenden Sie sich bitte an Ihren Ansprechpartner.</p>
      <p style="margin: 10px 0 0 0; font-size: 12px;">© ${year} Honorarfuchs - HFX Sales Portal</p>
    </div>
  </div></body></html>`;
}

function buildAdLeadAssignmentHtml() {
  const { praxis_name, vorname, nachname, email, plz, mobilnummer, hfx_customer_number } = MOCK;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#b6193d,#d42050);padding:32px 24px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#f9c0cc;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Lead-Zuweisung</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Dir wurde ein Interessent zugewiesen</h1>
        <p style="margin:8px 0 0;color:#f9c0cc;font-size:14px;">Manuelle Zuweisung durch das HFX-Team</p>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hallo <strong>Uwe Waldenmeyer</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          ein Interessent wurde dir manuell zugewiesen. Bitte nimm zeitnah Kontakt auf.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#fef2f4;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#b6193d;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:160px;">HFX-Nummer</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:700;font-family:monospace;">${hfx_customer_number}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;">${praxis_name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Name</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${vorname} ${nachname}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">E-Mail</td><td style="padding:5px 0;font-size:13px;color:#b6193d;">${email}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Telefon</td><td style="padding:5px 0;font-size:13px;color:#111827;">${mobilnummer}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">PLZ / Ort</td><td style="padding:5px 0;font-size:13px;color:#111827;">${plz} München</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:5px 0;font-size:13px;color:#111827;">neu</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;background:#fafafa;border-left:3px solid #b6193d;padding:12px 16px;border-radius:0 4px 4px 0;">
          <strong>Nächster Schritt:</strong> Bitte nimm zeitnah Kontakt mit dem Interessenten auf. Du findest den Lead im HFX-Portal unter <em>Interessenten</em>.
        </p>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${year} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildContractPaperConfirmationHtml() {
  const { hfx_customer_number, praxis_name, vorname, nachname } = MOCK;
  const year = new Date().getFullYear();
  const stripeUrl = "https://checkout.stripe.com/pay/demo-preview-cs_test_xxx";
  const startDate = "01.04.2026";
  const endDate = "31.03.2027";
  const price = "179,00 €/Monat";
  const duration = "12";
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihr HFX-Vertrag – jetzt verbindlich buchen</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Verdana,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:36px 40px;text-align:center;">
            <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;letter-spacing:-0.5px;">🦊 HFX Honorarfuchs</p>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">Ihr Vertrag wartet auf Ihre Buchung</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:36px 40px 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 12px;">Guten Tag ${vorname} ${nachname},</p>
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
              wir haben Ihren Vertrag erhalten und für Sie vorbereitet. Mit einem Klick auf den Button unten schließen Sie die Buchung <strong>kostenpflichtig</strong> ab – Ihr Vertrag wird danach automatisch aktiviert.
            </p>
          </td>
        </tr>

        <!-- Contract Details Box -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="background:#0b367f;padding:12px 20px;">
                  <p style="color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0;">📋 Ihre Vertragsdetails</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">HFX-Kundennummer</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;font-family:monospace;">${hfx_customer_number}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Produkt</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">HFX GOÄ – die KI für Ihre Privatabrechnung</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Praxis</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;">${praxis_name}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Monatspreis</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${price}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Laufzeit</td>
                      <td style="padding:6px 0;font-size:13px;color:#111827;">${duration} Monate (${startDate} – ${endDate})</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Buchungs-CTA (einziger Button) -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0b367f,#1a4a9e);border-radius:10px;overflow:hidden;">
              <tr><td style="padding:28px 32px;text-align:center;">
                <p style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.6;margin:0 0 20px;">
                  Ihr Außendienstmitarbeiter hat Ihren Vertragsabschluss vorbereitet.<br>
                  Bitte schließen Sie die Buchung verbindlich ab – Ihre Zahlung aktiviert den Vertrag automatisch.
                </p>
                <table cellpadding="0" cellspacing="0" align="center">
                  <tr><td style="background:#ffffff;border-radius:8px;padding:0;">
                    <a href="${stripeUrl}"
                       style="display:block;padding:16px 40px;color:#0b367f;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                      Verbindlich buchen →
                    </a>
                  </td></tr>
                </table>
                <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:14px 0 0;">
                  Sichere Zahlung via Stripe · Kreditkarte oder SEPA-Lastschrift · SSL-verschlüsselt
                </p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- AGB-Download -->
        <tr>
          <td style="padding:0 40px 16px;">
            <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0;">
              📄 <a href="https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf" style="color:#0b367f;">Allgemeine Geschäftsbedingungen (AGB) herunterladen</a>
            </p>
          </td>
        </tr>

        <!-- Sign-off -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">
              Bei Fragen stehen wir Ihnen gerne unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a> zur Verfügung.<br><br>
              Mit freundlichen Grüßen,<br>
              <strong>Ihr HFX Honorarfuchs Team</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.<br>
              © ${year} HFX Honorarfuchs GmbH
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildBookingLinkHtml() {
  const year = new Date().getFullYear();
  const buchenUrl = `https://praxisflow-buddy.lovable.app/buchen?contract_id=demo&product=${encodeURIComponent("HFX EBM")}`;
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Verdana,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);max-width:600px;">
  <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:36px 40px;text-align:center;">
    <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">🦊 HFX Honorarfuchs</p>
    <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">Ihr Vertrag wartet auf Ihre Buchung</p>
  </td></tr>
  <tr><td style="padding:36px 40px 24px;">
    <p style="color:#1a1a2e;font-size:16px;margin:0 0 12px;">Guten Tag ${MOCK.vorname} ${MOCK.nachname},</p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">wir haben Ihren Vertrag erhalten und für Sie vorbereitet. Mit einem Klick auf den Button unten schließen Sie die Buchung kostenpflichtig ab – Ihr Vertrag wird danach automatisch aktiviert.</p>
  </td></tr>
  <tr><td style="padding:0 40px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <tr><td style="background:#0b367f;padding:12px 20px;"><p style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0;">📋 Ihre Vertragsdetails</p></td></tr>
      <tr><td style="padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:160px;">HFX-Kundennummer</td><td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;font-family:monospace;">${MOCK.hfx_customer_number}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Produkt</td><td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">HFX EBM</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:6px 0;font-size:13px;color:#111827;">${MOCK.praxis_name}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Monatspreis</td><td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">99,00 €/Monat</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Kündigung</td><td style="padding:6px 0;font-size:13px;color:#111827;">Unbefristet · 6 Monate Frist zum Monatsende</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 40px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0b367f,#1a4a9e);border-radius:10px;">
      <tr><td style="padding:28px 32px;text-align:center;">
        <p style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.6;margin:0 0 20px;">Ihr Vertrag wurde für Sie vorbereitet.<br>Bitte schließen Sie die Buchung verbindlich ab – Ihre Zahlung aktiviert den Vertrag automatisch.</p>
        <table cellpadding="0" cellspacing="0" align="center"><tr><td style="background:#ffffff;border-radius:8px;">
          <a href="${buchenUrl}" style="display:block;padding:16px 40px;color:#0b367f;font-size:16px;font-weight:700;text-decoration:none;">Verbindlich buchen →</a>
        </td></tr></table>
        <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:14px 0 0;">Sichere Zahlung via Stripe · Kreditkarte oder SEPA-Lastschrift · SSL-verschlüsselt</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 40px 16px;"><p style="color:#6b7280;font-size:12px;margin:0;">📄 <a href="https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf" style="color:#0b367f;">AGB herunterladen</a></p></td></tr>
  <tr><td style="padding:0 40px 32px;"><p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">Bei Fragen: <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a><br><br>Mit freundlichen Grüßen,<br><strong>Ihr HFX Honorarfuchs Team</strong></p></td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;"><p style="color:#9ca3af;font-size:11px;margin:0;">HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.<br>© ${year} HFX Honorarfuchs GmbH</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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

const DEFAULT_HTML: Record<string, () => string> = {
  "lead-confirmation": buildLeadConfirmationHtml,
  "contract-customer": buildContractCustomerHtml,
  "contract-customer-pdf-send": buildContractCustomerPdfSendHtml,
  "contract-partner": buildContractPartnerHtml,
  "contract-paper-confirmation": buildContractPaperConfirmationHtml,
  "booking-link": buildBookingLinkHtml,
  "invoice": buildInvoiceHtml,
  "invoice-pdf": buildInvoicePdfPreviewHtml,
  "dashboard-credentials": buildDashboardCredentialsHtml,
  "demo-expiry-customer": buildDemoExpiryCustomerHtml,
  "ad-tipp-lead": buildAdTippLeadHtml,
  "ad-demo-reminder": buildAdDemoReminderHtml,
  "ad-new-lead": buildAdNewLeadHtml,
  "ad-lead-assignment": buildAdLeadAssignmentHtml,
};

function getHtmlForTemplate(id: TemplateId) {
  return DEFAULT_HTML[id]?.() ?? "";
}

/** IDs where we show the live pdf-lib PDF preview button */
const PDF_PREVIEW_TEMPLATE_IDS: TemplateId[] = ["booking-link", "post-payment-contract-pdf", "invoice"];

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
      return customHtml[key] ?? getHtmlForTemplate(key as TemplateId);
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

  const hideTemplate = (id: string) => {
    const next = [...hiddenIds, id];
    setHiddenIds(next);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    toast("Vorlage ausgeblendet", { action: { label: "Rückgängig", onClick: () => restoreTemplate(id) } });
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
                      <div className="flex items-center gap-2 mb-1">
                        {tpl.type === "pdf" ? <FileText className="w-4 h-4 text-primary" /> : <Mail className="w-4 h-4 text-primary" />}
                        <span className="font-semibold text-foreground">{tpl.label}</span>
                        {(hasCustom(tpl, "email") || (tpl.id === "invoice" && hasCustom(tpl, "pdf"))) && (
                          <span className="ml-auto text-[10px] font-medium bg-warning/20 text-warning-foreground px-1.5 py-0.5 rounded border border-warning/30">Bearbeitet</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">Betreff: {tpl.subject}</p>
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
                            className="gap-1.5"
                            onClick={() => openAiEditor(tpl, "email")}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            KI
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => openEdit(tpl, "email")}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            HTML
                          </Button>
                          {hasCustom(tpl, "email") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 text-muted-foreground"
                              title="Zurücksetzen"
                              onClick={() => resetTemplate(tpl, "email")}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    )}


                    {/* PDF row – live pdf-lib preview (booking-link, post-payment-contract-pdf, invoice) */}
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
    </MainLayout>
  );
}
