import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

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
  const addDays = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  const movable = [addDays(easter, -2), addDays(easter, 1), addDays(easter, 39), addDays(easter, 50), addDays(easter, 60)];
  return new Set([...fixed, ...movable.map(fmt)]);
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  const holidays = getGermanHolidays(from.getFullYear());
  const holidaysNext = getGermanHolidays(from.getFullYear() + 1);
  const allHolidays = new Set([...holidays, ...holidaysNext]);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    const dateStr = result.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !allHolidays.has(dateStr)) added++;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate cron secret for security (skip if CRON_SECRET not configured)
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization") || "";
  const isAuthorizedUser = authHeader.startsWith("Bearer ") && authHeader.length > 20;
  if (expectedSecret && cronSecret !== expectedSecret && !isAuthorizedUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const periodMonthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    console.log(`[auto-invoice] Running for ${today.toISOString()} – billing period: ${periodMonthStr}`);

    // Load all active contracts
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
        // Check if an invoice for this period already exists
        const periodStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const periodEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .gte("invoice_date", periodStart)
          .lte("invoice_date", periodEnd)
          .maybeSingle();

        if (existing) {
          console.log(`[auto-invoice] Invoice already exists for contract ${contract.id} in ${periodMonthStr}, skipping.`);
          skipped++;
          continue;
        }

        if (!contract.rechnungs_email && !contract.email) {
          console.log(`[auto-invoice] No email for contract ${contract.id}, skipping.`);
          skipped++;
          continue;
        }

        // ── Grundgebühr-Waiver-Logik ─────────────────────────────────────────
        // Verträge abgeschlossen vor 30.06.2026 zahlen keine Grundgebühr bis 01.01.2027
        const contractSignedAt = new Date(contract.created_at || contract.start_date);
        const waiverCutoffDate = new Date("2026-06-30");
        const waiverEndDate = new Date("2027-01-01");
        const isInWaiverPeriod = contractSignedAt <= waiverCutoffDate && today < waiverEndDate;

        let baseNetAmount = Number(contract.monthly_price) || 0;
        if (isInWaiverPeriod && baseNetAmount > 0) {
          console.log(`[auto-invoice] Grundgebühr-Waiver aktiv für Vertrag ${contract.id} (abgeschlossen: ${contractSignedAt.toISOString().split("T")[0]}): ${baseNetAmount} € → 0 €`);
          baseNetAmount = 0;
        }

        // Build invoice positions
        const taxRate = 19;
        const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
        const billingPeriod = `${monthNames[today.getMonth()]} ${currentYear}`;

        const positions: { description: string; quantity: number; unit_price: number }[] = [];

        if (baseNetAmount > 0) {
          positions.push({
            description: `${contract.product_name} – ${billingPeriod}`,
            quantity: contract.license_count || 1,
            unit_price: baseNetAmount / (contract.license_count || 1),
          });
        } else if (isInWaiverPeriod) {
          positions.push({
            description: `${contract.product_name} – ${billingPeriod} (Einführungsangebot: Grundgebühr entfällt bis 31.12.2026)`,
            quantity: contract.license_count || 1,
            unit_price: 0,
          });
        } else {
          positions.push({
            description: `${contract.product_name} – ${billingPeriod}`,
            quantity: contract.license_count || 1,
            unit_price: 0,
          });
        }

        // Collect pending usage charges for this HFX-Nr
        let usageChargeIds: string[] = [];
        if (contract.hfx_customer_number) {
          const { data: usageCharges } = await supabase
            .from("usage_charges")
            .select("*")
            .eq("hfx_customer_number", contract.hfx_customer_number)
            .eq("status", "pending");

          if (usageCharges && usageCharges.length > 0) {
            usageChargeIds = usageCharges.map((u: any) => u.id);
            for (const uc of usageCharges) {
              positions.push({
                description: `${uc.unit_description} (${new Date(uc.period_from).toLocaleDateString("de-DE")} – ${new Date(uc.period_to).toLocaleDateString("de-DE")})`,
                quantity: uc.quantity,
                unit_price: Number(uc.unit_price),
              });
            }
          }
        }

        // Verbrauchsnettobetrag separat ermitteln (für Stripe-Beschreibung und Provisionen)
        const usageNetAmount = positions
          .slice(1)
          .reduce((s, p) => s + p.quantity * p.unit_price, 0);

        // Recalculate totals
        const netAmount = positions.reduce((s, p) => s + p.quantity * p.unit_price, 0);
        const taxAmount = Math.round(netAmount * taxRate) / 100;
        const grossAmount = Math.round((netAmount + taxAmount) * 100) / 100;

        const collectionDate = addBusinessDays(today, 3);
        const dueDateStr = collectionDate.toISOString().split("T")[0];
        const collectionDateFormatted = collectionDate.toLocaleDateString("de-DE");
        const todayStr = today.toISOString().split("T")[0];

        // ── Stripe SEPA payment ──────────────────────────────────────────────
        let stripeInvoiceId: string | null = null;
        const hasStripeCustomer = !!contract.stripe_customer_id;

        // Kein SEPA-Mandat vorhanden → Checkout-Setup-Link senden und Rechnung überspringen
        if (!hasStripeCustomer) {
          console.warn(`[auto-invoice] Contract ${contract.id} (${contract.customer_name}) hat kein Stripe-Mandat – sende Mandatsanforderungs-E-Mail`);
          try {
            const emailRecipient = contract.rechnungs_email || contract.email;
            if (emailRecipient) {
              // Stripe-Kunden anlegen
              const stripeCustomer = await stripe.customers.create({
                name: contract.customer_name,
                email: emailRecipient,
                metadata: { hfx_contract_id: contract.id, hfx_customer_number: contract.hfx_customer_number || "" },
              });

              // stripe_customer_id sofort am Vertrag speichern
              await supabase
                .from("contracts")
                .update({ stripe_customer_id: stripeCustomer.id } as any)
                .eq("id", contract.id);

              // Checkout-Session im Setup-Modus für SEPA-Lastschrift
              const setupSession = await stripe.checkout.sessions.create({
                mode: "setup",
                customer: stripeCustomer.id,
                payment_method_types: ["sepa_debit"],
                success_url: "https://praxisflow-buddy.lovable.app/mandate-success?session_id={CHECKOUT_SESSION_ID}",
                cancel_url: "https://praxisflow-buddy.lovable.app/",
                metadata: {
                  source: "sepa_mandate_setup",
                  contract_id: contract.id,
                  hfx_customer_number: contract.hfx_customer_number || "",
                },
              });

              // Mandatsanforderungs-E-Mail versenden
              const mandateEmailHtml = buildMandateRequestEmail({
                customerName: contract.customer_name,
                productName: contract.product_name,
                setupUrl: setupSession.url!,
                billingPeriod,
              });
              await resend.emails.send({
                from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
                reply_to: "info@hfx-honorarfuchs.de",
                to: [emailRecipient],
                subject: `Zahlungsmethode hinterlegen – ${contract.customer_name}`,
                html: mandateEmailHtml,
              });
              console.log(`[auto-invoice] Mandatsanforderung gesendet an ${emailRecipient} (Contract: ${contract.id})`);
            }
          } catch (mandateErr: any) {
            console.error(`[auto-invoice] Mandate request error for contract ${contract.id}:`, mandateErr?.message);
            errors.push(`Mandate [${contract.id}]: ${mandateErr?.message}`);
          }
          skipped++;
          continue; // Keine Rechnung erstellen bis Mandat vorliegt
        }

        if (hasStripeCustomer && grossAmount > 0) {
          try {
            for (const pos of positions) {
              if (pos.quantity * pos.unit_price <= 0) continue;
              await stripe.invoiceItems.create({
                customer: contract.stripe_customer_id,
                amount: Math.round(pos.quantity * pos.unit_price * 100),
                currency: "eur",
                description: pos.description,
                tax_rates: [],
              });
            }

            await stripe.invoiceItems.create({
              customer: contract.stripe_customer_id,
              amount: Math.round(taxAmount * 100),
              currency: "eur",
              description: `MwSt. 19% auf ${netAmount.toFixed(2)} €`,
            });

            const stripeInvoice = await stripe.invoices.create({
              customer: contract.stripe_customer_id,
              auto_advance: false,
              collection_method: "charge_automatically",
              description: `${contract.product_name} – ${billingPeriod}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}${usageChargeIds.length > 0 ? ` | Verbrauch: ${usageChargeIds.length} Qodia-Vorgänge (${usageNetAmount.toFixed(2)} €)` : ""}`,
              metadata: {
                hfx_contract_id: contract.id,
                hfx_customer_number: contract.hfx_customer_number || "",
                billing_period: periodMonthStr,
              },
            });

            const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
            await stripe.invoices.pay(finalizedInvoice.id);

            stripeInvoiceId = stripeInvoice.id;
            console.log(`[auto-invoice] Stripe invoice ${stripeInvoice.id} created and payment initiated for contract ${contract.id}`);
          } catch (stripeErr: any) {
            console.error(`[auto-invoice] Stripe error for contract ${contract.id}:`, stripeErr?.message);
            errors.push(`Stripe [${contract.id}]: ${stripeErr?.message}`);
          }
        } else if (grossAmount === 0) {
          console.log(`[auto-invoice] Contract ${contract.id} – Gesamtbetrag 0 €, kein Stripe-Einzug nötig`);
        }

        // ── Insert invoice in DB ──────────────────────────────────────────────
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
            stripe_invoice_id: stripeInvoiceId,
            notes: `Automatisch generiert – Laufzeit: ${billingPeriod}${isInWaiverPeriod ? " | Grundgebühr-Waiver aktiv (0 €)" : ""}${usageChargeIds.length > 0 ? ` | ${usageChargeIds.length} Qodia-Verbrauchsposten: ${usageNetAmount.toFixed(2)} € netto` : ""}`,
          })
          .select()
          .single();

        if (insertError || !invoice) {
          errors.push(`Contract ${contract.id}: ${insertError?.message}`);
          continue;
        }

        // Mark usage charges as invoiced
        if (usageChargeIds.length > 0) {
          await supabase
            .from("usage_charges")
            .update({ status: "invoiced", invoice_id: invoice.id })
            .in("id", usageChargeIds);
          console.log(`[auto-invoice] Attached ${usageChargeIds.length} usage charges to invoice ${invoice.invoice_number}`);
        }

        // ── Send invoice email ────────────────────────────────────────────────
        const positionsHtml = positions
          .filter(p => p.unit_price > 0 || (isInWaiverPeriod && p === positions[0])) // Grundgebühr immer zeigen (auch bei 0 €/Waiver), sonstige 0€-Pos ausblenden
          .map((p) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${p.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(p.unit_price).toFixed(2)} €</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(p.quantity * p.unit_price).toFixed(2)} €</td>
          </tr>`).join("");

        // ── Zahlungshinweis: je nach Zahlungsmethode unterschiedlicher Block ──
        const paymentBlockHtml = hasStripeCustomer && grossAmount > 0
          ? `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>🔄 Automatischer Einzug (SEPA via Stripe)</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Der Betrag wird automatisch von Ihrem hinterlegten SEPA-Konto eingezogen.</p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📅 <strong>Einzugsdatum:</strong> ${collectionDateFormatted}</p>
              ${usageNetAmount > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📊 <strong>Enthält Qodia-Verbrauch:</strong> ${usageChargeIds.length} Vorgänge × ${(usageNetAmount / usageChargeIds.reduce((s, _, i) => s + (positions[i + 1]?.quantity || 0), 0) || 0.99).toFixed(2)} € = ${usageNetAmount.toFixed(2)} € (zzgl. MwSt.)</p>` : ""}
            </div>`
          : grossAmount === 0
          ? `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>✅ Diese Rechnung weist keinen Zahlbetrag aus.</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Es sind keine Zahlungen erforderlich. Diese Abrechnung dient als Nachweis für den aktuellen Abrechnungszeitraum.</p>
            </div>`
          : `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#8a6d00;"><strong>💳 Zahlung per Überweisung</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#8a6d00;">Bitte überweisen Sie den Gesamtbetrag bis zum <strong>${collectionDateFormatted}</strong> auf folgendes Konto:</p>
              <p style="margin:8px 0 0;font-size:13px;color:#5d4700;"><strong>Empfänger:</strong> Honorarfuchs GmbH</p>
              <p style="margin:4px 0 0;font-size:13px;color:#5d4700;"><strong>Verwendungszweck:</strong> ${invoice.invoice_number} – ${contract.hfx_customer_number || contract.customer_name}</p>
              <p style="margin:8px 0 0;font-size:11px;color:#8a6d00;">Bankverbindung auf Anfrage unter <a href="mailto:buchhaltung@hfx-honorarfuchs.de" style="color:#8a6d00;">buchhaltung@hfx-honorarfuchs.de</a></p>
            </div>`;

        const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);color:#fff;padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg"
      alt="Honorarfuchs" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;"/>
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
    ${paymentBlockHtml}
    <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Diese Rechnung wurde automatisch generiert.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">© Honorarfuchs – HFX Sales Portal</p>
  </div>
