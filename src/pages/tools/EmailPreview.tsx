import { useState, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Mail, FileText, Pencil, Eye, RotateCcw, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
type TemplateId = "lead-confirmation" | "contract-customer" | "contract-partner" | "invoice" | "invoice-pdf";

interface Template {
  id: TemplateId;
  label: string;
  subject: string;
  from: string;
  type: "email" | "pdf";
  description: string;
}

const TEMPLATES: Template[] = [
  {
    id: "lead-confirmation",
    label: "Lead-Bestätigung",
    subject: "Bestätigung Ihrer Anfrage – Honorarfuchs",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "E-Mail an neuen Interessenten mit Zugangsdaten",
  },
  {
    id: "contract-customer",
    label: "Vertrag (Kunde)",
    subject: "Ihr Vertrag mit HFX Honorarfuchs",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Vertragsbestätigung an Kunden nach Aktivierung",
  },
  {
    id: "contract-partner",
    label: "Vertrag (Vertrieb)",
    subject: "Neuer Vertrag abgeschlossen – HFX Sales Portal",
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Benachrichtigung an Vertriebspartner",
  },
  {
    id: "invoice",
    label: "Rechnung",
    subject: `Rechnung ${MOCK.invoice_number} – ${MOCK.customer_name}`,
    from: "noreply@hfx-honorarfuchs.de",
    type: "email",
    description: "Rechnungs-E-Mail mit PDF-Anhang",
  },
];

// ─── HTML builders ────────────────────────────────────────────────────────────
function buildLeadConfirmationHtml() {
  const { hfx_customer_number, generated_password, praxis_name, vorname, nachname, email, plz, mobilnummer, abrechnungszentrum } = MOCK;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#fff;">
<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td>
<table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
<tr><td align="center" bgcolor="#ffffff">
  <img src="https://hfx-honorarfuchs.de/wp-content/uploads/2026/01/Mailheader-Neutral-hfx-1200px.png" alt="Honorarfuchs" width="600" height="80" border="0"/>
</td></tr>
<tr><td bgcolor="#ffffff" align="center">
<table align="center" border="0" cellpadding="0" cellspacing="0" width="580">
<tr><td height="40">&nbsp;</td></tr>
<tr><td style="font-family:verdana,sans-serif;font-size:16pt;line-height:24pt;color:#444;"><strong>Danke für Ihr Interesse am Honorarfuchs!</strong></td></tr>
<tr><td height="20">&nbsp;</td></tr>
<tr><td style="color:#444;font-family:verdana,sans-serif;font-size:12pt;line-height:18pt;">Mit HFX.GOÄ gewinnen Sie schnell Klarheit über Ihre Abrechnung.</td></tr>
<tr><td height="20">&nbsp;</td></tr>
<tr><td style="color:#444;font-family:verdana,sans-serif;font-size:12pt;line-height:18pt;"><strong>Ihre Zugangsdaten für HFX.GOÄ:</strong></td></tr>
<tr><td height="10">&nbsp;</td></tr>
<tr><td>
  <table border="0" cellpadding="12" cellspacing="0" width="100%" style="background:#f0f4f8;border-radius:8px;border:1px solid #d0d5dd;">
  <tr><td style="color:#444;font-family:verdana,sans-serif;font-size:12pt;line-height:20pt;">
    <strong>Benutzername:</strong> ${hfx_customer_number}<br/>
    <strong>Passwort:</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px;font-size:13pt;">${generated_password}</code>
  </td></tr></table>
</td></tr>
<tr><td height="30">&nbsp;</td></tr>
<tr><td style="color:#444;font-family:verdana,sans-serif;font-size:12pt;line-height:18pt;"><strong>Folgende Daten haben Sie übermittelt:</strong></td></tr>
<tr><td height="10">&nbsp;</td></tr>
<tr><td>
<table border="0" cellpadding="4" cellspacing="0" width="100%">
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">Praxisname:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${praxis_name}</td></tr>
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">Name:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${vorname} ${nachname}</td></tr>
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">E-Mail:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${email}</td></tr>
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">PLZ:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${plz}</td></tr>
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">Mobil:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${mobilnummer}</td></tr>
<tr><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">Abrechnungszentrum:</td><td style="border-top:1px solid #ddd;padding-top:6px;color:#444;font-family:verdana,sans-serif;font-size:11pt;">${abrechnungszentrum}</td></tr>
</table>
</td></tr>
<tr><td height="40">&nbsp;</td></tr>
<tr><td align="center" style="color:#888;font-family:verdana,sans-serif;font-size:9pt;">© ${new Date().getFullYear()} Honorarfuchs · Qodia GmbH</td></tr>
<tr><td height="20">&nbsp;</td></tr>
</table></td></tr></table></td></tr></table>
</body></html>`;
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
    <p style="font-size:11px;color:#9ca3af;margin:0;">Diese Rechnung wurde automatisch erstellt. © Honorarfuchs – HFX Sales Portal</p>
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
  <div class="footer">HFX Honorarfuchs GmbH · Steuer-Nr: XX/XXX/XXXXX · USt-IdNr: DEXXXXXXXXX · IBAN: DEXX XXXX XXXX XXXX XXXX XX</div>
</div>
</body></html>`;
}

const DEFAULT_HTML: Record<string, () => string> = {
  "lead-confirmation": buildLeadConfirmationHtml,
  "contract-customer": buildContractCustomerHtml,
  "contract-partner": buildContractPartnerHtml,
  "invoice": buildInvoiceHtml,
  "invoice-pdf": buildInvoicePdfPreviewHtml,
};

function getHtmlForTemplate(id: TemplateId) {
  return DEFAULT_HTML[id]?.() ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailPreview() {
  const [activeModal, setActiveModal] = useState<{ template: Template; mode: "email" | "pdf" } | null>(null);
  const [editModal, setEditModal] = useState<{ template: Template; mode: "email" | "pdf" } | null>(null);

  // Persisted custom HTML per template key (loaded from backend)
  const [customHtml, setCustomHtml] = useState<Record<string, string>>({});
  // Editor buffer
  const [editorValue, setEditorValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <MainLayout title="E-Mail & PDF Vorschau" subtitle="Vorschau aller E-Mail- und PDF-Vorlagen">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground mb-1">Vorlagen-Übersicht</h2>
            <p className="text-sm text-muted-foreground">Klicke auf eine Vorlage, um die Vorschau zu öffnen oder den Inhalt zu bearbeiten. Änderungen werden dauerhaft gespeichert.</p>
          </div>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Template cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{tpl.label}</span>
                  {(hasCustom(tpl, "email") || (tpl.id === "invoice" && hasCustom(tpl, "pdf"))) && (
                    <span className="ml-auto text-[10px] font-medium bg-warning/20 text-warning-foreground px-1.5 py-0.5 rounded border border-warning/30">Bearbeitet</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{tpl.description}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">Betreff: {tpl.subject}</p>
              </div>

              {/* E-Mail row */}
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
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openEdit(tpl, "email")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Bearbeiten
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
              </div>

              {/* PDF row – only for invoice */}
              {tpl.id === "invoice" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => setActiveModal({ template: tpl, mode: "pdf" })}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => openEdit(tpl, "pdf")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Bearbeiten
                  </Button>
                  {hasCustom(tpl, "pdf") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-muted-foreground"
                      title="Zurücksetzen"
                      onClick={() => resetTemplate(tpl, "pdf")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
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
            <div className="w-1/2 flex flex-col border-r border-border">
              <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border font-mono">
                HTML-Editor
              </div>
              <Textarea
                value={editorValue}
                onChange={(e) => setEditorValue(e.target.value)}
                className="flex-1 resize-none rounded-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{ height: "100%" }}
                spellCheck={false}
              />
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
    </MainLayout>
  );
}
