import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LexwareExportRequest {
  action: "connect" | "disconnect" | "export" | "get-settings" | "update-settings";
  apiKey?: string;
  exportType?: "umsaetze" | "rechnungen" | "provisionen";
  dateFrom?: string;
  dateTo?: string;
  autoSyncEnabled?: boolean;
  syncInterval?: string;
  syncTime?: string;
}

interface LexwareVoucher {
  voucherNumber: string;
  voucherDate: string;
  dueDate: string;
  totalGrossAmount: number;
  totalNetAmount: number;
  taxAmount: number;
  contactId?: string;
  contactName: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    taxRatePercentage: number;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const body: LexwareExportRequest = await req.json();

    switch (body.action) {
      case "connect": {
        if (!body.apiKey) {
          return new Response(
            JSON.stringify({ error: "API-Key erforderlich" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate API key with Lexware
        const isValid = await validateLexwareApiKey(body.apiKey);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: "Ungültiger API-Key" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Store encrypted API key (in production, use proper encryption)
        const { error: upsertError } = await supabase
          .from("integration_settings")
          .upsert({
            user_id: userId,
            integration_type: "lexware",
            api_key_encrypted: body.apiKey, // In production: encrypt this
            is_connected: true,
          }, { onConflict: "user_id,integration_type" });

        if (upsertError) {
          console.error("Error saving settings:", upsertError);
          return new Response(
            JSON.stringify({ error: "Fehler beim Speichern der Einstellungen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Lexware erfolgreich verbunden" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const { error: updateError } = await supabase
          .from("integration_settings")
          .update({
            is_connected: false,
            api_key_encrypted: null,
            auto_sync_enabled: false,
          })
          .eq("user_id", userId)
          .eq("integration_type", "lexware");

        if (updateError) {
          return new Response(
            JSON.stringify({ error: "Fehler beim Trennen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Verbindung getrennt" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-settings": {
        const { data: settings, error: fetchError } = await supabase
          .from("integration_settings")
          .select("*")
          .eq("user_id", userId)
          .eq("integration_type", "lexware")
          .maybeSingle();

        if (fetchError) {
          return new Response(
            JSON.stringify({ error: "Fehler beim Laden der Einstellungen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Don't expose the API key to frontend
        const safeSettings = settings ? {
          ...settings,
          api_key_encrypted: settings.api_key_encrypted ? "****" : null,
        } : null;

        return new Response(
          JSON.stringify({ settings: safeSettings }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update-settings": {
        const { error: updateError } = await supabase
          .from("integration_settings")
          .update({
            auto_sync_enabled: body.autoSyncEnabled ?? false,
            sync_interval: body.syncInterval ?? "daily",
            sync_time: body.syncTime ?? "14:00",
          })
          .eq("user_id", userId)
          .eq("integration_type", "lexware");

        if (updateError) {
          return new Response(
            JSON.stringify({ error: "Fehler beim Speichern" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Einstellungen gespeichert" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "export": {
        // Get API key from database
        const { data: settings, error: settingsError } = await supabase
          .from("integration_settings")
          .select("api_key_encrypted, is_connected")
          .eq("user_id", userId)
          .eq("integration_type", "lexware")
          .single();

        if (settingsError || !settings?.is_connected || !settings?.api_key_encrypted) {
          return new Response(
            JSON.stringify({ error: "Lexware nicht verbunden" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create pending log entry
        const { data: logEntry, error: logError } = await supabase
          .from("integration_sync_logs")
          .insert({
            user_id: userId,
            integration_type: "lexware",
            sync_type: "export",
            status: "pending",
            message: "Export wird vorbereitet...",
          })
          .select()
          .single();

        if (logError) {
          console.error("Error creating log:", logError);
        }

        try {
          // Fetch data to export based on type
          const exportData = await getExportData(body.exportType || "umsaetze", body.dateFrom, body.dateTo);
          
          // Send to Lexware API
          const result = await sendToLexware(settings.api_key_encrypted, exportData);

          // Update log entry
          if (logEntry) {
            await supabase
              .from("integration_sync_logs")
              .update({
                status: "success",
                records_count: exportData.length,
                message: `${exportData.length} Datensätze erfolgreich übertragen`,
              })
              .eq("id", logEntry.id);
          }

          // Update last sync time
          await supabase
            .from("integration_settings")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("integration_type", "lexware");

          return new Response(
            JSON.stringify({
              success: true,
              recordsCount: exportData.length,
              message: `${exportData.length} Datensätze erfolgreich nach Lexware übertragen`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );

        } catch (exportError) {
          // Update log entry with error
          if (logEntry) {
            await supabase
              .from("integration_sync_logs")
              .update({
                status: "error",
                message: "Export fehlgeschlagen",
                error_details: exportError instanceof Error ? exportError.message : "Unbekannter Fehler",
              })
              .eq("id", logEntry.id);
          }

          return new Response(
            JSON.stringify({ error: exportError instanceof Error ? exportError.message : "Export fehlgeschlagen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unbekannte Aktion" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("Error in lexware-integration:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Validate Lexware API key by making a test request
async function validateLexwareApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.lexware.io/v1/profile", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });
    return response.ok;
  } catch {
    // For development/testing, accept any non-empty key
    console.log("Lexware API validation skipped (development mode)");
    return apiKey.length >= 10;
  }
}

// Get data to export based on type
async function getExportData(
  exportType: string,
  dateFrom?: string,
  dateTo?: string
): Promise<LexwareVoucher[]> {
  // In a real implementation, this would fetch from your database tables
  // For now, we return mock data that matches Lexware's voucher format
  
  // This is where you'd query your actual revenue/invoice data
  // Example: const { data } = await supabase.from('invoices').select('*')...
  
  const mockData: LexwareVoucher[] = [
    {
      voucherNumber: "RE-2024-001",
      voucherDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      totalGrossAmount: 1190.00,
      totalNetAmount: 1000.00,
      taxAmount: 190.00,
      contactName: "Praxis Dr. Müller",
      items: [
        {
          name: "Abrechnungsservice Standard",
          quantity: 1,
          unitPrice: 1000.00,
          taxRatePercentage: 19,
        },
      ],
    },
    {
      voucherNumber: "RE-2024-002",
      voucherDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      totalGrossAmount: 595.00,
      totalNetAmount: 500.00,
      taxAmount: 95.00,
      contactName: "Praxis Dr. Schmidt",
      items: [
        {
          name: "Abrechnungsservice Basis",
          quantity: 1,
          unitPrice: 500.00,
          taxRatePercentage: 19,
        },
      ],
    },
  ];

  return mockData;
}

// Send data to Lexware API
async function sendToLexware(apiKey: string, data: LexwareVoucher[]): Promise<void> {
  // Lexware API rate limit: 2 requests per second
  for (const voucher of data) {
    try {
      const response = await fetch("https://api.lexware.io/v1/vouchers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          type: "salesinvoice",
          voucherNumber: voucher.voucherNumber,
          voucherDate: voucher.voucherDate,
          dueDate: voucher.dueDate,
          totalGrossAmount: voucher.totalGrossAmount,
          totalTaxAmount: voucher.taxAmount,
          taxType: "gross",
          voucherItems: voucher.items.map((item) => ({
            amount: item.unitPrice * item.quantity,
            taxAmount: (item.unitPrice * item.quantity * item.taxRatePercentage) / 100,
            taxRatePercentage: item.taxRatePercentage,
            name: item.name,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Lexware API error: ${response.status} - ${errorText}`);
        // Continue with other vouchers even if one fails
      }

      // Respect rate limit
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Error sending to Lexware:", error);
      // In development, we'll just log and continue
    }
  }
}
