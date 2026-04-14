import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
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

  // Validate cron secret for security
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

  // Parse optional body for single-contract manual trigger
  let targetContractId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.contract_id) {
        targetContractId = body.contract_id;
        console.log(`[auto-invoice] Manual trigger for contract: ${targetContractId}`);
      }
    } catch { /* no body = cron mode */ }
  }

  try {
    const today = new Date();

    // ── Vormonat als Abrechnungszeitraum ──────────────────────────────────
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const billingYear = prevMonthDate.getFullYear();
    const billingMonth = prevMonthDate.getMonth(); // 0-based
    const daysInBillingMonth = new Date(billingYear, billingMonth + 1, 0).getDate();

    const periodMonthStr = `${billingYear}-${String(billingMonth + 1).padStart(2, "0")}`;
    const periodStart = `${billingYear}-${String(billingMonth + 1).padStart(2, "0")}-01`;
    const periodEnd = `${billingYear}-${String(billingMonth + 1).padStart(2, "0")}-${String(daysInBillingMonth).padStart(2, "0")}`;

    const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const billingPeriod = `${monthNames[billingMonth]} ${billingYear}`;

    console.log(`[auto-invoice] Running for ${today.toISOString()} – billing period: ${periodMonthStr} (${billingPeriod})`);

    // Load contracts – either single (manual) or all active (cron)
    let contractQuery = supabase
      .from("contracts")
      .select("*")
      .eq("status", "aktiv");

    if (targetContractId) {
      contractQuery = contractQuery.eq("id", targetContractId);
    }

    const { data: contracts, error: contractsError } = await contractQuery;

    if (contractsError) throw contractsError;
    if (!contracts || contracts.length === 0) {
      const msg = targetContractId
        ? `No active contract found for ID ${targetContractId}`
        : "No active contracts found.";
      console.log(`[auto-invoice] ${msg}`);
      return new Response(JSON.stringify({ success: false, error: msg, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contract of contracts) {
      try {
        // ── Duplikat-Check: Rechnung für diesen Vormonat schon vorhanden? ──
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

        // Zweiter Guard: Prüfe auch anhand notes/period_month ob bereits abgerechnet
        const { data: existingByNotes } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .ilike("notes", `%${periodMonthStr}%`)
          .maybeSingle();

        if (existingByNotes) {
          console.log(`[auto-invoice] Invoice for period ${periodMonthStr} found in notes for contract ${contract.id}, skipping.`);
          skipped++;
          continue;
        }

        if (!contract.rechnungs_email && !contract.email) {
          console.log(`[auto-invoice] No email for contract ${contract.id}, skipping.`);
          skipped++;
          continue;
        }

        // ── Grundgebühr-Waiver-Logik ─────────────────────────────────────────
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

        const positions: { description: string; quantity: number; unit_price: number }[] = [];

        // Position 1: Grundgebühr
        if (baseNetAmount > 0) {
          positions.push({
            description: `Grundgebühr ${contract.product_name} – ${billingPeriod}`,
            quantity: contract.license_count || 1,
            unit_price: baseNetAmount / (contract.license_count || 1),
          });
        } else if (isInWaiverPeriod) {
          positions.push({
            description: `Grundgebühr ${contract.product_name} – ${billingPeriod} (Einführungsaktion – Grundgebühr ausgesetzt bis 31.12.2026)`,
            quantity: contract.license_count || 1,
            unit_price: 0,
          });
        } else {
          positions.push({
            description: `Grundgebühr ${contract.product_name} – ${billingPeriod}`,
            quantity: contract.license_count || 1,
            unit_price: 0,
          });
        }

        // Position 2: Nutzungsgebühren aus usage_charges (pending, passend zum Vormonat)
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
              // White-Label: unit_description aus usage_charges verwenden (bereits HFX-konform)
              positions.push({
                description: uc.unit_description || `Geprüfte GOÄ-Rechnungen (HFX GOÄ) – ${billingPeriod}`,
                quantity: uc.quantity,
                unit_price: Number(uc.unit_price),
              });
            }
          }
        }

        // Verbrauchsnettobetrag separat
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

        // Kein SEPA-Mandat → Checkout-Setup-Link senden
        if (!hasStripeCustomer) {
          console.warn(`[auto-invoice] Contract ${contract.id} (${contract.customer_name}) hat kein Stripe-Mandat – sende Mandatsanforderungs-E-Mail`);
          try {
            const emailRecipient = contract.rechnungs_email || contract.email;
            if (emailRecipient) {
              const stripeCustomer = await stripe.customers.create({
                name: contract.customer_name,
                email: emailRecipient,
                metadata: { hfx_contract_id: contract.id, hfx_customer_number: contract.hfx_customer_number || "" },
              });

              await supabase
                .from("contracts")
                .update({ stripe_customer_id: stripeCustomer.id } as any)
                .eq("id", contract.id);

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
          continue;
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

            // White-Label: Kein "Qodia" in Stripe-Beschreibung
            const stripeDescription = `${contract.product_name} – ${billingPeriod}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}${usageChargeIds.length > 0 ? ` | Nutzung: ${usageChargeIds.length} geprüfte GOÄ-Rechnungen (${usageNetAmount.toFixed(2)} €)` : ""}`;

            const stripeInvoice = await stripe.invoices.create({
              customer: contract.stripe_customer_id,
              auto_advance: false,
              collection_method: "charge_automatically",
              description: stripeDescription,
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
            notes: `Automatisch generiert – Abrechnungszeitraum: ${billingPeriod} (${periodMonthStr})${isInWaiverPeriod ? " | Grundgebühr-Waiver aktiv (0 €)" : ""}${usageChargeIds.length > 0 ? ` | ${usageChargeIds.length} geprüfte GOÄ-Rechnungen: ${usageNetAmount.toFixed(2)} € netto` : ""}`,
          })
          .select()
          .single();

        if (insertError || !invoice) {
          errors.push(`Contract ${contract.id}: ${insertError?.message}`);
          continue;
        }

        // Mark usage charges as invoiced (Schutz vor Doppelabrechnung)
        if (usageChargeIds.length > 0) {
          await supabase
            .from("usage_charges")
            .update({ status: "invoiced", invoice_id: invoice.id })
            .in("id", usageChargeIds);
          console.log(`[auto-invoice] Attached ${usageChargeIds.length} usage charges to invoice ${invoice.invoice_number}`);
        }

        // ── Send invoice email ────────────────────────────────────────────────
        const positionsHtml = positions
          .filter(p => p.unit_price > 0 || (isInWaiverPeriod && p === positions[0]))
          .map((p) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${p.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(p.unit_price).toFixed(2)} €</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(p.quantity * p.unit_price).toFixed(2)} €</td>
          </tr>`).join("");

        // ── Zahlungshinweis ──
        const paymentBlockHtml = hasStripeCustomer && grossAmount > 0
          ? `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>🔄 Automatischer Einzug (SEPA via Stripe)</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Der Betrag wird automatisch von Ihrem hinterlegten SEPA-Konto eingezogen.</p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📅 <strong>Einzugsdatum:</strong> ${collectionDateFormatted}</p>
              ${usageNetAmount > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📊 <strong>Enthält Nutzungsgebühren:</strong> ${usageNetAmount.toFixed(2)} € netto (${usageChargeIds.length} geprüfte GOÄ-Rechnungen, zzgl. MwSt.)</p>` : ""}
            </div>`
          : grossAmount === 0
          ? `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>✅ Diese Rechnung weist keinen Zahlbetrag aus.</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Es sind keine Zahlungen erforderlich. Diese Abrechnung dient als Nachweis für den Abrechnungszeitraum ${billingPeriod}.</p>
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
    <p style="color:#555;font-size:14px;line-height:1.6;">anbei erhalten Sie Ihre Rechnung <strong>${invoice.invoice_number}</strong> vom <strong>${new Date(todayStr).toLocaleDateString("de-DE")}</strong> für den Abrechnungszeitraum <strong>${billingPeriod}</strong>.</p>
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
          subject: `Rechnung ${invoice.invoice_number} – ${contract.customer_name} – ${billingPeriod}${subjectSuffix}`,
          html: emailHtml,
          text: grossAmount > 0
            ? `Rechnung ${invoice.invoice_number} für ${contract.customer_name}.\nAbrechnungszeitraum: ${billingPeriod}\nGesamtbetrag: ${grossAmount.toFixed(2)} €\n${hasStripeCustomer ? `Einzugsdatum: ${collectionDateFormatted}` : `Bitte überweisen Sie bis zum ${collectionDateFormatted}.`}\nDiese Rechnung wurde automatisch generiert.`
            : `Rechnung ${invoice.invoice_number} für ${contract.customer_name}.\nAbrechnungszeitraum: ${billingPeriod}\nDiese Rechnung weist keinen Zahlbetrag aus (Einführungsangebot aktiv).\nDiese Rechnung wurde automatisch generiert.`,
        });

        const nowTs = new Date().toISOString();

        // Update invoice status to 'versendet'
        await supabase
          .from("invoices")
          .update({ status: "versendet", email_sent_at: nowTs })
          .eq("id", invoice.id);

        // Auto-generate commission payout
        if (contract.sales_partner_id) {
          const isGoae = /GOÄ|GOA/i.test(contract.product_name || "");

          if (isGoae) {
            await createGoaeCommissions({
              supabase,
              contract,
              invoice,
              netAmount,
              baseNetAmount,
              usageChargeIds,
              periodMonthStr,
              periodStart,
              periodEnd,
              billingPeriod,
              today,
            });
          } else {
            // Andere Produkte: Provisionsberechnung mit Override-Hierarchie
            const [{ data: productCommission }, { data: partnerOverride }] = await Promise.all([
              supabase
                .from("product_commissions")
                .select("commission_type, commission_value, is_active")
                .eq("product_name", contract.product_name)
                .eq("is_active", true)
                .maybeSingle(),
              contract.sales_partner_id
                ? supabase
                    .from("partner_commission_overrides")
                    .select("commission_type, commission_value")
                    .eq("user_id", contract.sales_partner_id)
                    .eq("product_name", contract.product_name)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            ]);

            const effectiveRule = partnerOverride ?? productCommission;
            const overrideApplied = !!partnerOverride;

            if (effectiveRule) {
              let commissionAmount = 0;
              if (effectiveRule.commission_type === "prozent") {
                commissionAmount = Math.round(baseNetAmount * effectiveRule.commission_value) / 100;
              } else {
                commissionAmount = Number(effectiveRule.commission_value);
              }

              if (commissionAmount > 0) {
                const { data: existingPayout } = await supabase
                  .from("commission_payouts")
                  .select("id")
                  .eq("invoice_id", invoice.id)
                  .maybeSingle();

                if (!existingPayout) {
                  const ruleVersion = overrideApplied
                    ? (effectiveRule.commission_type === "prozent"
                        ? `OVERRIDE-PARTNER-${effectiveRule.commission_value}PCT-v1`
                        : `OVERRIDE-PARTNER-FIXED-${effectiveRule.commission_value}EUR-v1`)
                    : (effectiveRule.commission_type === "prozent"
                        ? `STD-PARTNER-${effectiveRule.commission_value}PCT-v1`
                        : `STD-PARTNER-FIXED-${effectiveRule.commission_value}EUR-v1`);

                  await supabase.from("commission_payouts").insert({
                    sales_partner_id: contract.sales_partner_id,
                    sales_partner_name: contract.sales_partner_name || "Unbekannt",
                    contract_id: contract.id,
                    invoice_id: invoice.id,
                    product_name: contract.product_name,
                    commission_type: effectiveRule.commission_type,
                    commission_rate: effectiveRule.commission_value,
                    commission_amount: commissionAmount,
                    commission_base_amount: baseNetAmount,
                    commission_rule_version: ruleVersion,
                    period_month: periodMonthStr,
                    status: "pending",
                  });
                  console.log(`[auto-invoice] Created commission payout ${commissionAmount} € for partner ${contract.sales_partner_name} (rule: ${ruleVersion})`);

                  // FiBu: partner_commission_approved event
                  try {
                    const { error: fibuCommErr } = await supabase.from("fibu_events").insert({
                      event_type: "partner_commission_approved",
                      source_module: "commission_payouts",
                      source_reference_id: invoice.id,
                      contract_id: contract.id,
                      customer_id: contract.customer_id ?? null,
                      product_name: contract.product_name,
                      period_start: periodStart,
                      period_end: periodEnd,
                      amount_net: commissionAmount,
                      tax_amount: 0,
                      amount_gross: commissionAmount,
                      currency: "EUR",
                      commission_type: effectiveRule.commission_type,
                      commission_base_amount: baseNetAmount,
                      commission_rate: effectiveRule.commission_value,
                      commission_amount: commissionAmount,
                      commission_rule_version: ruleVersion,
                      beneficiary_type: "sales_partner",
                      beneficiary_id: contract.sales_partner_id,
                      status: "draft",
                      export_status: "open",
                      description: `Partner-Provision ${contract.sales_partner_name} – ${contract.product_name} – ${periodMonthStr}${overrideApplied ? " (individuelle Regel)" : ""}`,
                      created_by: null,
                      metadata: {
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoice_number,
                        commission_rule_version: ruleVersion,
                        override_applied: overrideApplied,
                        period_month: periodMonthStr,
                        hfx_customer_number: contract.hfx_customer_number ?? null,
                      },
                    } as any);
                    if (fibuCommErr && (fibuCommErr as any).code !== "23505") {
                      console.error(`[auto-invoice] fibu_events partner_commission_approved failed:`, fibuCommErr.message);
                    }
                  } catch (fibuCommEx) {
                    console.error(`[auto-invoice] fibu_events partner_commission_approved exception:`, String(fibuCommEx));
                  }
                }
              }
            }
          }
        }

        // ── FiBu-Vorbereitungs-Events ──────────────────────────────────────────
        try {
          const fibuCustomerId: string | null = contract.customer_id ?? null;

          const baseShare = netAmount > 0 ? baseNetAmount / netAmount : 0;
          const baseTaxAmount = Math.round(taxAmount * baseShare * 100) / 100;
          const baseGrossAmount = Math.round((baseNetAmount + baseTaxAmount) * 100) / 100;

          // Event 1: invoice_base_fee_created
          const { error: fibuBaseErr } = await supabase.from("fibu_events").insert({
            event_type: "invoice_base_fee_created",
            source_module: "invoices",
            source_reference_id: invoice.id,
            contract_id: contract.id,
            customer_id: fibuCustomerId,
            product_name: contract.product_name,
            period_start: periodStart,
            period_end: periodEnd,
            amount_net: baseNetAmount,
            tax_amount: baseTaxAmount,
            amount_gross: baseGrossAmount,
            currency: "EUR",
            status: "approved",
            export_status: "open",
            description: `Grundgebühr ${invoice.invoice_number} – ${contract.product_name} – ${billingPeriod}${isInWaiverPeriod ? " (Waiver 0 €)" : ""}`,
            created_by: null,
            metadata: {
              invoice_number: invoice.invoice_number,
              invoice_id: invoice.id,
              stripe_invoice_id: stripeInvoiceId,
              contract_id: contract.id,
              hfx_customer_number: contract.hfx_customer_number ?? null,
              waiver_active: isInWaiverPeriod,
              billing_period: billingPeriod,
              period_month: periodMonthStr,
            },
          } as any);
          if (fibuBaseErr && (fibuBaseErr as any).code !== "23505") {
            console.error(`[auto-invoice] fibu_events invoice_base_fee_created failed for ${invoice.invoice_number}:`, fibuBaseErr.message);
          }

          // Event 2: invoice_usage_created (nur wenn Nutzungsgebühren > 0)
          if (usageNetAmount > 0) {
            const usageShare = netAmount > 0 ? usageNetAmount / netAmount : 0;
            const usageTaxAmount = Math.round(taxAmount * usageShare * 100) / 100;
            const usageGrossAmount = Math.round((usageNetAmount + usageTaxAmount) * 100) / 100;

            const { error: fibuUsageErr } = await supabase.from("fibu_events").insert({
              event_type: "invoice_usage_created",
              source_module: "invoices",
              source_reference_id: `${invoice.id}:usage`,
              contract_id: contract.id,
              customer_id: fibuCustomerId,
              product_name: contract.product_name,
              period_start: periodStart,
              period_end: periodEnd,
              amount_net: usageNetAmount,
              tax_amount: usageTaxAmount,
              amount_gross: usageGrossAmount,
              currency: "EUR",
              status: "approved",
              export_status: "open",
              description: `Nutzungsgebühren ${invoice.invoice_number} – Geprüfte GOÄ-Rechnungen – ${billingPeriod} (${usageChargeIds.length} Vorgänge)`,
              created_by: null,
              metadata: {
                invoice_number: invoice.invoice_number,
                invoice_id: invoice.id,
                stripe_invoice_id: stripeInvoiceId,
                contract_id: contract.id,
                hfx_customer_number: contract.hfx_customer_number ?? null,
                usage_charge_ids: usageChargeIds,
                charge_count: usageChargeIds.length,
                usage_net_amount: usageNetAmount,
                billing_period: billingPeriod,
                period_month: periodMonthStr,
              },
            } as any);
            if (fibuUsageErr && (fibuUsageErr as any).code !== "23505") {
              console.error(`[auto-invoice] fibu_events invoice_usage_created failed for ${invoice.invoice_number}:`, fibuUsageErr.message);
            }
          }

          console.log(`[auto-invoice] fibu_events created for ${invoice.invoice_number} (base: ${baseNetAmount} €${usageNetAmount > 0 ? `, usage: ${usageNetAmount} €` : ""})`);
        } catch (fibuErr) {
          console.error(`[auto-invoice] fibu_events block failed for ${invoice.invoice_number} – operative flow unaffected:`, String(fibuErr));
        }

        if (sendResult.error) {
          errors.push(`Invoice email [${invoice.invoice_number}]: ${sendResult.error.message}`);
          continue;
        }

        console.log(`[auto-invoice] ✓ Invoice ${invoice.invoice_number} sent to ${emailTo}${stripeInvoiceId ? ` | Stripe: ${stripeInvoiceId}` : ""} | Zeitraum: ${billingPeriod}`);
        processed++;
      } catch (contractErr) {
        console.error(`[auto-invoice] Error processing contract ${contract.id}:`, contractErr);
        errors.push(`Contract ${contract.id}: ${String(contractErr)}`);
      }
    }

    console.log(`[auto-invoice] Done. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ success: true, processed, skipped, errors, billingPeriod: periodMonthStr }),
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
  supabase: ReturnType<typeof createClient>;
  contract: any;
  invoice: any;
  netAmount: number;
  baseNetAmount: number;
  usageChargeIds: string[];
  periodMonthStr: string;
  periodStart: string;
  periodEnd: string;
  billingPeriod: string;
  today: Date;
}) {
  const { supabase, contract, invoice, netAmount, baseNetAmount, usageChargeIds, periodMonthStr, periodStart, periodEnd, billingPeriod, today } = params;

  // Net amount from usage charges
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
      let fixedAmount = 100;

      const sprintEnd = new Date("2026-12-31");
      if (today <= sprintEnd) {
        const { count: contractCount } = await supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("sales_partner_id", contract.sales_partner_id)
          .or("product_name.ilike.%GOÄ%,product_name.ilike.%GOA%")
          .in("status", ["aktiv", "gekündigt", "beendet"]);
        if ((contractCount || 0) >= 25) {
          fixedAmount = 250;
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
          commission_base_amount: baseNetAmount,
          commission_rule_version: "GOÄ-AD-SIGNUP-2026-v1",
          period_month: periodMonthStr,
          status: "pending",
          commission_role: "ad",
          payout_trigger: "contract_signup",
          contract_start_date: contract.start_date,
        });
        console.log(`[auto-invoice] GOÄ AD fixed payout ${fixedAmount} € for ${contract.sales_partner_name}`);

        try {
          const { error: fibuAdSignupErr } = await supabase.from("fibu_events").insert({
            event_type: "internal_sales_bonus_reference",
            source_module: "commission_payouts",
            source_reference_id: `${invoice.id}:ad-signup`,
            contract_id: contract.id,
            customer_id: contract.customer_id ?? null,
            product_name: contract.product_name,
            period_start: periodStart,
            period_end: periodEnd,
            amount_net: fixedAmount,
            tax_amount: 0,
            amount_gross: fixedAmount,
            currency: "EUR",
            commission_type: "festbetrag",
            commission_base_amount: baseNetAmount,
            commission_rate: fixedAmount,
            commission_amount: fixedAmount,
            commission_rule_version: "GOÄ-AD-SIGNUP-2026-v1",
            beneficiary_type: "ad",
            beneficiary_id: contract.sales_partner_id,
            status: "draft",
            export_status: "open",
            description: `AD-Signup-Bonus ${contract.sales_partner_name} – ${contract.product_name} – ${periodMonthStr} (${fixedAmount} €)`,
            created_by: null,
            metadata: {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              commission_rule_version: "GOÄ-AD-SIGNUP-2026-v1",
              period_month: periodMonthStr,
              payout_trigger: "contract_signup",
              hfx_customer_number: contract.hfx_customer_number ?? null,
            },
          } as any);
          if (fibuAdSignupErr && (fibuAdSignupErr as any).code !== "23505") {
            console.error(`[auto-invoice] fibu_events internal_sales_bonus_reference (AD signup) failed:`, fibuAdSignupErr.message);
          }
        } catch (ex) {
          console.error(`[auto-invoice] fibu_events AD signup exception:`, String(ex));
        }
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
            commission_base_amount: usageNetAmount,
            commission_rule_version: "GOÄ-AD-USAGE-10PCT-24M-v1",
            period_month: periodMonthStr,
            status: "pending",
            commission_role: "ad",
            payout_trigger: "usage_revenue",
            contract_start_date: contract.start_date,
          });
          console.log(`[auto-invoice] GOÄ AD usage payout ${usageCommission} € for ${contract.sales_partner_name}`);

          try {
            const { error: fibuAdUsageErr } = await supabase.from("fibu_events").insert({
              event_type: "internal_sales_bonus_reference",
              source_module: "commission_payouts",
              source_reference_id: `${invoice.id}:ad-usage`,
              contract_id: contract.id,
              customer_id: contract.customer_id ?? null,
              product_name: contract.product_name,
              period_start: periodStart,
              period_end: periodEnd,
              amount_net: usageCommission,
              tax_amount: 0,
              amount_gross: usageCommission,
              currency: "EUR",
              commission_type: "prozent",
              commission_base_amount: usageNetAmount,
              commission_rate: 10,
              commission_amount: usageCommission,
              commission_rule_version: "GOÄ-AD-USAGE-10PCT-24M-v1",
              beneficiary_type: "ad",
              beneficiary_id: contract.sales_partner_id,
              status: "draft",
              export_status: "open",
              description: `AD-Verbrauchsbonus ${contract.sales_partner_name} – ${contract.product_name} – ${periodMonthStr} (${usageCommission} €)`,
              created_by: null,
              metadata: {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                commission_rule_version: "GOÄ-AD-USAGE-10PCT-24M-v1",
                period_month: periodMonthStr,
                payout_trigger: "usage_revenue",
                usage_net_amount: usageNetAmount,
                hfx_customer_number: contract.hfx_customer_number ?? null,
              },
            } as any);
            if (fibuAdUsageErr && (fibuAdUsageErr as any).code !== "23505") {
              console.error(`[auto-invoice] fibu_events internal_sales_bonus_reference (AD usage) failed:`, fibuAdUsageErr.message);
            }
          } catch (ex) {
            console.error(`[auto-invoice] fibu_events AD usage exception:`, String(ex));
          }
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
          commission_base_amount: netAmount,
          commission_rule_version: "GOÄ-PARTNER-10PCT-v1",
          period_month: periodMonthStr,
          status: "pending",
          commission_role: "sales_partner",
          payout_trigger: "usage_revenue",
          contract_start_date: contract.start_date,
        });
        console.log(`[auto-invoice] GOÄ sales_partner payout ${totalCommission} € for ${contract.sales_partner_name}`);

        try {
          const { error: fibuGoePartnerErr } = await supabase.from("fibu_events").insert({
            event_type: "partner_commission_approved",
            source_module: "commission_payouts",
            source_reference_id: `${invoice.id}:goe-partner`,
            contract_id: contract.id,
            customer_id: contract.customer_id ?? null,
            product_name: contract.product_name,
            period_start: periodStart,
            period_end: periodEnd,
            amount_net: totalCommission,
            tax_amount: 0,
            amount_gross: totalCommission,
            currency: "EUR",
            commission_type: "prozent",
            commission_base_amount: netAmount,
            commission_rate: 10,
            commission_amount: totalCommission,
            commission_rule_version: "GOÄ-PARTNER-10PCT-v1",
            beneficiary_type: "sales_partner",
            beneficiary_id: contract.sales_partner_id,
            status: "draft",
            export_status: "open",
            description: `GOÄ-Partner-Provision ${contract.sales_partner_name} – ${contract.product_name} – ${periodMonthStr} (${totalCommission} €)`,
            created_by: null,
            metadata: {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              commission_rule_version: "GOÄ-PARTNER-10PCT-v1",
              period_month: periodMonthStr,
              payout_trigger: "usage_revenue",
              hfx_customer_number: contract.hfx_customer_number ?? null,
            },
          } as any);
          if (fibuGoePartnerErr && (fibuGoePartnerErr as any).code !== "23505") {
            console.error(`[auto-invoice] fibu_events partner_commission_approved (GOÄ) failed:`, fibuGoePartnerErr.message);
          }
        } catch (ex) {
          console.error(`[auto-invoice] fibu_events GOÄ partner exception:`, String(ex));
        }
      }
    }
  }

  // ── Tippgeber-Meilenstein (500 € Kumulierschwelle) ────────────────────────
  if (contract.tippgeber_id) {
    const { data: allInvoices } = await supabase
      .from("invoices")
      .select("net_amount")
      .eq("contract_id", contract.id)
      .in("status", ["versendet", "bezahlt"]);

    const cumulativeRevenue = (allInvoices || []).reduce((s: number, inv: any) => s + Number(inv.net_amount), 0);

    const { data: existingMilestone } = await supabase
      .from("tippgeber_milestone_tracking")
      .select("id, milestone_reached")
      .eq("tippgeber_id", contract.tippgeber_id)
      .eq("contract_id", contract.id)
      .maybeSingle();

    if (existingMilestone) {
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
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);color:#fff;padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg"
      alt="Honorarfuchs" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;"/>
    <h1 style="margin:0;font-size:22px;">Zahlungsmethode hinterlegen</h1>
    <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Honorarfuchs – HFX Sales Portal</p>
  </div>
  <div style="background:#fff;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
    <p style="font-size:15px;color:#333;">Sehr geehrte/r ${customerName},</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">für Ihren Vertrag <strong>${productName}</strong> (Abrechnungszeitraum: ${billingPeriod}) benötigen wir Ihre SEPA-Zahlungsdaten, um den monatlichen Einzug zu ermöglichen.</p>
    <p style="color:#555;font-size:14px;">Bitte klicken Sie auf den folgenden Button, um Ihre Zahlungsmethode sicher zu hinterlegen:</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${setupUrl}" style="background:#0b367f;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;text-decoration:none;display:inline-block;font-weight:bold;">Zahlungsmethode hinterlegen</a>
    </div>
    <p style="color:#888;font-size:12px;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br/><a href="${setupUrl}" style="color:#0b367f;word-break:break-all;">${setupUrl}</a></p>
  </div>
  <div style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">© Honorarfuchs – HFX Sales Portal</p>
  </div>
</div>
</body></html>`;
}
