import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

interface SyncPriceRequest {
  mpNr: string;
  preis: number;
}

async function refreshAccessToken(supabase: SupabaseClient, refreshToken: string): Promise<string | null> {
  const SALESFORCE_CLIENT_ID = Deno.env.get("SALESFORCE_CLIENT_ID");
  const SALESFORCE_CLIENT_SECRET = Deno.env.get("SALESFORCE_CLIENT_SECRET");

  try {
    const tokenResponse = await fetch("https://carecapital--partial.sandbox.my.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: SALESFORCE_CLIENT_ID!,
        client_secret: SALESFORCE_CLIENT_SECRET!,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token refresh failed:", tokenData);
      return null;
    }

    // Update the stored tokens
    const { error } = await supabase
      .from("salesforce_connections")
      .update({
        access_token: tokenData.access_token,
        issued_at: new Date(parseInt(tokenData.issued_at)).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (error) {
      console.error("Failed to update token:", error);
    }

    return tokenData.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    // Verify the caller is authenticated
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only admins and sales_leads may trigger price sync
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "sales_lead"])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden: insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the Salesforce connection
    const { data: connection, error: connectionError } = await supabase
      .from("salesforce_connections")
      .select("access_token, refresh_token, instance_url, is_connected")
      .eq("id", "default")
      .single();

    if (connectionError || !connection) {
      console.error("No Salesforce connection found:", connectionError);
      return new Response(
        JSON.stringify({ error: "Salesforce nicht verbunden" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connection.is_connected || !connection.access_token) {
      return new Response(
        JSON.stringify({ error: "Salesforce-Verbindung nicht aktiv" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: SyncPriceRequest = await req.json();
    const { mpNr, preis } = body;

    if (!mpNr || typeof mpNr !== "string") {
      return new Response(
        JSON.stringify({ error: "MP-Nr ist erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize mpNr to prevent SOQL injection - only allow alphanumeric, hyphen, underscore
    const sanitizedMpNr = mpNr.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(sanitizedMpNr) || sanitizedMpNr.length > 50) {
      return new Response(
        JSON.stringify({ error: "Ungültiges MP-Nr Format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (preis === undefined || preis === null || typeof preis !== "number" || !isFinite(preis)) {
      return new Response(
        JSON.stringify({ error: "Preis ist erforderlich und muss eine gültige Zahl sein" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing price for MP-Nr: ${sanitizedMpNr}, Preis: ${preis}`);

    let accessToken = connection.access_token;
    const instanceUrl = connection.instance_url;

    // First, query Salesforce to find the record by MPID__c (input already sanitized)
    const soqlQuery = encodeURIComponent(`SELECT Id FROM Account WHERE MPID__c = '${sanitizedMpNr}'`);
    let queryResponse = await fetch(
      `${instanceUrl}/services/data/v59.0/query?q=${soqlQuery}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // If unauthorized, try to refresh the token
    if (queryResponse.status === 401) {
      console.log("Access token expired, refreshing...");
      const newToken = await refreshAccessToken(supabase, connection.refresh_token!);
      
      if (!newToken) {
        return new Response(
          JSON.stringify({ error: "Salesforce-Session abgelaufen. Bitte erneut verbinden." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = newToken;

      // Retry the query with new token
      queryResponse = await fetch(
        `${instanceUrl}/services/data/v59.0/query?q=${soqlQuery}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const queryResult = await queryResponse.json();

    if (!queryResponse.ok) {
      console.error("Salesforce query failed:", queryResult);
      return new Response(
        JSON.stringify({ error: "Salesforce-Abfrage fehlgeschlagen", details: queryResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!queryResult.records || queryResult.records.length === 0) {
      console.log(`No record found for MP-Nr: ${mpNr}`);
      return new Response(
        JSON.stringify({ error: `Keine Praxis mit MP-Nr ${mpNr} in Salesforce gefunden` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recordId = queryResult.records[0].Id;
    console.log(`Found Salesforce record: ${recordId}`);

    // Update the HFX_Preis_Monat__c field
    const updateResponse = await fetch(
      `${instanceUrl}/services/data/v59.0/sobjects/Account/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          HFX_Preis_Monat__c: preis,
        }),
      }
    );

    if (!updateResponse.ok) {
      const updateError = await updateResponse.json();
      console.error("Salesforce update failed:", updateError);
      return new Response(
        JSON.stringify({ error: "Preis-Update fehlgeschlagen", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Consume response body for successful PATCH (returns 204 No Content)
    await updateResponse.text();

    console.log(`Successfully updated HFX_Preis_Monat__c to ${preis} for record ${recordId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Preis erfolgreich nach Salesforce synchronisiert`,
        recordId,
        mpNr,
        preis
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
