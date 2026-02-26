import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const today = new Date();
    const todayDay = today.getDate(); // day of month (1-31)
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    console.log(`[auto-invoice] Running for ${today.toISOString()}, billing day: ${todayDay}`);

    // Fetch all active contracts with a start_date where day matches today
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "aktiv");

    if (contractsError) throw contractsError;

    if (!contracts || contracts.length === 0) {
      console.log("[auto-invoice] No active contracts found.");
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contract of contracts) {
      try {
        if (!contract.start_date) {
          skipped++;
          continue;
        }

        const startDate = new Date(contract.start_date);
        const billingDay = startDate.getDate();

        // Only process if today matches the billing day
        // Handle months with fewer days: if billing day > days in month, use last day
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const effectiveBillingDay = Math.min(billingDay, daysInMonth);

        if (todayDay !== effectiveBillingDay) {
          skipped++;
          continue;
        }

        // Check if invoice already exists for this contract in the current billing period
        const periodStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const periodEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .gte("invoice_date", periodStart)
          .lte("invoice_date", periodEnd)
          .maybeSingle();

        if (existing) {
          console.log(`[auto-invoice] Invoice already exists for contract ${contract.id} in ${currentMonth}/${currentYear}, skipping.`);
          skipped++;
          continue;
        }

        if (!contract.rechnungs_email && !contract.email) {
          console.log(`[auto-invoice] No email for contract ${contract.id}, skipping.`);
          skipped++;
          continue;
        }

        // Calculate amounts
        const netAmount = Number(contract.monthly_price) || 0;
        const taxRate = 19;
        const taxAmount = Math.round(netAmount * taxRate) / 100;
        const grossAmount = Math.round((netAmount + taxAmount) * 100) / 100;

        // Collection date = today + 3 business days (skip weekends)
        const collectionDate = new Date(today);
        let businessDaysAdded = 0;
        while (businessDaysAdded < 3) {
          collectionDate.setDate(collectionDate.getDate() + 1);
          const dow = collectionDate.getDay();
          if (dow !== 0 && dow !== 6) businessDaysAdded++; // skip Sat/Sun
        }
        const dueDateStr = collectionDate.toISOString().split("T")[0];
        const collectionDateFormatted = collectionDate.toLocaleDateString("de-DE");

        // Determine payment method
        const isSepa = !!(contract.iban && contract.iban.trim());
        const paymentMethodLabel = isSepa
          ? "SEPA-Lastschrift"
          : "Stripe (Kreditkarte/SEPA)";
        const paymentMethodNote = isSepa
          ? `Der Betrag wird automatisch per SEPA-Lastschrift von Ihrem Konto eingezogen.`
          : `Der Betrag wird automatisch über Stripe von Ihrem hinterlegten Zahlungsmittel eingezogen.`;
        const todayStr = today.toISOString().split("T")[0];

        const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
        const billingPeriod = `${monthNames[today.getMonth()]} ${currentYear}`;

        const positions = [
          {
            description: `${contract.product_name} – ${billingPeriod}`,
            quantity: contract.license_count || 1,
            unit_price: netAmount / (contract.license_count || 1),
          },
        ];

        // Insert invoice record (invoice_number auto-assigned by trigger)
        const { data: invoice, error: insertError } = await supabase
          .from("invoices")
          .insert({
            contract_id: contract.id,
            customer_name: contract.customer_name,
            customer_number: contract.hfx_customer_number,
            rechnungs_email: contract.rechnungs_email || contract.email,
            adresse: contract.adresse || contract.praxisanschrift,
            plz: contract.plz,
            ort: contract.ort,
            invoice_date: todayStr,
            due_date: dueDateStr,
            positions: positions,
            net_amount: netAmount,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            gross_amount: grossAmount,
            status: "entwurf",
            notes: `Automatisch generiert – Laufzeit: ${billingPeriod}`,
          })
          .select()
          .single();

        if (insertError || !invoice) {
          errors.push(`Contract ${contract.id}: ${insertError?.message}`);
          continue;
        }

        console.log(`[auto-invoice] Created invoice ${invoice.invoice_number} for contract ${contract.id}`);

        // Build and send email
        const positionsHtml = positions.map((p) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${p.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(p.unit_price).toFixed(2)} €</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(p.quantity * p.unit_price).toFixed(2)} €</td>
          </tr>`).join("");

        const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);color:#fff;padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg"
      alt="Honorarfuchs" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;display:block;margin:0 auto 12px;"/>
    <h1 style="margin:0;font-size:24px;">Rechnung ${invoice.invoice_number}</h1>
    <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Honorarfuchs – HFX Sales Portal</p>
  </div>
  <div style="background:#f9fafb;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
    <p style="font-size:15px;color:#333;">Sehr geehrte Damen und Herren,</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">anbei erhalten Sie Ihre Rechnung <strong>${invoice.invoice_number}</strong> vom <strong>${new Date(todayStr).toLocaleDateString("de-DE")}</strong>.</p>
    <p style="color:#555;font-size:14px;"><strong>Rechnungsempfänger:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;">
      <thead><tr>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:left;font-size:12px;">Beschreibung</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Menge</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Einzelpreis</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Gesamt</th>
      </tr></thead>
      <tbody>${positionsHtml}</tbody>
    </table>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Nettobetrag:</span><strong>${netAmount.toFixed(2)} €</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6b7280;"><span>MwSt. (19%):</span><span>${taxAmount.toFixed(2)} €</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:16px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${grossAmount.toFixed(2)} €</strong></div>
    </div>
    <div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
      <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>🔄 Automatischer Einzug (${paymentMethodLabel})</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">${paymentMethodNote}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📅 <strong>Einzugsdatum:</strong> ${collectionDateFormatted}</p>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Diese Rechnung wurde automatisch generiert.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">© Honorarfuchs – HFX Sales Portal</p>
  </div>
</div>
</body></html>`;

        const emailTo = contract.rechnungs_email || contract.email;
        const sendResult = await resend.emails.send({
          from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
          to: [emailTo],
          subject: `Rechnung ${invoice.invoice_number} – ${contract.customer_name}`,
          html: emailHtml,
        });

        if (sendResult.error) {
          errors.push(`Invoice ${invoice.id}: ${sendResult.error.message}`);
          continue;
        }

        const now = new Date().toISOString();

        // Insert into customer_revenues
        const { data: revenueRow } = await supabase
          .from("customer_revenues")
          .insert({
            user_id: "00000000-0000-0000-0000-000000000000", // system user placeholder
            invoice_number: invoice.invoice_number,
            invoice_date: todayStr,
            due_date: dueDateStr,
            customer_name: contract.customer_name,
            customer_number: contract.hfx_customer_number,
            product_name: positions[0].description,
            quantity: positions[0].quantity,
            unit_price: positions[0].unit_price,
            net_amount: netAmount,
            tax_amount: taxAmount,
            tax_rate: taxRate,
            gross_amount: grossAmount,
            payment_status: "pending",
            notes: `Auto-Rechnung ${billingPeriod}`,
          })
          .select("id")
          .single();

        // Update invoice status
        await supabase
          .from("invoices")
          .update({
            status: "versendet",
            email_sent_at: now,
            revenue_id: revenueRow?.id ?? null,
          })
          .eq("id", invoice.id);

        console.log(`[auto-invoice] ✓ Sent invoice ${invoice.invoice_number} to ${emailTo}`);
        processed++;
      } catch (contractErr) {
        console.error(`[auto-invoice] Error processing contract ${contract.id}:`, contractErr);
        errors.push(`Contract ${contract.id}: ${String(contractErr)}`);
      }
    }

    console.log(`[auto-invoice] Done. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ success: true, processed, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[auto-invoice] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
