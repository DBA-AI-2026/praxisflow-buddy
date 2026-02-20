import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  // API-Key Authentifizierung
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("DEMO_IMPORT_API_KEY");

  if (!expectedKey) {
    console.error("DEMO_IMPORT_API_KEY not configured");
    return new Response(JSON.stringify({ error: "API key not configured on server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Unterstützt einzelnes Objekt oder Array
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "No data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rows = items.map((item: any) => ({
      hfx_customer_number: item.hfx_customer_number || item.hfx_kundennummer || null,
      company_name: item.company_name || item.firma || item.unternehmen || "Unbekannt",
      contact_name: item.contact_name || item.ansprechpartner || null,
      email: item.email || null,
      telefon: item.telefon || item.phone || null,
      product_name: item.product_name || item.produkt || null,
      notes: item.notes || item.notizen || null,
      status: item.status || "testphase",
      test_phase_end: item.test_phase_end || item.testende || null,
    }));

    const { data, error } = await supabase
      .from("demo_downloads")
      .upsert(rows, { onConflict: "hfx_customer_number", ignoreDuplicates: false })
      .select();

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, imported: data?.length || 0, records: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Parse error:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
