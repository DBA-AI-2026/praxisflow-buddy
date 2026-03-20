import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

// Products that are available for the digital booking flow
const VALID_PRODUCTS = [
  "HFX GOÄ - die KI für ihre Privatabrechnung",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Validate API key
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("QODIA_API_KEY");
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized – invalid or missing API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { hfx_customer_number, product_name } = body;

    // 2. Validate required fields
    if (!hfx_customer_number || !product_name) {
      return new Response(
        JSON.stringify({ error: "hfx_customer_number and product_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validate product is in our known list
    if (!VALID_PRODUCTS.includes(product_name)) {
      return new Response(
        JSON.stringify({
          error: `No Stripe price configured for product "${product_name}". Valid products: ${VALID_PRODUCTS.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Find lead by hfx_customer_number
    const { data: lead, error: leadError } = await adminClient
      .from("leads")
      .select("*")
      .eq("hfx_customer_number", hfx_customer_number)
      .maybeSingle();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: `Lead with HFX number "${hfx_customer_number}" not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[qodia-initiate-booking] Found lead ${lead.id} for ${hfx_customer_number}`);

    // 5. Check for already active contract for this product
    const { data: activeContract } = await adminClient
      .from("contracts")
      .select("id, status")
      .eq("hfx_customer_number", hfx_customer_number)
      .eq("product_name", product_name)
      .eq("status", "aktiv")
      .maybeSingle();

    if (activeContract) {
      return new Response(
        JSON.stringify({
          error: `An active contract for product "${product_name}" already exists for this customer`,
          contract_id: activeContract.id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Check for an existing open (eingegangen) contract to reuse
    const { data: openContract } = await adminClient
      .from("contracts")
      .select("id")
      .eq("hfx_customer_number", hfx_customer_number)
      .eq("product_name", product_name)
      .eq("status", "eingegangen")
      .maybeSingle();

    let contractId: string;

    if (openContract) {
      contractId = openContract.id;
      console.log(`[qodia-initiate-booking] Reusing existing contract ${contractId}`);
    } else {
      // 7. Create a new contract from lead data
      // Look up the product price
      const { data: product } = await adminClient
        .from("products")
        .select("monthly_price, one_time_fee")
        .eq("name", product_name)
        .maybeSingle();

      const today = new Date().toISOString().split("T")[0];
      const customerName = [lead.vorname, lead.nachname].filter(Boolean).join(" ") || lead.praxis_name;

      const { data: newContract, error: insertError } = await adminClient
        .from("contracts")
        .insert({
          status: "eingegangen",
          product_name,
          customer_name: customerName,
          vorname: lead.vorname,
          nachname: lead.nachname,
          email: lead.email,
          telefon: lead.mobilnummer || null,
          adresse: lead.adresse || null,
          plz: lead.plz || null,
          ort: lead.ort || null,
          praxis: lead.praxis_name,
          mp_nr: lead.mp_nummer || null,
          hfx_customer_number: lead.hfx_customer_number,
          monthly_price: product?.monthly_price ?? 0,
          one_time_fee: product?.one_time_fee ?? 0,
          start_date: today,
          end_date: "2099-12-31",
          duration_months: 0,
          payment_interval: "monatlich",
        })
        .select("id")
        .single();

      if (insertError || !newContract) {
        throw new Error(`Failed to create contract: ${insertError?.message}`);
      }

      contractId = newContract.id;
      console.log(`[qodia-initiate-booking] Created new contract ${contractId}`);
    }

    // 8. Trigger booking email via send-contract-confirmation (internal fetch with service role key)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fnUrl = `${supabaseUrl}/functions/v1/send-contract-confirmation`;

    const emailRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ contract_id: contractId }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error(`[qodia-initiate-booking] Email function returned ${emailRes.status}: ${errBody}`);
      // Non-fatal: contract was created, but email failed. Return partial success with warning.
      return new Response(
        JSON.stringify({
          success: true,
          contract_id: contractId,
          warning: "Contract created but confirmation email could not be sent. Please resend manually.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[qodia-initiate-booking] Booking email sent for contract ${contractId}`);

    // 9. Return success
    return new Response(
      JSON.stringify({ success: true, contract_id: contractId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[qodia-initiate-booking] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
