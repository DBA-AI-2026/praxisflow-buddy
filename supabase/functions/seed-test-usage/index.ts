// seed-test-usage – Admin-only helper to create simulated GOÄ usage for TEST contracts only.
// Hard-guarded: only contracts whose customer_name contains "Test" are accepted.
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const userEmail = (claimsData.claims.email as string) || "unknown";

  const admin = createClient(supabaseUrl, serviceKey);

  // Role check
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const contractId: string | undefined = body?.contract_id;
    const quantity: number = Number(body?.quantity ?? 20);
    if (!contractId) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return new Response(JSON.stringify({ error: "quantity must be between 1 and 10000" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: cErr } = await admin
      .from("contracts")
      .select("id, customer_name, hfx_customer_number, qodia_unit_price, status")
      .eq("id", contractId).maybeSingle();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HARD GUARD: only TEST contracts
    if (!/test/i.test(contract.customer_name || "")) {
      return new Response(JSON.stringify({
        error: "seed-test-usage is only allowed for test contracts (customer_name must contain 'Test')",
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (contract.status !== "aktiv") {
      return new Response(JSON.stringify({ error: "Contract must be aktiv" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const unitPrice = Number(contract.qodia_unit_price) || 0;
    if (unitPrice <= 0) {
      return new Response(JSON.stringify({ error: "Contract has no qodia_unit_price > 0" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!contract.hfx_customer_number) {
      return new Response(JSON.stringify({ error: "Contract has no hfx_customer_number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const periodTo = today.toISOString().slice(0, 10);
    const periodFromDate = new Date(today); periodFromDate.setDate(periodFromDate.getDate() - 14);
    const periodFrom = periodFromDate.toISOString().slice(0, 10);

    const netAmount = Math.round(quantity * unitPrice * 100) / 100;
    const nowIso = new Date().toISOString();

    const { data: inserted, error: insErr } = await admin
      .from("usage_charges")
      .insert({
        hfx_customer_number: contract.hfx_customer_number,
        contract_id: contract.id,
        period_from: periodFrom,
        period_to: periodTo,
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        unit_description: `TEST – Simulierte GOÄ-Rechnungen (${contract.customer_name})`,
        status: "pending",
        source: "manual-test",
        notes: `Test-Lauf erstellt am ${nowIso} von ${userEmail}`,
      })
      .select("id")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("audit_logs").insert({
      user_id: userId,
      user_email: userEmail,
      user_role: "admin",
      action: "TEST_USAGE_SEEDED",
      resource_path: `contracts/${contract.id}`,
      success: true,
      details: JSON.stringify({
        contract_id: contract.id,
        hfx_customer_number: contract.hfx_customer_number,
        quantity, unit_price: unitPrice, net_amount: netAmount,
        usage_charge_id: inserted.id,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      usage_charge_id: inserted.id,
      quantity,
      unit_price: unitPrice,
      net_amount: netAmount,
      period_from: periodFrom,
      period_to: periodTo,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[seed-test-usage] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
