/**
 * backfill-sepa-iban — Einmalige/manuelle Befüllung von contracts.iban_masked
 * und contracts.kontoinhaber für Verträge, deren SEPA-Mandat schon vor der
 * Webhook-Erweiterung (D-vor) bei Stripe lag.
 *
 * Sicherheits-Schalter:
 *   - Default: dryRun=true (zeigt nur, was geschrieben würde).
 *   - Echte Schreibung verlangt {"dryRun": false, "confirm": "yes-i-mean-it"}.
 *   - HFX-I01070-Cluster (Peter Test) wird hartcodiert ausgeschlossen.
 *
 * Ambiguitäts-Regel:
 *   0 PMs            → SKIP (kein Mandat)
 *   1 PM             → nimm sie
 *   >1 PM mit default → nimm den default
 *   >1 PM ohne default → AMBIG (gemeldet, NICHT geschrieben)
 *
 * Idempotenz: schreibt nur in Spalten, die aktuell NULL sind.
 *
 * Aufruf NUR manuell, NICHT cron-gesteuert.
 */
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatStripeMaskedIban } from "../_shared/formatStripeMaskedIban.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[backfill-sepa-iban] ${step}${details ? " – " + JSON.stringify(details) : ""}`);

type CustomerReport = {
  stripe_customer_id: string;
  contracts: Array<{ id: string; hfx_customer_number: string | null }>;
  action: "WOULD_WRITE" | "WRITTEN" | "SKIP_NO_MANDATE" | "SKIP_AMBIGUOUS" | "ERROR";
  iban_masked?: string | null;
  kontoinhaber?: string | null;
  pm_count?: number;
  default_pm_id?: string | null;
  error?: string;
  touched_iban_masked?: number;
  touched_kontoinhaber?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { dryRun?: boolean; confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body → defaults
  }
  const dryRun = body.dryRun !== false; // default true
  const confirmOk = body.confirm === "yes-i-mean-it";

  if (!dryRun && !confirmOk) {
    return new Response(
      JSON.stringify({
        error: "Echter Lauf verlangt {\"dryRun\": false, \"confirm\": \"yes-i-mean-it\"}.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_V2") || "";
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY_V2 missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  log("Start", { dryRun });

  // 1) Verträge mit stripe_customer_id, ohne iban_masked, nicht im Test-Cluster
  const { data: candidates, error: candErr } = await supabase
    .from("contracts")
    .select("id, hfx_customer_number, stripe_customer_id, iban_masked, kontoinhaber")
    .not("stripe_customer_id", "is", null)
    .is("iban_masked", null)
    .not("hfx_customer_number", "like", "HFX-I01070%");

  if (candErr) {
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Gruppieren nach stripe_customer_id
  const byCustomer = new Map<string, typeof candidates>();
  for (const row of candidates ?? []) {
    const cid = row.stripe_customer_id as string;
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid)!.push(row);
  }

  const reports: CustomerReport[] = [];

  for (const [stripeCustomerId, rows] of byCustomer) {
    const report: CustomerReport = {
      stripe_customer_id: stripeCustomerId,
      contracts: rows!.map((r: any) => ({
        id: r.id,
        hfx_customer_number: r.hfx_customer_number,
      })),
      action: "SKIP_NO_MANDATE",
    };

    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
      const defaultPmId =
        (customer.invoice_settings?.default_payment_method as string | null) ?? null;

      const pms = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: "sepa_debit",
      });

      report.pm_count = pms.data.length;
      report.default_pm_id = defaultPmId;

      let pm: Stripe.PaymentMethod | null = null;
      if (pms.data.length === 0) {
        report.action = "SKIP_NO_MANDATE";
      } else if (pms.data.length === 1) {
        pm = pms.data[0];
      } else if (defaultPmId) {
        pm = pms.data.find((p) => p.id === defaultPmId) ?? null;
        if (!pm) {
          report.action = "SKIP_AMBIGUOUS";
          report.error = `default_payment_method ${defaultPmId} not in sepa_debit PMs`;
        }
      } else {
        report.action = "SKIP_AMBIGUOUS";
        report.error = `${pms.data.length} SEPA-PMs ohne default_payment_method`;
      }

      if (pm && pm.sepa_debit) {
        const ibanMasked = formatStripeMaskedIban({
          country: pm.sepa_debit.country,
          last4: pm.sepa_debit.last4,
        });
        const accountHolder = pm.billing_details?.name?.trim() || null;

        report.iban_masked = ibanMasked;
        report.kontoinhaber = accountHolder;

        if (!ibanMasked) {
          report.action = "ERROR";
          report.error = "Stripe-PM ohne country/last4";
        } else if (dryRun) {
          report.action = "WOULD_WRITE";
        } else {
          // echter Lauf
          const { data: maskUpdated, error: maskErr } = await supabase
            .from("contracts")
            .update({ iban_masked: ibanMasked } as any)
            .eq("stripe_customer_id", stripeCustomerId)
            .is("iban_masked", null)
            .not("hfx_customer_number", "like", "HFX-I01070%")
            .select("id");
          if (maskErr) throw maskErr;
          report.touched_iban_masked = (maskUpdated ?? []).length;

          if (accountHolder) {
            const { data: khUpdated, error: khErr } = await supabase
              .from("contracts")
              .update({ kontoinhaber: accountHolder } as any)
              .eq("stripe_customer_id", stripeCustomerId)
              .is("kontoinhaber", null)
              .not("hfx_customer_number", "like", "HFX-I01070%")
              .select("id");
            if (khErr) throw khErr;
            report.touched_kontoinhaber = (khUpdated ?? []).length;
          } else {
            report.touched_kontoinhaber = 0;
          }
          report.action = "WRITTEN";
        }
      }
    } catch (err) {
      report.action = "ERROR";
      report.error = String(err);
    }

    reports.push(report);
  }

  const stats = {
    dryRun,
    customers: reports.length,
    contracts_in_scope: candidates?.length ?? 0,
    would_write: reports.filter((r) => r.action === "WOULD_WRITE").length,
    written: reports.filter((r) => r.action === "WRITTEN").length,
    skip_no_mandate: reports.filter((r) => r.action === "SKIP_NO_MANDATE").length,
    skip_ambiguous: reports.filter((r) => r.action === "SKIP_AMBIGUOUS").length,
    errors: reports.filter((r) => r.action === "ERROR").length,
  };

  log("Done", stats);

  return new Response(JSON.stringify({ stats, reports }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
