import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find contract by confirmation token
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("customer_confirmation_token", token)
      .maybeSingle();

    if (contractError || !contract) {
      return new Response(
        JSON.stringify({ error: "Ungültiger oder abgelaufener Bestätigungslink." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already confirmed?
    if (contract.customer_confirmed_at) {
      return new Response(
        JSON.stringify({
          success: true,
          already_confirmed: true,
          customer_name: contract.customer_name,
          product_name: contract.product_name,
          hfx_customer_number: contract.hfx_customer_number,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();

    // 1. Activate the contract
    const { error: updateError } = await supabase
      .from("contracts")
      .update({
        status: "aktiv",
        customer_confirmed_at: now,
        approved_at: now,
      })
      .eq("id", contract.id);

    if (updateError) throw updateError;

    // 2. Create praxen entry if not already exists
    const { data: existingPraxis } = await supabase
      .from("praxen")
      .select("id")
      .eq("converted_from_lead_id", contract.customer_id ?? null)
      .maybeSingle();

    if (!existingPraxis) {
      // Try to find lead by hfx_customer_number
      let leadId: string | null = null;
      if (contract.hfx_customer_number) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("hfx_customer_number", contract.hfx_customer_number)
          .maybeSingle();
        if (lead) leadId = lead.id;
      }

      const praxisData: Record<string, unknown> = {
        name: contract.praxis || contract.customer_name,
        adresse: contract.adresse || null,
        plz: contract.plz || null,
        ort: contract.ort || null,
        telefon: contract.telefon || null,
        email: contract.email || null,
        mp_nr: contract.mp_nr || null,
        produkt: contract.product_name,
        status: "aktiv",
        buchungs_datum: contract.start_date,
        preis: contract.monthly_price,
      };

      if (leadId) {
        praxisData.converted_from_lead_id = leadId;
        // Update lead status to "kunde"
        await supabase
          .from("leads")
          .update({ status: "kunde" })
          .eq("id", leadId);
      }

      await supabase.from("praxen").insert(praxisData);
    }

    console.log(`[confirm-paper-contract] Contract ${contract.id} confirmed and activated.`);

    return new Response(
      JSON.stringify({
        success: true,
        already_confirmed: false,
        customer_name: contract.customer_name,
        product_name: contract.product_name,
        hfx_customer_number: contract.hfx_customer_number,
        praxis: contract.praxis,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[confirm-paper-contract] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