</div>
</body></html>`;

        const emailTo = contract.rechnungs_email || contract.email;
        const subjectSuffix = grossAmount === 0 ? " (kein Zahlbetrag)" : "";
        const sendResult = await resend.emails.send({
          from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
          reply_to: "info@hfx-honorarfuchs.de",
          to: [emailTo],
          subject: `Rechnung ${invoice.invoice_number} – ${contract.customer_name}${subjectSuffix}`,
          html: emailHtml,
          text: grossAmount > 0
            ? `Rechnung ${invoice.invoice_number} für ${contract.customer_name}.\nGesamtbetrag: ${grossAmount.toFixed(2)} €\n${hasStripeCustomer ? `Einzugsdatum: ${collectionDateFormatted}` : `Bitte überweisen Sie bis zum ${collectionDateFormatted}.`}\nDiese Rechnung wurde automatisch generiert.`
            : `Rechnung ${invoice.invoice_number} für ${contract.customer_name}.\nDiese Rechnung weist keinen Zahlbetrag aus (Einführungsangebot aktiv).\nDiese Rechnung wurde automatisch generiert.`,
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
            user_id: "00000000-0000-0000-0000-000000000000",
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
            payment_status: grossAmount === 0 ? "paid" : "pending",
            notes: `Auto-Rechnung ${billingPeriod}${isInWaiverPeriod ? " | Grundgebühr-Waiver" : ""}${usageChargeIds.length > 0 ? ` + ${usageChargeIds.length} Nutzungsposten` : ""}${stripeInvoiceId ? ` | Stripe: ${stripeInvoiceId}` : ""}`,
          })
          .select("id")
          .single();

        // Update invoice status to 'versendet'
        await supabase
          .from("invoices")
          .update({ status: "versendet", email_sent_at: now, revenue_id: revenueRow?.id ?? null })
          .eq("id", invoice.id);

        // Auto-generate commission payout
        if (contract.sales_partner_id) {
          const isGoae = /GOÄ|GOA/i.test(contract.product_name || "");

          if (isGoae) {
            // ── HFX GOÄ: Rollenbasierte Provisionslogik ──────────────────────
            await createGoaeCommissions({
              supabase,
              contract,
              invoice,
              netAmount,
              baseNetAmount,
              usageChargeIds,
              periodMonthStr,
              today,
            });
          } else {
            // ── Andere Produkte: klassische product_commissions-Logik ─────────
            const { data: productCommission } = await supabase
              .from("product_commissions")
              .select("*")
              .eq("product_name", contract.product_name)
              .eq("is_active", true)
              .maybeSingle();

            if (productCommission) {
              let commissionAmount = 0;
              if (productCommission.commission_type === "prozent") {
                commissionAmount = Math.round(baseNetAmount * productCommission.commission_value) / 100;
              } else {
                commissionAmount = Number(productCommission.commission_value);
              }

              if (commissionAmount > 0) {
                const { data: existingPayout } = await supabase
                  .from("commission_payouts")
                  .select("id")
                  .eq("invoice_id", invoice.id)
                  .maybeSingle();

                if (!existingPayout) {
                  await supabase.from("commission_payouts").insert({
                    sales_partner_id: contract.sales_partner_id,
                    sales_partner_name: contract.sales_partner_name || "Unbekannt",
                    contract_id: contract.id,
                    invoice_id: invoice.id,
                    product_name: contract.product_name,
                    commission_type: productCommission.commission_type,
                    commission_rate: productCommission.commission_value,
                    commission_amount: commissionAmount,
                    period_month: periodMonthStr,
                    status: "pending",
                  });
                  console.log(`[auto-invoice] Created commission payout ${commissionAmount} € for partner ${contract.sales_partner_name}`);
                }
              }
            }
          }
        }

        console.log(`[auto-invoice] ✓ Invoice ${invoice.invoice_number} sent to ${emailTo}${stripeInvoiceId ? ` | Stripe: ${stripeInvoiceId}` : ""}`);
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

// ────────────────────────────────────────────────────────────────────────────
// HFX GOÄ: Rollenbasierte Provisionslogik
// ────────────────────────────────────────────────────────────────────────────

async function createGoaeCommissions(params: {
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  contract: any;
  invoice: any;
  netAmount: number;
  baseNetAmount: number;
  usageChargeIds: string[];
  periodMonthStr: string;
  today: Date;
}) {
  const { supabase, contract, invoice, netAmount, baseNetAmount, usageChargeIds, periodMonthStr, today } = params;

  // Net amount from usage charges (excluding base fee)
  let usageNetAmount = 0;
  if (usageChargeIds.length > 0) {
    const { data: charges } = await supabase
      .from("usage_charges")
      .select("net_amount")
      .in("id", usageChargeIds);
    if (charges) {
      usageNetAmount = charges.reduce((s: number, c: any) => s + Number(c.net_amount), 0);
    }
  }

  // Check if this is the first invoice for this contract
  const { count: invoiceCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contract.id);
  const isFirstInvoice = (invoiceCount || 0) <= 1;

  // Fetch the role of the sales_partner_id
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", contract.sales_partner_id)
    .maybeSingle();
  const partnerRole = roleRow?.role || null;

  const adRoles = ["user", "regional_lead", "sales_lead"];
  const isAdRole = adRoles.includes(partnerRole);
  const isSalesPartner = partnerRole === "sales_partner";

  // ── AD-Provision ─────────────────────────────────────────────────────────
  if (isAdRole) {
    // 1. Festbetrag bei Vertragsabschluss (erste Rechnung)
    if (isFirstInvoice) {
      let fixedAmount = 100; // Basis-Festbetrag

      // Sprint-Check: AD hat >= 25 GOÄ-Verträge bis 31.12.2026?
      const sprintEnd = new Date("2026-12-31");
      if (today <= sprintEnd) {
        const { count: contractCount } = await supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("sales_partner_id", contract.sales_partner_id)
          .or("product_name.ilike.%GOÄ%,product_name.ilike.%GOA%")
          .in("status", ["aktiv", "gekündigt", "beendet"]);
        if ((contractCount || 0) >= 25) {
          fixedAmount = 250; // Sprint-Bonus: 100 + 150
        }
      }

      const { data: existingFixed } = await supabase
        .from("commission_payouts")
        .select("id")
        .eq("contract_id", contract.id)
        .eq("payout_trigger", "contract_signup")
        .maybeSingle();

      if (!existingFixed) {
        await supabase.from("commission_payouts").insert({
          sales_partner_id: contract.sales_partner_id,
          sales_partner_name: contract.sales_partner_name || "Unbekannt",
          contract_id: contract.id,
          invoice_id: invoice.id,
          product_name: contract.product_name,
          commission_type: "festbetrag",
          commission_rate: fixedAmount,
          commission_amount: fixedAmount,
          period_month: periodMonthStr,
          status: "pending",
          commission_role: "ad",
          payout_trigger: "contract_signup",
          contract_start_date: contract.start_date,
        });
        console.log(`[auto-invoice] GOÄ AD fixed payout ${fixedAmount} € for ${contract.sales_partner_name}`);
      }
    }

    // 2. 10% auf Verbrauchserlöse, max. 24 Monate nach Vertragsbeginn
    if (usageNetAmount > 0) {
      const contractStart = new Date(contract.start_date);
      const monthsElapsed = (today.getFullYear() - contractStart.getFullYear()) * 12 + (today.getMonth() - contractStart.getMonth());
      if (monthsElapsed <= 24) {
        const usageCommission = Math.round(usageNetAmount * 10) / 100;
        if (usageCommission > 0) {
          await supabase.from("commission_payouts").insert({
            sales_partner_id: contract.sales_partner_id,
            sales_partner_name: contract.sales_partner_name || "Unbekannt",
            contract_id: contract.id,
            invoice_id: invoice.id,
            product_name: contract.product_name,
            commission_type: "prozent",
            commission_rate: 10,
            commission_amount: usageCommission,
            period_month: periodMonthStr,
            status: "pending",
            commission_role: "ad",
            payout_trigger: "usage_revenue",
            contract_start_date: contract.start_date,
          });
          console.log(`[auto-invoice] GOÄ AD usage payout ${usageCommission} € for ${contract.sales_partner_name}`);
        }
      } else {
        console.log(`[auto-invoice] GOÄ AD usage provision expired (${monthsElapsed} months) for contract ${contract.id}`);
      }
    }
  }

  // ── Vertriebspartner-Provision ────────────────────────────────────────────
  if (isSalesPartner && contract.status === "aktiv") {
    const totalCommission = Math.round(netAmount * 10) / 100;
    if (totalCommission > 0) {
      const { data: existingPayout } = await supabase
        .from("commission_payouts")
        .select("id")
        .eq("invoice_id", invoice.id)
        .eq("commission_role", "sales_partner")
        .maybeSingle();

      if (!existingPayout) {
        await supabase.from("commission_payouts").insert({
          sales_partner_id: contract.sales_partner_id,
          sales_partner_name: contract.sales_partner_name || "Unbekannt",
          contract_id: contract.id,
          invoice_id: invoice.id,
          product_name: contract.product_name,
          commission_type: "prozent",
          commission_rate: 10,
          commission_amount: totalCommission,
          period_month: periodMonthStr,
          status: "pending",
          commission_role: "sales_partner",
          payout_trigger: "usage_revenue",
          contract_start_date: contract.start_date,
        });
        console.log(`[auto-invoice] GOÄ sales_partner payout ${totalCommission} € for ${contract.sales_partner_name}`);
      }
    }
  }

  // ── Tippgeber-Meilenstein (500 € Kumulierschwelle) ────────────────────────
  if (contract.tippgeber_id) {
    // Kumulierten Nettobetrag aller Rechnungen für diesen Vertrag berechnen
    const { data: allInvoices } = await supabase
      .from("invoices")
      .select("net_amount")
      .eq("contract_id", contract.id)
      .in("status", ["versendet", "bezahlt"]);

    const cumulativeRevenue = (allInvoices || []).reduce((s: number, inv: any) => s + Number(inv.net_amount), 0);

    // Prüfen ob Meilenstein bereits vorhanden
    const { data: existingMilestone } = await supabase
      .from("tippgeber_milestone_tracking")
      .select("id, milestone_reached")
      .eq("tippgeber_id", contract.tippgeber_id)
      .eq("contract_id", contract.id)
      .maybeSingle();

    if (existingMilestone) {
      // Update kumulierten Betrag
      if (!existingMilestone.milestone_reached && cumulativeRevenue >= 500) {
        await supabase
          .from("tippgeber_milestone_tracking")
          .update({
            cumulative_revenue: cumulativeRevenue,
            milestone_reached: true,
            milestone_reached_at: new Date().toISOString(),
          })
          .eq("id", existingMilestone.id);
        console.log(`[auto-invoice] GOÄ Tippgeber milestone reached for contract ${contract.id} (${cumulativeRevenue} €)`);
      } else {
        await supabase
          .from("tippgeber_milestone_tracking")
          .update({ cumulative_revenue: cumulativeRevenue })
          .eq("id", existingMilestone.id);
      }
    } else {
      // Neuen Meilenstein-Eintrag anlegen
      await supabase.from("tippgeber_milestone_tracking").insert({
        tippgeber_id: contract.tippgeber_id,
        contract_id: contract.id,
        cumulative_revenue: cumulativeRevenue,
        milestone_reached: cumulativeRevenue >= 500,
        milestone_reached_at: cumulativeRevenue >= 500 ? new Date().toISOString() : null,
      });
      if (cumulativeRevenue >= 500) {
        console.log(`[auto-invoice] GOÄ Tippgeber milestone newly reached for contract ${contract.id}`);
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EMAIL: SEPA-Mandatsanforderung
// ────────────────────────────────────────────────────────────────────────────
function buildMandateRequestEmail(params: {
  customerName: string;
  productName: string;
  setupUrl: string;
  billingPeriod: string;
}) {
  const { customerName, productName, setupUrl, billingPeriod } = params;
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 40px;text-align:center;">
        <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg"
          alt="Honorarfuchs" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;"/>
        <p style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">Zahlungsmethode hinterlegen</p>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;">HFX Honorarfuchs – Abrechnung ${billingPeriod}</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <p style="font-size:15px;color:#1a1a2e;margin:0 0 16px;">Sehr geehrte Damen und Herren,</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          für Ihren Vertrag <strong>${productName}</strong> bei Honorarfuchs ist noch keine SEPA-Zahlungsmethode hinterlegt.
          Um Ihre monatliche Abrechnung für <strong>${billingPeriod}</strong> und alle folgenden Monate automatisch per SEPA-Lastschrift abwickeln zu können,
          bitten wir Sie, Ihre Bankverbindung einmalig zu hinterlegen.
        </p>
        <div style="background:#f0f4ff;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:#4b5563;">Sicher, schnell und einmalig – powered by Stripe</p>
          <a href="${setupUrl}"
            style="display:inline-block;background:#0b367f;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:6px;text-decoration:none;margin-top:8px;">
            💳 SEPA-Lastschrift einrichten
          </a>
        </div>
        <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 8px;">
          Nach erfolgreicher Einrichtung wird Ihr monatlicher Beitrag automatisch eingezogen. Sie erhalten keine weiteren Aufforderungen.
        </p>
        <p style="font-size:13px;color:#9ca3af;margin:0;">
          Bei Fragen wenden Sie sich bitte an <a href="mailto:buchhaltung@hfx-honorarfuchs.de" style="color:#0b367f;">buchhaltung@hfx-honorarfuchs.de</a>.
        </p>
        <p style="font-size:14px;color:#374151;margin-top:24px;">Mit freundlichen Grüßen,<br><strong>Ihr HFX Honorarfuchs Team</strong></p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">© HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
