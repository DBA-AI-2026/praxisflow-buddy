// commission-testrun
// Admin-only isolated test harness for the (hardened) commission motor.
// Creates a throwaway fixture (contract + invoice), runs createGoaeCommissions
// against it, and produces a real commission_payouts row so the dashboard
// visibly reflects that the motor writes.
//
// Fixture-Marker: hfx_customer_number = 'TEST-HARNESS-<timestamp>' (unique per run).
// Cleanup verifies LIKE 'TEST-HARNESS%' before deleting.
//
// Mode:
//   - seed_and_run : create fixture, run motor, return { contract_id, hfx_customer_number, ... }
//   - cleanup      : delete commission_payouts → fibu_events → invoices → contracts
//                    (all scoped to a contract whose hfx_customer_number LIKE 'TEST-HARNESS%').

import { createClient } from "npm:@supabase/supabase-js@2";
import { createGoaeCommissions } from "../_shared/goaeCommissions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEST_MARKER_PREFIX = "TEST-HARNESS";
const TEST_PARTNER_NAME = "Digital-Eigen-Vertrieb";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "Unauthorized" });
  const userId = claimsData.claims.sub as string;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Admin role check
  const { data: roleRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { error: "Forbidden: admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const mode: string = body?.mode;

  try {
    if (mode === "seed_and_run") {
      // Resolve sales partner "Digital-Eigen-Vertrieb" (user role, active).
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("full_name", TEST_PARTNER_NAME)
        .maybeSingle();
      if (profErr || !profile) {
        return json(500, { error: `Test-Vertriebler '${TEST_PARTNER_NAME}' nicht gefunden` });
      }

      const now = new Date();
      const marker = `${TEST_MARKER_PREFIX}-${now.getTime()}`;
      const today = ymd(now);
      const endDate = ymd(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
      const periodMonthStr = today.slice(0, 7);
      const periodStart = `${periodMonthStr}-01`;
      const periodEnd = today;

      // 1. Fixture-Vertrag (Entwurf, GOÄ, ohne customer_id)
      const { data: contract, error: contractErr } = await supabase
        .from("contracts")
        .insert({
          hfx_customer_number: marker,
          customer_id: null,
          customer_name: "TEST HARNESS FIXTURE",
          praxis: "TEST-HARNESS Praxis",
          product_name: "HFX GOÄ",
          status: "entwurf",
          start_date: today,
          end_date: endDate,
          monthly_price: 0,
          sales_partner_id: profile.user_id,
          sales_partner_name: profile.full_name,
        } as any)
        .select()
        .single();
      if (contractErr || !contract) {
        return json(500, { error: `Contract-Insert fehlgeschlagen: ${contractErr?.message}` });
      }

      // 2. Fixture-Rechnung (draft, 0 €)
      const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .insert({
          contract_id: contract.id,
          customer_name: contract.customer_name,
          customer_number: contract.hfx_customer_number,
          invoice_date: today,
          due_date: today,
          billing_period_month: periodMonthStr,
          positions: [],
          net_amount: 0,
          tax_rate: 0,
          tax_amount: 0,
          gross_amount: 0,
          status: "entwurf",
          notes: `TEST-HARNESS Fixture (${marker})`,
        } as any)
        .select()
        .single();
      if (invoiceErr || !invoice) {
        // Rollback contract
        await supabase.from("contracts").delete().eq("id", contract.id);
        return json(500, { error: `Invoice-Insert fehlgeschlagen: ${invoiceErr?.message}` });
      }

      // 3. Motor aufrufen (isCarrier=true → AD-Signup-Bonus wird geschrieben)
      await createGoaeCommissions({
        supabase,
        contract,
        invoice,
        netAmount: 0,
        baseNetAmount: 0,
        usageChargeIds: [],
        usageNetAmountEffective: 0,
        periodMonthStr,
        periodStart,
        periodEnd,
        billingPeriod: periodMonthStr,
        today: now,
        isCarrier: true,
      });

      // Payout(s) zurücklesen
      const { data: payouts } = await supabase
        .from("commission_payouts")
        .select("id, commission_role, payout_trigger, commission_amount, commission_rule_version, status")
        .eq("contract_id", contract.id);

      return json(200, {
        ok: true,
        mode,
        contract_id: contract.id,
        invoice_id: invoice.id,
        hfx_customer_number: marker,
        sales_partner_name: profile.full_name,
        payouts: payouts ?? [],
      });
    }

    if (mode === "cleanup") {
      const sweepAll: boolean = body?.sweep_all === true;
      const hfx = String(body?.hfx_customer_number ?? "");
      const contractId = String(body?.contract_id ?? "");

      // Vertrag verifizieren — LIKE-Safety wird IMMER erzwungen.
      let contractQuery = supabase
        .from("contracts")
        .select("id, hfx_customer_number")
        .like("hfx_customer_number", `${TEST_MARKER_PREFIX}%`);

      if (!sweepAll) {
        if (!hfx.startsWith(TEST_MARKER_PREFIX)) {
          return json(400, { error: `Safety: hfx_customer_number muss mit '${TEST_MARKER_PREFIX}' beginnen` });
        }
        if (contractId) contractQuery = contractQuery.eq("id", contractId);
        else contractQuery = contractQuery.eq("hfx_customer_number", hfx);
      }

      const { data: contracts, error: cErr } = await contractQuery;
      if (cErr) return json(500, { error: `Contract-Lookup fehlgeschlagen: ${cErr.message}` });
      if (!contracts || contracts.length === 0) {
        if (sweepAll) {
          return json(200, {
            ok: true,
            mode,
            contracts_deleted: 0,
            payouts_deleted: 0,
            invoices_deleted: 0,
            fibu_events_deleted: 0,
            deleted: { commission_payouts: 0, fibu_events: 0, invoices: 0, contracts: 0 },
            contract_ids: [],
          });
        }
        return json(404, { error: "Keine passende TEST-HARNESS-Fixture gefunden" });
      }

      const ids = contracts.map((c: any) => c.id);
      const report: Record<string, number> = {};

      const { count: payoutsDel } = await supabase
        .from("commission_payouts")
        .delete({ count: "exact" })
        .in("contract_id", ids);
      report.commission_payouts = payoutsDel ?? 0;

      const { count: fibuDel } = await supabase
        .from("fibu_events")
        .delete({ count: "exact" })
        .in("contract_id", ids)
        .eq("source_module", "commission_payouts");
      report.fibu_events = fibuDel ?? 0;

      const { count: invDel } = await supabase
        .from("invoices")
        .delete({ count: "exact" })
        .in("contract_id", ids);
      report.invoices = invDel ?? 0;

      const { count: contractDel } = await supabase
        .from("contracts")
        .delete({ count: "exact" })
        .in("id", ids)
        .like("hfx_customer_number", `${TEST_MARKER_PREFIX}%`);
      report.contracts = contractDel ?? 0;

      return json(200, { ok: true, mode, deleted: report, contract_ids: ids });
    }

    return json(400, { error: "Unbekannter mode. Erwartet: 'seed_and_run' oder 'cleanup'." });
  } catch (ex) {
    console.error("[commission-testrun] exception:", ex);
    return json(500, { error: String(ex) });
  }
});
