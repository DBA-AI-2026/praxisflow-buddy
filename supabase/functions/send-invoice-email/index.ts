import { Resend } from "npm:resend@2.0.0";
import { requireActiveRole } from "../_shared/auth.ts";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

/** Returns a Set of German public holiday date strings (YYYY-MM-DD) for a given year */
function getGermanHolidays(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fixed = [
    `${year}-01-01`, `${year}-05-01`, `${year}-10-03`,
    `${year}-12-25`, `${year}-12-26`,
  ];
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const add = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  const movable = [add(easter,-2), add(easter,1), add(easter,39), add(easter,50), add(easter,60)];
  return new Set([...fixed, ...movable.map(fmt)]);
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  const h1 = getGermanHolidays(from.getFullYear());
  const h2 = getGermanHolidays(from.getFullYear() + 1);
  const allHolidays = new Set([...h1, ...h2]);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    const ds = result.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !allHolidays.has(ds)) added++;
  }
  return result;
}



function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const guard = await requireActiveRole(req, ["admin"], corsHeaders);
    if (guard instanceof Response) return guard;
    const { userId, admin: supabaseAdmin } = guard;


    const { invoiceId, pdfBase64 } = await req.json();

    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch invoice data
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!invoice.rechnungs_email) {
      return new Response(JSON.stringify({ error: "No billing email on invoice" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const positions = Array.isArray(invoice.positions) ? invoice.positions : [];
    const positionsHtml = positions.map((p: any) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${p.description || ""}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${p.quantity || 1}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${Number(p.unit_price || 0).toFixed(2)} €</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${Number((p.quantity || 1) * (p.unit_price || 0)).toFixed(2)} €</td>
      </tr>`).join("");

    // Collection date = invoice_date + 3 business days (skip weekends & German holidays)
    const invoiceDateObj = new Date(invoice.invoice_date);
    const collectionDate = addBusinessDays(invoiceDateObj, 3);
    const collectionDateFormatted = collectionDate.toLocaleDateString("de-DE");

    // Fetch contract for payment method info
    let isSepa = false;
    if (invoice.contract_id) {
      const { data: contractData } = await supabaseAdmin
        .from("contracts")
        .select("iban, payment_interval")
        .eq("id", invoice.contract_id)
        .maybeSingle();
      isSepa = !!(contractData?.iban && contractData.iban.trim());
    }
    const paymentMethodNote = isSepa
      ? "Der Betrag wird automatisch per SEPA-Lastschrift von Ihrem Konto eingezogen."
      : "Der Betrag wird automatisch über Stripe von Ihrem hinterlegten Zahlungsmittel eingezogen.";

    const bodyHtml = `<p style="font-size:16px;">Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie Ihre Rechnung <strong>${invoice.invoice_number}</strong> vom <strong>${new Date(invoice.invoice_date).toLocaleDateString("de-DE")}</strong>.</p>
<p><strong>Rechnungsempfänger:</strong> ${invoice.customer_name}${invoice.customer_number ? ` (${invoice.customer_number})` : ""}</p>
${invoice.adresse ? `<p><strong>Adresse:</strong> ${invoice.adresse}${invoice.plz ? `, ${invoice.plz}` : ""}${invoice.ort ? ` ${invoice.ort}` : ""}</p>` : ""}

<table style="width:100%;border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
  <thead><tr>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:left;">Beschreibung</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Menge</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Einzelpreis</th>
    <th style="background:#0b367f;color:#ffffff;padding:10px 12px;text-align:right;">Gesamt</th>
  </tr></thead>
  <tbody>${positionsHtml}</tbody>
</table>

<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
  <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Nettobetrag:</span><strong>${Number(invoice.net_amount).toFixed(2)} €</strong></div>
  <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>MwSt. (${invoice.tax_rate}%):</span><span>${Number(invoice.tax_amount).toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:18px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${Number(invoice.gross_amount).toFixed(2)} €</strong></div>
</div>

<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
  <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>Automatischer Einzug</strong></p>
  <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">${paymentMethodNote}</p>
  <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;"><strong>Einzugsdatum:</strong> ${collectionDateFormatted}</p>
</div>
${invoice.notes ? `<p style="color:#6b7280;font-size:14px;margin-top:12px;">${invoice.notes}</p>` : ""}`;

    const bodyText = [
      "Sehr geehrte Damen und Herren,",
      "",
      `anbei erhalten Sie Ihre Rechnung ${invoice.invoice_number} vom ${new Date(invoice.invoice_date).toLocaleDateString("de-DE")}.`,
      "",
      `Rechnungsempfänger: ${invoice.customer_name}${invoice.customer_number ? ` (${invoice.customer_number})` : ""}`,
      invoice.adresse ? `Adresse: ${invoice.adresse}${invoice.plz ? `, ${invoice.plz}` : ""}${invoice.ort ? ` ${invoice.ort}` : ""}` : null,
      "",
      `Nettobetrag: ${Number(invoice.net_amount).toFixed(2)} €`,
      `MwSt. (${invoice.tax_rate}%): ${Number(invoice.tax_amount).toFixed(2)} €`,
      `Gesamtbetrag: ${Number(invoice.gross_amount).toFixed(2)} €`,
      "",
      `${paymentMethodNote}`,
      `Einzugsdatum: ${collectionDateFormatted}`,
      "",
      invoice.notes ? invoice.notes : null,
    ].filter(Boolean).join("\n");

    const { html: invoiceHtml } = renderBrandedEmail({
      subheadline: "Ihre Rechnung",
      bodyHtml,
      bodyText,
    });

    const attachment = pdfBase64
      ? [{ filename: `Rechnung-${invoice.invoice_number}.pdf`, content: pdfBase64 }]
      : [];

    const result = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [invoice.rechnungs_email],
      subject: `Rechnung ${invoice.invoice_number} – ${invoice.customer_name}`,
      html: invoiceHtml,
      attachments: attachment,
      text: bodyText,
    });

    // Phase 2: customer_revenues INSERT entfernt – invoices ist die führende Quelle.
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("invoices")
      .update({
        status: "versendet",
        email_sent_at: now,
        email_sent_by: userId,
      })
      .eq("id", invoiceId);

    return new Response(JSON.stringify({ success: true, emailId: result.data?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
