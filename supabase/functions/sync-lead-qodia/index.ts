import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify authenticated admin/sales_lead
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, hfx_customer_number, email, generated_password, qodia_synced")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (lead.qodia_synced) {
      return new Response(
        JSON.stringify({ success: true, already_synced: true, message: "Lead ist bereits bei Qodia registriert." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead.generated_password) {
      return new Response(
        JSON.stringify({ error: "Kein generiertes Passwort vorhanden. Bitte zuerst Zugangsdaten neu senden." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const QODIA_SIGNUP_URL = "https://auth.qodia.de/api/external/sign-up";
    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");

    console.log(`Attempting Qodia sync for lead ${lead.hfx_customer_number} (${lead.email})`);

    const qodiaResponse = await fetch(QODIA_SIGNUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(qodiaApiKey ? { "x-api-key": qodiaApiKey } : {}),
      },
      body: JSON.stringify({
        email: lead.email,
        password: lead.generated_password,
        name: lead.hfx_customer_number,
      }),
    });

    const responseBody = await qodiaResponse.text();
    console.log(`Qodia response (${qodiaResponse.status}):`, responseBody);

    if (qodiaResponse.ok) {
      await supabase.from("leads").update({ qodia_synced: true }).eq("id", lead.id);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Lead ${lead.hfx_customer_number} erfolgreich bei Qodia registriert.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Qodia-Fehler (${qodiaResponse.status}): ${responseBody}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("sync-lead-qodia error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
