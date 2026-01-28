import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PraxisData {
  id: string;
  mp_nr: string;
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

async function syncPraxisToSalesforce(
  praxis: PraxisData,
  accessToken: string,
  instanceUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Query Salesforce for the Account by MPID__c
    const soqlQuery = encodeURIComponent(`SELECT Id FROM Account WHERE MPID__c = '${praxis.mp_nr}'`);
    const queryResponse = await fetch(
      `${instanceUrl}/services/data/v59.0/query?q=${soqlQuery}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!queryResponse.ok) {
      return { success: false, error: `Query failed for ${praxis.mp_nr}` };
    }

    const queryResult = await queryResponse.json();

    if (!queryResult.records || queryResult.records.length === 0) {
      console.log(`No Salesforce record found for MP-Nr: ${praxis.mp_nr}`);
      return { success: false, error: `No record found for ${praxis.mp_nr}` };
    }

    const recordId = queryResult.records[0].Id;

    // Update HFX_Preis_Monat__c
    const updateResponse = await fetch(
      `${instanceUrl}/services/data/v59.0/sobjects/Account/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          HFX_Preis_Monat__c: praxis.preis,
        }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      return { success: false, error: JSON.stringify(error) };
    }

    await updateResponse.text();
    return { success: true };
  } catch (error) {
    console.error(`Error syncing ${praxis.mp_nr}:`, error);
    return { success: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting automatic Salesforce price sync...");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get Salesforce connection
    const { data: connection, error: connectionError } = await supabase
      .from("salesforce_connections")
      .select("access_token, refresh_token, instance_url, is_connected")
      .eq("id", "default")
      .single();

    if (connectionError || !connection) {
      console.error("No Salesforce connection found:", connectionError);
      return new Response(
        JSON.stringify({ error: "Salesforce nicht verbunden", synced: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connection.is_connected || !connection.access_token) {
      console.log("Salesforce connection not active");
      return new Response(
        JSON.stringify({ error: "Salesforce-Verbindung nicht aktiv", synced: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all praxen from the praxen table
    const { data: praxen, error: praxenError } = await supabase
      .from("praxen")
      .select("id, mp_nr, preis")
      .not("mp_nr", "is", null);

    if (praxenError) {
      console.error("Error fetching praxen:", praxenError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Laden der Praxen", synced: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!praxen || praxen.length === 0) {
      console.log("No praxen to sync");
      return new Response(
        JSON.stringify({ message: "Keine Praxen zum Synchronisieren", synced: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${praxen.length} praxen to sync`);

    let accessToken = connection.access_token;
    const instanceUrl = connection.instance_url;

    // Test token validity with first praxis
    const testQuery = encodeURIComponent(`SELECT Id FROM Account LIMIT 1`);
    const testResponse = await fetch(
      `${instanceUrl}/services/data/v59.0/query?q=${testQuery}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (testResponse.status === 401) {
      console.log("Access token expired, refreshing...");
      const newToken = await refreshAccessToken(supabase, connection.refresh_token!);
      if (!newToken) {
        return new Response(
          JSON.stringify({ error: "Salesforce-Session abgelaufen", synced: 0, failed: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      accessToken = newToken;
    }

    // Sync each praxis
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const praxis of praxen) {
      const result = await syncPraxisToSalesforce(
        praxis as PraxisData,
        accessToken!,
        instanceUrl!
      );

      if (result.success) {
        synced++;
        console.log(`Successfully synced ${praxis.mp_nr}`);
      } else {
        failed++;
        if (result.error) errors.push(result.error);
      }
    }

    // Log sync result
    await supabase.from("integration_sync_logs").insert({
      integration_type: "salesforce",
      sync_type: "auto",
      status: failed === 0 ? "success" : "partial",
      records_count: synced,
      message: `Synced ${synced}/${praxen.length} praxen`,
      error_details: errors.length > 0 ? errors.join("; ") : null,
      user_id: "00000000-0000-0000-0000-000000000000", // System user
    });

    console.log(`Sync complete: ${synced} synced, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        failed,
        total: praxen.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Auto-sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, synced: 0, failed: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
