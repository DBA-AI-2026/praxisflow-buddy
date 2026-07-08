// Extracted verbatim from supabase/functions/auto-invoice/index.ts (createGoaeCommissions).
// Motor-Logik unverändert; reine Verlagerung, damit commission-testrun den Motor importieren kann,
// ohne den Top-Level `Deno.serve` von auto-invoice/index.ts mitzustarten.
//
// KEINE Motorlogik ändern.

import { createClient } from "npm:@supabase/supabase-js@2";

export async function createGoaeCommissions(params: {
  supabase: ReturnType<typeof createClient>;
  contract: any;
  invoice: any;
  netAmount: number;
  baseNetAmount: number;
  usageChargeIds: string[];
  /** Effektiver Verbrauchs-Netto NACH Freikontingent-Abzug. Wenn nicht gesetzt, aus usage_charges rekonstruiert (Retry-Pfad). */
  usageNetAmountEffective?: number;
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

  // Net amount from usage charges: bevorzugt bereits berechneter Effektiv-Netto (nach Frei-Abzug),
  // sonst Fallback = rohe usage_charges.net_amount (Retry-Pfad ohne neu-Berechnung).
  let usageNetAmount = 0;
  if (typeof params.usageNetAmountEffective === "number") {
    usageNetAmount = params.usageNetAmountEffective;
  } else if (usageChargeIds.length > 0) {
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

  // Fetch active roles of the sales_partner_id and resolve by priority.
  // maybeSingle() vorher konnte bei mehreren Rollen-Zeilen still null liefern.
  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", contract.sales_partner_id)
    .eq("is_active", true);
  if (roleErr) {
    console.warn(`[auto-invoice] commission-skip: role lookup failed contract=${contract.id} sales_partner_id=${contract.sales_partner_id} error=${roleErr.message}`);
  }
  const ROLE_PRIORITY = ["sales_lead", "regional_lead", "user", "sales_partner"] as const;
  const activeRoles = new Set((roleRows ?? []).map((r: any) => r.role));
  const partnerRole = ROLE_PRIORITY.find((r) => activeRoles.has(r)) ?? null;

  const adRoles = ["user", "regional_lead", "sales_lead"];
  const isAdRole = adRoles.includes(partnerRole as string);
  const isSalesPartner = partnerRole === "sales_partner";

  if (!partnerRole || (!isAdRole && !isSalesPartner)) {
    console.warn(`[auto-invoice] commission-skip contract=${contract.id} invoice=${invoice.id} sales_partner_id=${contract.sales_partner_id} resolved_role=${partnerRole ?? "null"} reason=role_not_eligible`);
  }

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
          const { data: existingUsage } = await supabase
            .from("commission_payouts")
            .select("id")
            .eq("invoice_id", invoice.id)
            .eq("commission_role", "ad")
            .eq("payout_trigger", "usage_revenue")
            .maybeSingle();

          if (!existingUsage) {
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
          } else {
            console.log(`[auto-invoice] GOÄ AD usage payout already exists, skip invoice=${invoice.id}`);
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
