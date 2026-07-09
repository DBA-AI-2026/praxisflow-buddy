// commission-forecast
// Read-only Forecast der "Entsteht zur nächsten Rechnung"-Provision je aktivem
// GOÄ-Vertrag mit AD-Vertriebler. KEINE Schreiboperation.
//
// Formel geteilt via _shared/freeQuota.ts (VERBATIM aus auto-invoice) und
// _shared/multiLocation.ts (isCarrierContract, isGoaeProduct). Wenn sich der
// Motor in auto-invoice/index.ts ändert, MUSS die Änderung in den geteilten
// Bausteinen erfolgen — nicht hier duplizieren.
//
// Rollen-Sichtbarkeit (Muster wie Vorschau-Tab in Provisionen.tsx):
//   - admin / sales_lead: alle Verträge
//   - sales_partner: nur eigene (sales_partner_id = uid)
//   - andere: 403
//
// Ausschluss: HFX-I01070% (Peter-Test-Cluster) und TEST-HARNESS%.

import { createClient } from "npm:@supabase/supabase-js@2";
import { computeEffectiveUsageNet } from "../_shared/freeQuota.ts";
import { isCarrierContract, isGoaeProduct } from "../_shared/multiLocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function addMonths(d: Date, m: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Rolle bestimmen (aktive Rollen)
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true);
  const roles = new Set((roleRows ?? []).map((r: any) => r.role));
  const isAdmin = roles.has("admin");
  const isSalesLead = roles.has("sales_lead");
  const isRegionalLead = roles.has("regional_lead");
  const isInternalUser = roles.has("user");
  const isSalesPartner = roles.has("sales_partner");
  const hasAccess = isAdmin || isSalesLead || isRegionalLead || isInternalUser || isSalesPartner;
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1) Kandidaten-Verträge: aktiv, sales_partner_id gesetzt, Testdaten ausgeschlossen.
    let q = supabase
      .from("contracts")
      .select("id, hfx_customer_number, customer_name, praxis, product_name, sales_partner_id, sales_partner_name, customer_id, start_date, status, tippgeber_id")
      .eq("status", "aktiv")
      .not("sales_partner_id", "is", null)
      .not("hfx_customer_number", "ilike", "HFX-I01070%")
      .not("hfx_customer_number", "ilike", "TEST-HARNESS%");

    // Sichtbarkeits-Matrix (serverseitig, NICHT auf Frontend vertrauen):
    //   admin / sales_lead → alle
    //   regional_lead      → eigene + Team + Tippgeber (eigene + Team)
    //   user               → eigene + eigene Tippgeber
    //   sales_partner      → nur eigene
    if (!isAdmin && !isSalesLead) {
      // Erlaubte Partner-IDs zusammensetzen
      const allowedPartners = new Set<string>([userId]);
      if (isRegionalLead) {
        const { data: teamRows } = await supabase
          .from("user_regional_assignments")
          .select("user_id")
          .eq("regional_lead_id", userId);
        for (const r of (teamRows ?? []) as any[]) {
          if (r.user_id) allowedPartners.add(r.user_id);
        }
      }
      // Tippgeber, die diesen Partnern zugeordnet sind
      const partnerArr = Array.from(allowedPartners);
      let allowedTippgeber: string[] = [];
      if (isRegionalLead || isInternalUser) {
        const { data: tRows } = await supabase
          .from("tippgeber_partner_assignments")
          .select("tippgeber_user_id")
          .in("partner_user_id", partnerArr)
          .eq("is_active", true);
        allowedTippgeber = (tRows ?? []).map((r: any) => r.tippgeber_user_id).filter(Boolean);
      }
      const partnerList = partnerArr.join(",");
      if (allowedTippgeber.length > 0) {
        q = q.or(`sales_partner_id.in.(${partnerList}),tippgeber_id.in.(${allowedTippgeber.join(",")})`);
      } else {
        q = q.in("sales_partner_id", partnerArr);
      }
    }

    const { data: candidates, error: cErr } = await q;
    if (cErr) throw cErr;

    const today = new Date();
    const goae = (candidates ?? []).filter((c: any) => isGoaeProduct(c.product_name));
    if (goae.length === 0) {
      return new Response(JSON.stringify({ contracts: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contractIds = goae.map((c: any) => c.id);
    const customerIds = Array.from(new Set(goae.map((c: any) => c.customer_id).filter(Boolean)));
    const partnerIds = Array.from(new Set(goae.map((c: any) => c.sales_partner_id).filter(Boolean)));

    // 2) Nur Verträge mit ≥1 Rechnung (Bestandskunden-Definition)
    const { data: invRows } = await supabase
      .from("invoices")
      .select("contract_id")
      .in("contract_id", contractIds);
    const hasInvoice = new Set((invRows ?? []).map((r: any) => r.contract_id));

    // 3) Trägerregel via customers.base_fee_contract_id
    const { data: customersRows } = customerIds.length
      ? await supabase.from("customers").select("id, base_fee_contract_id").in("id", customerIds)
      : { data: [] as any[] };
    const baseFeeByCustomer: Record<string, string | null> = {};
    for (const c of (customersRows ?? []) as any[]) baseFeeByCustomer[c.id] = c.base_fee_contract_id ?? null;

    // 4) Partner-Rollen (nur AD-Rollen sind hier relevant)
    const { data: partnerRoleRows } = partnerIds.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", partnerIds).eq("is_active", true)
      : { data: [] as any[] };
    const ROLE_PRIORITY = ["sales_lead", "regional_lead", "user", "sales_partner"] as const;
    const AD_ROLES = new Set(["user", "regional_lead", "sales_lead"]);
    const rolesByPartner: Record<string, string | null> = {};
    for (const pid of partnerIds as string[]) {
      const active = new Set(
        (partnerRoleRows ?? []).filter((r: any) => r.user_id === pid).map((r: any) => r.role),
      );
      rolesByPartner[pid] = ROLE_PRIORITY.find((r) => active.has(r)) ?? null;
    }

    // 5) Kohorte finalisieren
    const cohort = goae.filter((c: any) => {
      if (!hasInvoice.has(c.id)) return false;
      if (!isCarrierContract(c.id, c.customer_id, baseFeeByCustomer[c.customer_id ?? ""])) return false;
      if (!AD_ROLES.has(rolesByPartner[c.sales_partner_id] ?? "")) return false;
      if (!c.start_date) return false;
      const start = new Date(c.start_date);
      const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      return monthsElapsed <= 24;
    });

    // 6) Pro Vertrag: Effektiv-Netto aus ALLEN pending usage_charges + Grants − Vor-invoiced.
    const results: any[] = [];
    for (const c of cohort as any[]) {
      const hfx = c.hfx_customer_number as string | null;
      let pendingCharges: any[] = [];
      let grantsTotal = 0;
      let usageInvoicedPrior = 0;
      if (hfx) {
        const [{ data: pRows }, { data: gRows }, { data: prRows }] = await Promise.all([
          supabase
            .from("usage_charges")
            .select("id, quantity, unit_price, unit_description")
            .eq("hfx_customer_number", hfx)
            .eq("status", "pending")
            .is("invoice_id", null),
          supabase
            .from("free_quota_grants")
            .select("menge")
            .eq("hfx_customer_number", hfx),
          supabase
            .from("usage_charges")
            .select("quantity")
            .eq("hfx_customer_number", hfx)
            .eq("status", "invoiced"),
        ]);
        pendingCharges = pRows ?? [];
        grantsTotal = (gRows ?? []).reduce((s: number, g: any) => s + (Number(g.menge) || 0), 0);
        usageInvoicedPrior = (prRows ?? []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      }

      const eff = computeEffectiveUsageNet(pendingCharges, grantsTotal, usageInvoicedPrior, "Vorschau");
      const forecastAd = Math.round(eff.usageNetAmount * 10) / 100;

      const start = new Date(c.start_date);
      const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      const eligibleUntil = addMonths(start, 24).toISOString().slice(0, 10);

      results.push({
        contract_id: c.id,
        hfx_customer_number: c.hfx_customer_number,
        customer_name: c.customer_name || c.praxis || "",
        product_name: c.product_name,
        sales_partner_id: c.sales_partner_id,
        sales_partner_name: c.sales_partner_name,
        start_date: c.start_date,
        months_elapsed: monthsElapsed,
        eligible_until: eligibleUntil,
        pending_qty: eff.periodUsageQty,
        grants_saldo: eff.saldo,
        frei_qty: eff.freiQty,
        usage_net_effective: eff.usageNetAmount,
        forecast_ad_amount: forecastAd,
      });
    }

    return new Response(JSON.stringify({ contracts: results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[commission-forecast] error:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
