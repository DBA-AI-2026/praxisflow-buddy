import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const dueDateStr = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("de-DE")
      : "14 Tage nach Rechnungsdatum";

    const invoiceHtml = `<!DOCTYPE html>
<html><head><style>
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #ffffff; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
  .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
  .totals { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 20px; }
  .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
  th { background: #0b367f; color: white; padding: 10px 12px; text-align: left; }
  th:last-child, td:last-child { text-align: right; }
</style></head><body>
<div class="container">
  <div class="header">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg"
      alt="Honorarfuchs Logo" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;" />
    <h1 style="margin:0;font-size:26px;">Rechnung ${invoice.invoice_number}</h1>
    <p style="margin:8px 0 0;opacity:0.9;">Honorarfuchs – HFX Sales Portal</p>
  </div>
  <div class="content">
    <p style="font-size:16px;">Sehr geehrte Damen und Herren,</p>
    <p>anbei erhalten Sie Ihre Rechnung <strong>${invoice.invoice_number}</strong> vom <strong>${new Date(invoice.invoice_date).toLocaleDateString("de-DE")}</strong>.</p>
    <p><strong>Rechnungsempfänger:</strong> ${invoice.customer_name}${invoice.customer_number ? ` (${invoice.customer_number})` : ""}</p>
    ${invoice.adresse ? `<p><strong>Adresse:</strong> ${invoice.adresse}${invoice.plz ? `, ${invoice.plz}` : ""}${invoice.ort ? ` ${invoice.ort}` : ""}</p>` : ""}

    <table style="margin-top:20px;">
      <thead><tr>
        <th>Beschreibung</th><th style="text-align:right;">Menge</th>
        <th style="text-align:right;">Einzelpreis</th><th style="text-align:right;">Gesamt</th>
      </tr></thead>
      <tbody>${positionsHtml}</tbody>
    </table>

    <div class="totals">
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Nettobetrag:</span><strong>${Number(invoice.net_amount).toFixed(2)} €</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>MwSt. (${invoice.tax_rate}%):</span><span>${Number(invoice.tax_amount).toFixed(2)} €</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:18px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${Number(invoice.gross_amount).toFixed(2)} €</strong></div>
    </div>

    <p style="margin-top:20px;"><strong>Zahlungsziel:</strong> ${dueDateStr}</p>
    ${invoice.notes ? `<p style="color:#6b7280;font-size:14px;">${invoice.notes}</p>` : ""}
  </div>
  <div class="footer">
    <p>Diese Rechnung wurde automatisch aus dem HFX Sales Portal erstellt.</p>
    <p>© Honorarfuchs – HFX Sales Portal</p>
  </div>
</div>
</body></html>`;

    const attachment = pdfBase64
      ? [{ filename: `Rechnung-${invoice.invoice_number}.pdf`, content: pdfBase64 }]
      : [];

    const result = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      to: [invoice.rechnungs_email],
      subject: `Rechnung ${invoice.invoice_number} – ${invoice.customer_name}`,
      html: invoiceHtml,
      attachments: attachment,
    });

    // Mark as sent + sync to customer_revenues
    const now = new Date().toISOString();

    // Insert into customer_revenues
    const { data: revenueRow } = await supabaseAdmin
      .from("customer_revenues")
      .insert({
        user_id: user.id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        customer_name: invoice.customer_name,
        customer_number: invoice.customer_number,
        product_name: positions.length > 0 ? positions[0].description : "Rechnung",
        quantity: 1,
        unit_price: invoice.net_amount,
        net_amount: invoice.net_amount,
        tax_amount: invoice.tax_amount,
        tax_rate: invoice.tax_rate,
        gross_amount: invoice.gross_amount,
        payment_status: "pending",
        notes: invoice.notes,
      })
      .select("id")
      .single();

    await supabaseAdmin
      .from("invoices")
      .update({
        status: "versendet",
        email_sent_at: now,
        email_sent_by: user.id,
        revenue_id: revenueRow?.id ?? null,
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
