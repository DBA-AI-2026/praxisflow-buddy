import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate via x-api-key header
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("QODIA_API_KEY");

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { hfx_customer_number, period_from, period_to, quantity, unit_description, notes } = body;

    // Validate required fields
    if (!hfx_customer_number || !period_from || !period_to || quantity == null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: hfx_customer_number, period_from, period_to, quantity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof quantity !== "number" || quantity < 0) {
      return new Response(
        JSON.stringify({ error: "quantity must be a non-negative number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up the active contract by hfx_customer_number to get the unit price
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, qodia_unit_price, status")
      .eq("hfx_customer_number", hfx_customer_number)
      .eq("status", "aktiv")
      .maybeSingle();

    if (contractError) {
      console.error("[receive-usage] Contract lookup error:", contractError);
      return new Response(
        JSON.stringify({ error: "Database error looking up contract" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contract) {
      console.warn(`[receive-usage] No active contract found for HFX-Nr: ${hfx_customer_number}`);
      return new Response(
        JSON.stringify({ error: `No active contract found for HFX-Nr: ${hfx_customer_number}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unitPrice = Number(contract.qodia_unit_price) || 0;
    const netAmount = Math.round(quantity * unitPrice * 100) / 100;

    // Insert usage charge record
    const { data: usageCharge, error: insertError } = await supabase
      .from("usage_charges")
      .insert({
        hfx_customer_number,
        contract_id: contract.id,
        period_from,
        period_to,
        unit_description: unit_description || "Abgerechnete Qodia-Vorgänge",
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        status: "pending",
        source: "qodia",
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[receive-usage] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[receive-usage] ✓ Created usage charge ${usageCharge.id} for ${hfx_customer_number}: ${quantity} × ${unitPrice} € = ${netAmount} €`);

    return new Response(
      JSON.stringify({
        success: true,
        id: usageCharge.id,
        hfx_customer_number,
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        period_from,
        period_to,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[receive-usage] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
