import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { isGoaeProduct, isCarrierContract, healCustomerStripeId } from "../_shared/multiLocation.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
  apiVersion: "2024-06-20",
});

const BUCHHALTUNG_EMAIL = Deno.env.get("BUCHHALTUNG_EMAIL") || "buchhaltung@hfx-honorarfuchs.de";

// Resolve sales partner email via profiles.email, fallback to auth.admin.getUserById
async function resolveSalesPartnerEmail(supabase: any, salesPartnerId: string | null | undefined): Promise<string | null> {
  if (!salesPartnerId) return null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", salesPartnerId)
      .maybeSingle();
    if (profile?.email) return profile.email as string;
  } catch (e) {
    console.error("[auto-invoice] profiles lookup failed:", String(e));
  }
  try {
    const { data } = await supabase.auth.admin.getUserById(salesPartnerId);
    return data?.user?.email ?? null;
  } catch (e) {
    console.error("[auto-invoice] auth.admin.getUserById failed:", String(e));
    return null;
  }
}

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
  const holidays = getGermanHolidays(from.getFullYear() - 1);
  const holidaysNow = getGermanHolidays(from.getFullYear());
  const holidaysNext = getGermanHolidays(from.getFullYear() + 1);
  const allHolidays = new Set([...holidays, ...holidaysNow, ...holidaysNext]);
  const step = days >= 0 ? 1 : -1;
  let moved = 0;
  const target = Math.abs(days);
  while (moved < target) {
    result.setDate(result.getDate() + step);
    const dow = result.getDay();
    const dateStr = result.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !allHolidays.has(dateStr)) moved++;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate cron secret for security (consistent with usage-sync: CRON_SECRET_2)
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const expectedSecret = Deno.env.get("CRON_SECRET_2") ?? "";
  const authHeader = req.headers.get("authorization") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const validCron = cronSecret !== "" && cronSecret === expectedSecret;
  const validAnon = authHeader === `Bearer ${anonKey}`;
  if (!validCron && !validAnon) {
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

    // ──────────────────────────────────────────────────────────────────────
    // B1-B5: Retry-Pfad für zuvor fehlgeschlagene Stripe-Charges
    // Bedingungen: status='zahlung_fehlgeschlagen', stripe_invoice_id IS NULL,
    //   retry_attempted_at IS NULL, email_sent_at <= (now - 1 Werktag).
    // Es erfolgt EIN einmaliger Retry. retry_attempted_at wird VOR dem Stripe-Call
    // gesetzt, damit ein Crash im Stripe-Pfad nicht zu Doppeleinzügen führt.
    // Im manuellen Single-Contract-Modus (POST mit contract_id) wird der Retry-Pfad
    // übersprungen, damit der manuelle Trigger deterministisch nur den Ziel-Vertrag
    // verarbeitet.
    // ──────────────────────────────────────────────────────────────────────
    let retriesAttempted = 0;
    let retriesSucceeded = 0;
    let retriesFailed = 0;
    if (!targetContractId) {
      try {
        const oneBdAgo = addBusinessDays(today, -1).toISOString();
        const { data: retryCandidates, error: retryQueryErr } = await supabase
          .from("invoices")
          .select("*")
          .eq("status", "zahlung_fehlgeschlagen")
          .is("stripe_invoice_id", null)
          .is("retry_attempted_at", null)
          .lte("email_sent_at", oneBdAgo)
          .limit(100);

        if (retryQueryErr) {
          console.error("[auto-invoice] Retry query error:", retryQueryErr.message);
        } else if (retryCandidates && retryCandidates.length > 0) {
          console.log(`[auto-invoice] Retry candidates: ${retryCandidates.length}`);
          for (const inv of retryCandidates) {
            try {
              const result = await processFailedInvoiceRetry({ supabase, invoice: inv });
              retriesAttempted++;
              if (result === "success") retriesSucceeded++;
              else if (result === "failed") retriesFailed++;
            } catch (rEx) {
              console.error(`[auto-invoice] Retry exception for invoice ${inv.invoice_number}:`, String(rEx));
              retriesFailed++;
            }
          }
        } else {
          console.log("[auto-invoice] Retry: keine Kandidaten gefunden.");
        }
        console.log(`[auto-invoice] Retry summary: ${retriesAttempted} attempted, ${retriesSucceeded} succeeded, ${retriesFailed} still failed`);
      } catch (retryFatal) {
        console.error("[auto-invoice] Retry-Sektion fatal:", String(retryFatal));
      }
    }

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contract of contracts) {
      try {
        // ── Duplikat-Check: Robuste Prüfung über billing_period_month ──
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("billing_period_month", periodMonthStr)
          .maybeSingle();

        if (existing) {
          console.log(`[auto-invoice] Invoice already exists for contract ${contract.id} in ${periodMonthStr}, skipping.`);
          skipped++;
          continue;
        }

        // ── Übergangsguard: Wenn Usage für diese Periode bereits invoiced ist,
        //    aber kein pending-Charge mehr existiert, darf keine leere Folgerechnung entstehen ──
        if (contract.hfx_customer_number) {
          const { data: alreadyInvoicedUsage } = await supabase
            .from("usage_charges")
            .select("id")
            .eq("hfx_customer_number", contract.hfx_customer_number)
            .eq("period_from", periodStart)
            .eq("status", "invoiced")
            .limit(1);

          if (alreadyInvoicedUsage && alreadyInvoicedUsage.length > 0) {
            const { data: pendingUsage } = await supabase
              .from("usage_charges")
              .select("id")
              .eq("hfx_customer_number", contract.hfx_customer_number)
              .eq("period_from", periodStart)
              .eq("status", "pending")
              .limit(1);

            if (!pendingUsage || pendingUsage.length === 0) {
              console.log(`[auto-invoice] Usage for ${contract.hfx_customer_number} in ${periodMonthStr} already invoiced, no pending charges – skipping to avoid duplicate.`);
              skipped++;
              continue;
            }
          }
        }

        if (!contract.rechnungs_email && !contract.email) {
          console.log(`[auto-invoice] No email for contract ${contract.id}, skipping.`);
          skipped++;
          continue;
        }

        // ── Multi-Standort: Trägervertrag ermitteln (NULL = Träger) ──────────
        // Identische Bedingung wird unten bei Grundgebühr UND in
        // createGoaeCommissions (AD-Signup-Bonus) verwendet.
        let customerBaseFeeContractId: string | null = null;
        if (contract.customer_id) {
          try {
            const { data: cust } = await supabase
              .from("customers")
              .select("base_fee_contract_id")
              .eq("id", contract.customer_id)
              .maybeSingle();
            customerBaseFeeContractId = (cust as any)?.base_fee_contract_id ?? null;
          } catch (e) {
            console.warn(`[auto-invoice] customer lookup failed for ${contract.id}:`, String(e));
          }
        }
        const isCarrier = isCarrierContract(contract.id, contract.customer_id, customerBaseFeeContractId);
        const isGoae = isGoaeProduct(contract.product_name);
        const isLocationGoae = isGoae && !isCarrier;
        if (isLocationGoae) {
          console.log(`[auto-invoice] Standort-GOÄ erkannt für Vertrag ${contract.id} (Träger=${customerBaseFeeContractId}) — Grundgebühr & AD-Signup-Bonus werden ausgesetzt`);
        }

        // ── Grundgebühr-Waiver-Logik (aus Vertragsfeldern statt hart codiert) ──
        const isInWaiverPeriod = contract.base_fee_waived === true &&
          contract.base_fee_waived_until != null &&
          new Date(periodEnd) <= new Date(contract.base_fee_waived_until);
        const waiverUntilFormatted = contract.base_fee_waived_until
          ? new Date(contract.base_fee_waived_until).toLocaleDateString("de-DE")
          : "";

        const contractMonthly = Number(contract.monthly_price) || 0;
        if (isInWaiverPeriod) {
          console.log(`[auto-invoice] Waiver aktiv für Vertrag ${contract.id} (bis ${contract.base_fee_waived_until}) – alle Positionen 0 €`);
        }
        const waiverHint = isInWaiverPeriod ? ` (Einführungsaktion – ausgesetzt bis ${waiverUntilFormatted})` : "";
        const priceOrZero = (v: number) => (isInWaiverPeriod ? 0 : v);

        // Build invoice positions
        const taxRate = 19;
        const positions: { description: string; quantity: number; unit_price: number }[] = [];

        // ── EBM-spezifischer Aufbau (Variante 2: Module + Grundgebühr + LANR-Aufschlag + Korrektur) ──
        const isEbm = (contract.product_name || "").includes("HFX EBM");

        if (isEbm) {
          // Lade HFX EBM Produkt + Module
          const { data: ebmProduct } = await supabase
            .from("products")
            .select("id, monthly_price")
            .eq("name", "HFX EBM")
            .maybeSingle();

          const ebmBasePrice = Number(ebmProduct?.monthly_price) || 0;

          let modulesById: Record<string, { name: string; monthly_price: number }> = {};
          let modulesByName: Record<string, { name: string; monthly_price: number }> = {};
          if (ebmProduct?.id) {
            const { data: pm } = await supabase
              .from("product_modules")
              .select("id, name, monthly_price")
              .eq("product_id", ebmProduct.id);
            for (const m of (pm || [])) {
              const entry = { name: m.name, monthly_price: Number(m.monthly_price) || 0 };
              modulesById[m.id] = entry;
              modulesByName[m.name] = entry;
            }
          }

          // 1) Module-Positionen (eine je selected_addon_modules-Eintrag)
          const selectedModules: string[] = Array.isArray(contract.selected_addon_modules)
            ? contract.selected_addon_modules
            : [];
          let modulesSum = 0;
          for (const key of selectedModules) {
            const m = modulesByName[key] || modulesById[key];
            if (!m) {
              console.warn(`[auto-invoice] EBM-Modul nicht gefunden: "${key}" (Vertrag ${contract.id})`);
              continue;
            }
            modulesSum += m.monthly_price;
            positions.push({
              description: `${m.name} – ${billingPeriod}${waiverHint}`,
              quantity: 1,
              unit_price: priceOrZero(m.monthly_price),
            });
          }

          // 2) Grundgebühr (aus products.monthly_price, NICHT contract.monthly_price)
          positions.push({
            description: `Grundgebühr HFX EBM (1 BSNR + 3 LANR inkl.) – ${billingPeriod}${waiverHint}`,
            quantity: 1,
            unit_price: priceOrZero(ebmBasePrice),
          });

          // 3) LANR-Aufschlag falls > 3
          const lanrCount = Number(contract.lanr_count) || 0;
          const extraLanr = Math.max(0, lanrCount - 3);
          const LANR_UNIT_PRICE = 22;
          if (extraLanr > 0) {
            positions.push({
              description: `Zusätzliche LANR (${extraLanr} über inkludiert) – ${billingPeriod}${waiverHint}`,
              quantity: extraLanr,
              unit_price: priceOrZero(LANR_UNIT_PRICE),
            });
          }

          // 4) Korrektur-Position (Diff zu contract.monthly_price = SSOT)
          const computedSum = ebmBasePrice + modulesSum + extraLanr * LANR_UNIT_PRICE;
          const diff = Math.round((contractMonthly - computedSum) * 100) / 100;
          if (diff !== 0) {
            const label = diff > 0 ? "Sondervereinbarung Aufschlag" : "Sondervereinbarung Rabatt";
            positions.push({
              description: `${label} – ${billingPeriod}${waiverHint}`,
              quantity: 1,
              unit_price: priceOrZero(diff),
            });
          }
        } else {
          // ── Bestehender, produkt-agnostischer Pfad (GOÄ, Live-Check, etc.) ──
          // Multi-Standort: Bei GOÄ-Standortverträgen (nicht-Träger) entfällt die Grundgebühr,
          // weil sie einmalig auf dem Hauptaccount-Vertrag abgerechnet wird.
          if (isLocationGoae) {
            positions.push({
              description: `Grundgebühr ${contract.product_name} – ${billingPeriod} (Standortvertrag – Grundgebühr läuft über Hauptaccount)`,
              quantity: contract.license_count || 1,
              unit_price: 0,
            });
          } else {
            const baseNetAmount = isInWaiverPeriod ? 0 : contractMonthly;
            if (baseNetAmount > 0) {
              positions.push({
                description: `Grundgebühr ${contract.product_name} – ${billingPeriod}`,
                quantity: contract.license_count || 1,
                unit_price: baseNetAmount / (contract.license_count || 1),
              });
            } else if (isInWaiverPeriod) {
              positions.push({
                description: `Grundgebühr ${contract.product_name} – ${billingPeriod} (Einführungsaktion – Grundgebühr ausgesetzt bis ${waiverUntilFormatted})`,
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
          }
        }

        // Nutzungsgebühren (GOÄ-Verbrauch) – NUR für den exakten Abrechnungs-Vormonat. Unverändert.
        let usageChargeIds: string[] = [];
        let usageNetAmount = 0;
        if (contract.hfx_customer_number) {
          const { data: usageCharges } = await supabase
            .from("usage_charges")
            .select("*")
            .eq("hfx_customer_number", contract.hfx_customer_number)
            .eq("status", "pending")
            .eq("period_from", periodStart)
            .eq("period_to", periodEnd);

          if (usageCharges && usageCharges.length > 0) {
            usageChargeIds = usageCharges.map((u: any) => u.id);
            for (const uc of usageCharges) {
              const lineNet = uc.quantity * Number(uc.unit_price);
              usageNetAmount += lineNet;
              positions.push({
                description: uc.unit_description || `Geprüfte GOÄ-Rechnungen (HFX GOÄ) – ${billingPeriod}`,
                quantity: uc.quantity,
                unit_price: Number(uc.unit_price),
              });
            }
          }
        }

        // Recalculate totals
        const netAmount = positions.reduce((s, p) => s + p.quantity * p.unit_price, 0);
        const taxAmount = Math.round(netAmount * taxRate) / 100;
        const grossAmount = Math.round((netAmount + taxAmount) * 100) / 100;

        const collectionDate = addBusinessDays(today, 3);
        const dueDateStr = collectionDate.toISOString().split("T")[0];
        const collectionDateFormatted = collectionDate.toLocaleDateString("de-DE");
        const todayStr = today.toISOString().split("T")[0];

        // ── Stripe SEPA Prüfung ──────────────────────────────────────────────
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

              // Multi-Standort Self-Heal (NULL-only, kein breites WHERE):
              await healCustomerStripeId(supabase, contract.customer_id, stripeCustomer.id);

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

        // ── 1. ZUERST interner Rechnungsdatensatz anlegen ──────────────────
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
            billing_period_month: periodMonthStr,
            positions: positions,
            net_amount: netAmount,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            gross_amount: grossAmount,
            status: "entwurf",
            notes: `Automatisch generiert – Abrechnungszeitraum: ${billingPeriod} (${periodMonthStr})${isInWaiverPeriod ? " | Grundgebühr-Waiver aktiv (0 €)" : ""}${usageChargeIds.length > 0 ? ` | ${usageChargeIds.length} geprüfte GOÄ-Rechnungen: ${usageNetAmount.toFixed(2)} € netto` : ""}`,
          } as any)
          .select()
          .single();

        if (insertError || !invoice) {
          // Unique-Constraint-Verletzung = bereits fakturiert
          if ((insertError as any)?.code === "23505") {
            console.log(`[auto-invoice] Duplicate blocked by unique constraint for contract ${contract.id} in ${periodMonthStr}`);
            skipped++;
          } else {
            errors.push(`Contract ${contract.id}: ${insertError?.message}`);
          }
          continue;
        }

        // ── 2. Usage charges als invoiced markieren ──────────────────────────
        if (usageChargeIds.length > 0) {
          await supabase
            .from("usage_charges")
            .update({ status: "invoiced", invoice_id: invoice.id })
            .in("id", usageChargeIds);
          console.log(`[auto-invoice] Attached ${usageChargeIds.length} usage charges to invoice ${invoice.invoice_number}`);
        }

        // ── 3. DANACH Stripe-Zahlung auslösen ───────────────────────────────
        let stripeInvoiceId: string | null = null;
        // A1: Flag, damit nachfolgende Blöcke (Status, fibu_events, Provisionen) reagieren können
        let stripeChargeFailed = false;
        let stripeErrorMessage: string | null = null;
        if (hasStripeCustomer && grossAmount > 0) {
          const createdItemIds: string[] = [];
          let stripeInvoice: any = null;
          try {
            const stripeDescription = `${contract.product_name} – ${billingPeriod}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}${usageChargeIds.length > 0 ? ` | Nutzung: ${usageChargeIds.length} geprüfte GOÄ-Rechnungen (${usageNetAmount.toFixed(2)} €)` : ""}`;

            // SYNCHRONIZE WITH manual-interim-invoice (V2 flow):
            // 1) Draft-Invoice zuerst, 2) stripe_invoice_id sofort persistieren,
            // 3) Items mit invoice:<id> hängen, 4) finalize+pay.
            stripeInvoice = await stripe.invoices.create({
              customer: contract.stripe_customer_id,
              auto_advance: false,
              collection_method: "charge_automatically",
              pending_invoice_items_behavior: "exclude",
              description: stripeDescription,
              metadata: {
                hfx_contract_id: contract.id,
                hfx_customer_number: contract.hfx_customer_number || "",
                billing_period: periodMonthStr,
                hfx_invoice_id: invoice.id,
                hfx_invoice_number: invoice.invoice_number,
              },
            });

            // Stripe-ID sofort persistieren — sichert Verknüpfung selbst bei
            // späterem Fehler in Items/finalize/pay.
            await supabase
              .from("invoices")
              .update({ stripe_invoice_id: stripeInvoice.id })
              .eq("id", invoice.id);

            for (const pos of positions) {
              if (pos.quantity * pos.unit_price <= 0) continue;
              const item = await stripe.invoiceItems.create({
                customer: contract.stripe_customer_id,
                invoice: stripeInvoice.id,
                amount: Math.round(pos.quantity * pos.unit_price * 100),
                currency: "eur",
                description: pos.description,
                tax_rates: [],
              });
              createdItemIds.push(item.id);
            }

            const taxItem = await stripe.invoiceItems.create({
              customer: contract.stripe_customer_id,
              invoice: stripeInvoice.id,
              amount: Math.round(taxAmount * 100),
              currency: "eur",
              description: `MwSt. 19% auf ${netAmount.toFixed(2)} €`,
            });
            createdItemIds.push(taxItem.id);

            const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
            await stripe.invoices.pay(finalizedInvoice.id);

            stripeInvoiceId = stripeInvoice.id;

            console.log(`[auto-invoice] Stripe invoice ${stripeInvoice.id} created and payment initiated for contract ${contract.id}`);
          } catch (stripeErr: any) {
            console.error(`[auto-invoice] Stripe error for contract ${contract.id}:`, stripeErr?.message);
            errors.push(`Stripe [${contract.id}]: ${stripeErr?.message}`);
            // A1: Flag setzen
            stripeChargeFailed = true;
            stripeErrorMessage = stripeErr?.message || String(stripeErr);

            // Cleanup Items
            for (const itemId of createdItemIds) {
              try {
                await stripe.invoiceItems.del(itemId);
              } catch (cleanupErr: any) {
                console.error(`[auto-invoice] Cleanup failed for invoiceItem ${itemId}:`, cleanupErr?.message);
              }
            }
            // Cleanup Invoice: draft → del, open → void, sonst noop (paid/uncollectible/void)
            if (stripeInvoice?.id) {
              try {
                const fresh = await stripe.invoices.retrieve(stripeInvoice.id);
                if (fresh.status === "draft") {
                  try { await stripe.invoices.del(stripeInvoice.id); } catch (_) {}
                } else if (fresh.status === "open") {
                  try { await stripe.invoices.voidInvoice(stripeInvoice.id); } catch (_) {}
                }
              } catch (cleanupErr: any) {
                console.error(`[auto-invoice] Invoice cleanup retrieve failed for ${stripeInvoice.id}:`, cleanupErr?.message);
              }
            }

            // A2: Interne Rechnung als 'zahlung_fehlgeschlagen' markieren – mit Status-Schutz
            await supabase
              .from("invoices")
              .update({ status: "zahlung_fehlgeschlagen" })
              .eq("id", invoice.id)
              .not("status", "in", "(bezahlt,storniert)");

            // A7: Audit-Event in fibu_events (idempotent via idx_fibu_events_source_unique)
            try {
              const { error: auditErr } = await supabase.from("fibu_events").insert({
                event_type: "auto_invoice_charge_failed",
                source_module: "invoices",
                source_reference_id: invoice.id,
                contract_id: contract.id,
                customer_id: contract.customer_id ?? null,
                product_name: contract.product_name,
                period_start: periodStart,
                period_end: periodEnd,
                amount_net: Number(invoice.net_amount) || 0,
                tax_amount: Number(invoice.tax_amount) || 0,
                amount_gross: Number(invoice.gross_amount) || 0,
                currency: "EUR",
                status: "draft",
                export_status: "open",
                description: `Stripe-Charge fehlgeschlagen für ${invoice.invoice_number} – ${stripeErrorMessage}`,
                created_by: null,
                metadata: {
                  invoice_id: invoice.id,
                  invoice_number: invoice.invoice_number,
                  hfx_customer_number: contract.hfx_customer_number ?? null,
                  stripe_error: stripeErrorMessage,
                  billing_period: billingPeriod,
                  period_month: periodMonthStr,
                  attempt: "initial",
                },
              } as any);
              if (auditErr && (auditErr as any).code !== "23505") {
                console.error(`[auto-invoice] fibu_events auto_invoice_charge_failed insert failed:`, auditErr.message);
              }
            } catch (auditEx) {
              console.error(`[auto-invoice] fibu_events auto_invoice_charge_failed exception:`, String(auditEx));
            }

            // A9: Buchhaltungs- + Vertriebs-Mail (Failure-Notification, einmalig)
            try {
              const partnerEmail = await resolveSalesPartnerEmail(supabase, contract.sales_partner_id);
              const recipients = [BUCHHALTUNG_EMAIL];
              if (partnerEmail && partnerEmail !== BUCHHALTUNG_EMAIL) recipients.push(partnerEmail);
              await resend.emails.send({
                from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
                reply_to: "info@hfx-honorarfuchs.de",
                to: recipients,
                subject: `[Stripe-Failure] Rechnung ${invoice.invoice_number} – ${contract.customer_name}`,
                html: `<p>Die automatische Stripe-Abbuchung ist fehlgeschlagen.</p>
<ul>
  <li><strong>Rechnung:</strong> ${invoice.invoice_number}</li>
  <li><strong>Kunde:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</li>
  <li><strong>Vertrag-ID:</strong> ${contract.id}</li>
  <li><strong>Abrechnungszeitraum:</strong> ${billingPeriod}</li>
  <li><strong>Bruttobetrag:</strong> ${Number(invoice.gross_amount).toFixed(2)} €</li>
  <li><strong>Stripe-Fehler:</strong> ${stripeErrorMessage}</li>
</ul>
<p>Interner Status: <strong>zahlung_fehlgeschlagen</strong>. Es erfolgt automatisch <strong>ein einmaliger Retry</strong> frühestens 1 Werktag nach Versand der Rechnung.</p>`,
              });
            } catch (mailErr) {
              console.error(`[auto-invoice] Buchhaltungs-/Vertriebs-Failure-Mail fehlgeschlagen:`, String(mailErr));
            }
          }
        } else if (grossAmount === 0) {
          console.log(`[auto-invoice] Contract ${contract.id} – Gesamtbetrag 0 €, kein Stripe-Einzug nötig`);
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
        // A3: Wenn Stripe-Charge fehlgeschlagen ist, oranger Hinweisblock vor dem normalen Block
        const chargeFailedNoticeHtml = stripeChargeFailed
          ? `<div style="background:#fff4e5;border:1px solid #ffb74d;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#8a4b00;"><strong>⚠️ Hinweis: Automatischer Einzug aktuell nicht möglich</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#8a4b00;">Der automatische SEPA-Einzug für diese Rechnung ist beim ersten Versuch fehlgeschlagen. Wir versuchen den Einzug automatisch erneut. Sie müssen aktuell <strong>nichts unternehmen</strong>.</p>
              <p style="margin:6px 0 0;font-size:13px;color:#8a4b00;">Bei Rückfragen wenden Sie sich bitte an <a href="mailto:buchhaltung@hfx-honorarfuchs.de" style="color:#8a4b00;">buchhaltung@hfx-honorarfuchs.de</a>.</p>
            </div>`
          : "";
        const paymentBlockHtml = stripeChargeFailed
          ? ""
          : hasStripeCustomer && grossAmount > 0
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
    ${chargeFailedNoticeHtml}
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

        // A4: email_sent_at IMMER setzen (Kunden-Mail wurde versendet, ggf. mit Hinweisblock).
        // Status nur auf 'versendet' anheben, wenn Stripe nicht fehlgeschlagen ist – sonst bleibt
        // 'zahlung_fehlgeschlagen' (aus Catch). Status-Schutz verhindert Überschreiben von bezahlt/storniert.
        if (stripeChargeFailed) {
          await supabase
            .from("invoices")
            .update({ email_sent_at: nowTs })
            .eq("id", invoice.id);
        } else {
          await supabase
            .from("invoices")
            .update({ status: "versendet", email_sent_at: nowTs })
            .eq("id", invoice.id)
            .not("status", "in", "(bezahlt,storniert)");
        }

        // A5/A6: Provisionen + fibu_events nur wenn Stripe-Charge erfolgreich war.
        // Auto-generate commission payout
        if (!stripeChargeFailed && contract.sales_partner_id) {
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
              isCarrier,
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
        // A5: Bei Stripe-Failure KEINE fibu_events anlegen (Audit-Event wurde im Catch geschrieben).
        if (!stripeChargeFailed) {
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
        } // end if (!stripeChargeFailed) — fibu/commissions block

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
      JSON.stringify({ success: true, processed, skipped, errors, billingPeriod: periodMonthStr, retries: { attempted: retriesAttempted, succeeded: retriesSucceeded, failed: retriesFailed } }),
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
  /** Multi-Standort: nur Trägervertrag erhält AD-Signup-Bonus. NULL/Unbekannt = true (Bestand). */
  isCarrier?: boolean;
}) {
  const { supabase, contract, invoice, netAmount, baseNetAmount, usageChargeIds, periodMonthStr, periodStart, periodEnd, billingPeriod, today } = params;
  const isCarrier = params.isCarrier !== false; // default true für Bestand

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
    // 1. Festbetrag bei Vertragsabschluss (erste Rechnung).
    //    Multi-Standort: Bonus nur einmal pro Hauptaccount, also nur auf dem Trägervertrag.
    if (isFirstInvoice && isCarrier) {
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

// ────────────────────────────────────────────────────────────────────────────
// B-Sektion: Retry-Logik für fehlgeschlagene Stripe-Charges
// ────────────────────────────────────────────────────────────────────────────
async function processFailedInvoiceRetry(params: {
  supabase: any;
  invoice: any;
}): Promise<"success" | "failed" | "skipped"> {
  const { supabase, invoice } = params;

  // B5: retry_attempted_at SOFORT (vor jedem Stripe-Call) setzen, mit Idempotenz-Schutz.
  // Nur wenn retry_attempted_at IS NULL noch — verhindert Doppelläufe bei parallelen Crons.
  const nowTs = new Date().toISOString();
  const { data: lockedRow, error: lockErr } = await supabase
    .from("invoices")
    .update({ retry_attempted_at: nowTs })
    .eq("id", invoice.id)
    .is("retry_attempted_at", null)
    .select("id")
    .maybeSingle();

  if (lockErr) {
    console.error(`[auto-invoice][retry] Lock-Update für ${invoice.invoice_number} fehlgeschlagen:`, lockErr.message);
    return "skipped";
  }
  if (!lockedRow) {
    console.log(`[auto-invoice][retry] ${invoice.invoice_number}: bereits retried (race condition), überspringe.`);
    return "skipped";
  }

  // Vertrag laden
  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", invoice.contract_id)
    .maybeSingle();
  if (contractErr || !contract) {
    console.error(`[auto-invoice][retry] Vertrag für Invoice ${invoice.invoice_number} nicht gefunden.`);
    return "skipped";
  }

  if (!contract.stripe_customer_id) {
    console.warn(`[auto-invoice][retry] Vertrag ${contract.id} hat (mehr) kein stripe_customer_id – Retry übersprungen.`);
    return "skipped";
  }

  const positions: { description: string; quantity: number; unit_price: number }[] = Array.isArray(invoice.positions) ? invoice.positions : [];
  const netAmount = Number(invoice.net_amount) || 0;
  const taxAmount = Number(invoice.tax_amount) || 0;
  const grossAmount = Number(invoice.gross_amount) || 0;
  const periodMonthStr: string = invoice.billing_period_month || "";

  if (grossAmount <= 0 || positions.length === 0) {
    console.warn(`[auto-invoice][retry] Invoice ${invoice.invoice_number} hat keine Positionen / 0 €, kein Retry.`);
    return "skipped";
  }

  // Period rekonstruieren
  const [py, pm] = periodMonthStr.split("-").map((s: string) => Number(s));
  const periodStart = `${periodMonthStr}-01`;
  const daysInPeriod = pm && py ? new Date(py, pm, 0).getDate() : 30;
  const periodEnd = `${periodMonthStr}-${String(daysInPeriod).padStart(2, "0")}`;
  const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const billingPeriod = pm && py ? `${monthNames[pm - 1]} ${py}` : periodMonthStr;

  // Usage-Charges für diese Invoice (für fibu + Provisionen + Erfolgs-Mail-Detail)
  const { data: usageRows } = await supabase
    .from("usage_charges")
    .select("id, net_amount")
    .eq("invoice_id", invoice.id);
  const usageChargeIds: string[] = (usageRows || []).map((r: any) => r.id);
  const usageNetAmount: number = (usageRows || []).reduce((s: number, r: any) => s + Number(r.net_amount || 0), 0);
  const baseNetAmount = Math.round((netAmount - usageNetAmount) * 100) / 100;

  const isInWaiverPeriod = contract.base_fee_waived === true &&
    contract.base_fee_waived_until != null &&
    new Date(periodEnd) <= new Date(contract.base_fee_waived_until);

  // Stripe-Retry (V2 flow, vgl. manual-interim-invoice)
  const createdItemIds: string[] = [];
  let stripeInvoiceId: string | null = null;
  let stripeErrorMessage: string | null = null;
  let stripeInvoice: any = null;
  try {
    const stripeDescription = `[Retry] ${contract.product_name} – ${billingPeriod}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`;

    // 1) Draft-Invoice zuerst
    stripeInvoice = await stripe.invoices.create({
      customer: contract.stripe_customer_id,
      auto_advance: false,
      collection_method: "charge_automatically",
      pending_invoice_items_behavior: "exclude",
      description: stripeDescription,
      metadata: {
        hfx_contract_id: contract.id,
        hfx_customer_number: contract.hfx_customer_number || "",
        billing_period: periodMonthStr,
        hfx_invoice_id: invoice.id,
        hfx_invoice_number: invoice.invoice_number,
        retry: "true",
      },
    });

    // 2) stripe_invoice_id sofort persistieren
    await supabase
      .from("invoices")
      .update({ stripe_invoice_id: stripeInvoice.id })
      .eq("id", invoice.id);

    // 3) Items explizit attachen
    for (const pos of positions) {
      if (pos.quantity * pos.unit_price <= 0) continue;
      const item = await stripe.invoiceItems.create({
        customer: contract.stripe_customer_id,
        invoice: stripeInvoice.id,
        amount: Math.round(pos.quantity * pos.unit_price * 100),
        currency: "eur",
        description: pos.description,
        tax_rates: [],
      });
      createdItemIds.push(item.id);
    }
    const taxItem = await stripe.invoiceItems.create({
      customer: contract.stripe_customer_id,
      invoice: stripeInvoice.id,
      amount: Math.round(taxAmount * 100),
      currency: "eur",
      description: `MwSt. 19% auf ${netAmount.toFixed(2)} €`,
    });
    createdItemIds.push(taxItem.id);

    // 4) Finalize + Pay
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    await stripe.invoices.pay(finalized.id);
    stripeInvoiceId = stripeInvoice.id;
  } catch (stripeErr: any) {
    stripeErrorMessage = stripeErr?.message || String(stripeErr);
    console.error(`[auto-invoice][retry] Stripe-Failure für ${invoice.invoice_number}:`, stripeErrorMessage);
    // Cleanup Items
    for (const itemId of createdItemIds) {
      try { await stripe.invoiceItems.del(itemId); } catch {}
    }
    // Cleanup Invoice: draft → del, open → void, sonst noop
    if (stripeInvoice?.id) {
      try {
        const fresh = await stripe.invoices.retrieve(stripeInvoice.id);
        if (fresh.status === "draft") {
          try { await stripe.invoices.del(stripeInvoice.id); } catch {}
        } else if (fresh.status === "open") {
          try { await stripe.invoices.voidInvoice(stripeInvoice.id); } catch {}
        }
      } catch {}
    }

    // B3: Eskalations-Mail an Buchhaltung + Vertrieb. KEIN zweites Audit-Event
    // (idx_fibu_events_source_unique würde es ohnehin blocken). Nur console.log.
    console.log(`[auto-invoice][retry] Eskalation für ${invoice.invoice_number}: ${stripeErrorMessage}`);
    try {
      const partnerEmail = await resolveSalesPartnerEmail(supabase, contract.sales_partner_id);
      const recipients = [BUCHHALTUNG_EMAIL];
      if (partnerEmail && partnerEmail !== BUCHHALTUNG_EMAIL) recipients.push(partnerEmail);
      await resend.emails.send({
        from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: recipients,
        subject: `[ESKALATION] Stripe-Retry fehlgeschlagen – Rechnung ${invoice.invoice_number}`,
        html: `<p>Der automatische <strong>einmalige Retry</strong> der Stripe-Abbuchung ist ebenfalls fehlgeschlagen. Bitte manuelle Klärung.</p>
<ul>
  <li><strong>Rechnung:</strong> ${invoice.invoice_number}</li>
  <li><strong>Kunde:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</li>
  <li><strong>Vertrag-ID:</strong> ${contract.id}</li>
  <li><strong>Abrechnungszeitraum:</strong> ${billingPeriod}</li>
  <li><strong>Bruttobetrag:</strong> ${grossAmount.toFixed(2)} €</li>
  <li><strong>Stripe-Fehler (Retry):</strong> ${stripeErrorMessage}</li>
</ul>
<p>Status bleibt <strong>zahlung_fehlgeschlagen</strong>. Es wird <strong>kein</strong> weiterer automatischer Retry erfolgen.</p>`,
      });
    } catch (mailEx) {
      console.error(`[auto-invoice][retry] Eskalations-Mail fehlgeschlagen:`, String(mailEx));
    }
    return "failed";
  }

  // Erfolg: Invoice auf bezahlt setzen + Stripe-ID nachführen (Status-Schutz: nicht überschreiben wenn storniert).
  await supabase
    .from("invoices")
    .update({ status: "bezahlt", stripe_invoice_id: stripeInvoiceId })
    .eq("id", invoice.id)
    .not("status", "in", "(storniert)");

  console.log(`[auto-invoice][retry] ✓ Erfolgreich: Invoice ${invoice.invoice_number} bezahlt via Stripe ${stripeInvoiceId}`);

  // fibu_events nachholen (idempotent: idx_fibu_events_source_unique blockt Duplikate)
  try {
    const baseShare = netAmount > 0 ? baseNetAmount / netAmount : 0;
    const baseTaxAmount = Math.round(taxAmount * baseShare * 100) / 100;
    const baseGrossAmount = Math.round((baseNetAmount + baseTaxAmount) * 100) / 100;

    const { error: fibuBaseErr } = await supabase.from("fibu_events").insert({
      event_type: "invoice_base_fee_created",
      source_module: "invoices",
      source_reference_id: invoice.id,
      contract_id: contract.id,
      customer_id: contract.customer_id ?? null,
      product_name: contract.product_name,
      period_start: periodStart,
      period_end: periodEnd,
      amount_net: baseNetAmount,
      tax_amount: baseTaxAmount,
      amount_gross: baseGrossAmount,
      currency: "EUR",
      status: "approved",
      export_status: "open",
      description: `Grundgebühr ${invoice.invoice_number} – ${contract.product_name} – ${billingPeriod}${isInWaiverPeriod ? " (Waiver 0 €)" : ""} [retry]`,
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
        via_retry: true,
      },
    } as any);
    if (fibuBaseErr && (fibuBaseErr as any).code !== "23505") {
      console.error(`[auto-invoice][retry] fibu_events invoice_base_fee_created:`, fibuBaseErr.message);
    }

    if (usageNetAmount > 0) {
      const usageShare = netAmount > 0 ? usageNetAmount / netAmount : 0;
      const usageTaxAmount = Math.round(taxAmount * usageShare * 100) / 100;
      const usageGrossAmount = Math.round((usageNetAmount + usageTaxAmount) * 100) / 100;
      const { error: fibuUsageErr } = await supabase.from("fibu_events").insert({
        event_type: "invoice_usage_created",
        source_module: "invoices",
        source_reference_id: `${invoice.id}:usage`,
        contract_id: contract.id,
        customer_id: contract.customer_id ?? null,
        product_name: contract.product_name,
        period_start: periodStart,
        period_end: periodEnd,
        amount_net: usageNetAmount,
        tax_amount: usageTaxAmount,
        amount_gross: usageGrossAmount,
        currency: "EUR",
        status: "approved",
        export_status: "open",
        description: `Nutzungsgebühren ${invoice.invoice_number} – ${billingPeriod} (${usageChargeIds.length} Vorgänge) [retry]`,
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
          via_retry: true,
        },
      } as any);
      if (fibuUsageErr && (fibuUsageErr as any).code !== "23505") {
        console.error(`[auto-invoice][retry] fibu_events invoice_usage_created:`, fibuUsageErr.message);
      }
    }
  } catch (fibuEx) {
    console.error(`[auto-invoice][retry] fibu_events block exception:`, String(fibuEx));
  }

  // Provisionen nachholen (Hold aufheben). Bestehende existing-Checks im Provisionspfad
  // halten Idempotenz aufrecht; doppelte Inserts werden verhindert.
  if (contract.sales_partner_id) {
    try {
      const isGoae = /GOÄ|GOA/i.test(contract.product_name || "");
      const today = new Date();
      // Multi-Standort: identische Carrier-Bedingung auch im Retry-Pfad
      let custBaseFee: string | null = null;
      if (contract.customer_id) {
        const { data: cust } = await supabase
          .from("customers").select("base_fee_contract_id")
          .eq("id", contract.customer_id).maybeSingle();
        custBaseFee = (cust as any)?.base_fee_contract_id ?? null;
      }
      const isCarrier = isCarrierContract(contract.id, contract.customer_id, custBaseFee);
      if (isGoae) {
        await createGoaeCommissions({
          supabase, contract, invoice, netAmount, baseNetAmount,
          usageChargeIds, periodMonthStr, periodStart, periodEnd, billingPeriod, today,
          isCarrier,
        });
      } else {
        const [{ data: productCommission }, { data: partnerOverride }] = await Promise.all([
          supabase.from("product_commissions").select("commission_type, commission_value, is_active")
            .eq("product_name", contract.product_name).eq("is_active", true).maybeSingle(),
          supabase.from("partner_commission_overrides").select("commission_type, commission_value")
            .eq("user_id", contract.sales_partner_id).eq("product_name", contract.product_name).maybeSingle(),
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
              .from("commission_payouts").select("id").eq("invoice_id", invoice.id).maybeSingle();
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
            }
          }
        }
      }
    } catch (commEx) {
      console.error(`[auto-invoice][retry] Provisions-Block exception:`, String(commEx));
    }
  }

  // B3: Erfolgs-Mail an Buchhaltung (kurz, kein Vertriebs-CC, keine zweite Kunden-Mail).
  try {
    await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [BUCHHALTUNG_EMAIL],
      subject: `Stripe-Retry erfolgreich – Rechnung ${invoice.invoice_number}`,
      html: `<p>Der automatische Retry der Stripe-Abbuchung war erfolgreich.</p>
<ul>
  <li><strong>Rechnung:</strong> ${invoice.invoice_number}</li>
  <li><strong>Kunde:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</li>
  <li><strong>Bruttobetrag:</strong> ${grossAmount.toFixed(2)} €</li>
  <li><strong>Stripe-Invoice:</strong> ${stripeInvoiceId}</li>
</ul>
<p>Neuer Status: <strong>bezahlt</strong>.</p>`,
    });
  } catch (mailEx) {
    console.error(`[auto-invoice][retry] Erfolgs-Mail (Buchhaltung) fehlgeschlagen:`, String(mailEx));
  }

  return "success";
}
