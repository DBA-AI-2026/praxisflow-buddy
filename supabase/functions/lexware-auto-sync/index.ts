import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

interface IntegrationSettings {
  id: string;
  user_id: string;
  api_key_encrypted: string;
  is_connected: boolean;
  auto_sync_enabled: boolean;
  sync_interval: string;
  sync_time: string | null;
  last_sync_at: string | null;
}

interface RevenueRecord {
  id: string;
  user_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  customer_name: string;
  customer_number: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
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
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get current hour (UTC)
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentDate = now.getUTCDate();

    console.log(`Auto-sync check at ${now.toISOString()}, hour: ${currentHour}`);

    // Find all users with auto-sync enabled for Lexware
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("integration_type", "lexware")
      .eq("is_connected", true)
      .eq("auto_sync_enabled", true);

    if (settingsError) {
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    if (!settings || settings.length === 0) {
      console.log("No users with auto-sync enabled");
      return new Response(
        JSON.stringify({ message: "No auto-sync users found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    const results: Array<{ userId: string; status: string; message: string }> = [];

    for (const setting of settings as IntegrationSettings[]) {
      try {
        // Parse sync time (format: "HH:MM"), default to 14:00 if not set
        const syncTime = setting.sync_time || "14:00";
        const [syncHour] = syncTime.split(":").map(Number);
        
        // Check if it's the right time to sync
        if (currentHour !== syncHour) {
          continue;
        }

        // Check sync interval
        const shouldSync = checkSyncInterval(setting.sync_interval, setting.last_sync_at, currentDay, currentDate);
        
        if (!shouldSync) {
          continue;
        }

        console.log(`Processing auto-sync for user: ${setting.user_id}`);

        // Fetch unexported revenues for this user
        const { data: revenues, error: revenuesError } = await supabase
          .from("customer_revenues")
          .select("*")
          .eq("user_id", setting.user_id)
          .eq("exported_to_lexware", false);

        if (revenuesError) {
          throw new Error(`Failed to fetch revenues: ${revenuesError.message}`);
        }

        if (!revenues || revenues.length === 0) {
          // Log that there's nothing to export
          await logSync(supabase, setting.user_id, "auto", "success", 0, "Keine neuen Umsätze zum Exportieren");
          
          // Update last sync time
          await supabase
            .from("integration_settings")
            .update({ last_sync_at: now.toISOString() })
            .eq("id", setting.id);

          results.push({ userId: setting.user_id, status: "success", message: "No revenues to export" });
          continue;
        }

        // Convert to Lexware format
        const vouchers = convertToLexwareFormat(revenues as RevenueRecord[]);

        // Send to Lexware API
        const exportedIds = await sendToLexware(setting.api_key_encrypted, vouchers, revenues as RevenueRecord[]);

        // Mark revenues as exported
        if (exportedIds.length > 0) {
          await supabase
            .from("customer_revenues")
            .update({
              exported_to_lexware: true,
              lexware_export_date: now.toISOString(),
            })
            .in("id", exportedIds);
        }

        // Log success
        await logSync(
          supabase,
          setting.user_id,
          "auto",
          "success",
          exportedIds.length,
          `${exportedIds.length} Belege erfolgreich exportiert`
        );

        // Update last sync time
        await supabase
          .from("integration_settings")
          .update({ last_sync_at: now.toISOString() })
          .eq("id", setting.id);

        processedCount++;
        results.push({ userId: setting.user_id, status: "success", message: `Exported ${exportedIds.length} records` });

      } catch (userError) {
        console.error(`Error processing user ${setting.user_id}:`, userError);
        
        // Log error
        await logSync(
          supabase,
          setting.user_id,
          "auto",
          "error",
          0,
          `Auto-Sync fehlgeschlagen: ${userError instanceof Error ? userError.message : "Unbekannter Fehler"}`,
          userError instanceof Error ? userError.stack : undefined
        );

        results.push({ 
          userId: setting.user_id, 
          status: "error", 
          message: userError instanceof Error ? userError.message : "Unknown error" 
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Auto-sync completed", 
        processed: processedCount,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Auto-sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function checkSyncInterval(
  interval: string, 
  lastSyncAt: string | null, 
  currentDay: number, 
  currentDate: number
): boolean {
  if (!lastSyncAt) {
    return true; // Never synced, should sync
  }

  const lastSync = new Date(lastSyncAt);
  const now = new Date();
  const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

  switch (interval) {
    case "daily":
      // Sync if more than 20 hours since last sync (to handle timezone differences)
      return hoursSinceLastSync >= 20;
    
    case "weekly":
      // Sync on Monday if more than 6 days since last sync
      return currentDay === 1 && hoursSinceLastSync >= 144; // 6 days in hours
    
    case "monthly":
      // Sync on the 1st of the month if more than 27 days since last sync
      return currentDate === 1 && hoursSinceLastSync >= 648; // 27 days in hours
    
    default:
      return hoursSinceLastSync >= 20;
  }
}

async function logSync(
  supabase: any,
  userId: string,
  syncType: string,
  status: string,
  recordsCount: number,
  message: string,
  errorDetails?: string
): Promise<void> {
  await supabase.from("integration_sync_logs").insert({
    user_id: userId,
    integration_type: "lexware",
    sync_type: syncType,
    status,
    records_count: recordsCount,
    message,
    error_details: errorDetails || null,
  });
}

function convertToLexwareFormat(revenues: RevenueRecord[]): LexwareVoucher[] {
  // Group revenues by invoice number
  const invoiceGroups = new Map<string, RevenueRecord[]>();
  
  for (const revenue of revenues) {
    const existing = invoiceGroups.get(revenue.invoice_number) || [];
    existing.push(revenue);
    invoiceGroups.set(revenue.invoice_number, existing);
  }

  const vouchers: LexwareVoucher[] = [];

  for (const [invoiceNumber, items] of invoiceGroups) {
    const firstItem = items[0];
    
    const totalNet = items.reduce((sum, item) => sum + Number(item.net_amount), 0);
    const totalTax = items.reduce((sum, item) => sum + Number(item.tax_amount), 0);
    const totalGross = items.reduce((sum, item) => sum + Number(item.gross_amount), 0);

    vouchers.push({
      voucherNumber: invoiceNumber,
      voucherDate: firstItem.invoice_date,
      dueDate: firstItem.due_date || firstItem.invoice_date,
      totalGrossAmount: totalGross,
      totalNetAmount: totalNet,
      taxAmount: totalTax,
      contactId: firstItem.customer_number || undefined,
      contactName: firstItem.customer_name,
      items: items.map(item => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        taxRatePercentage: Number(item.tax_rate),
      })),
    });
  }

  return vouchers;
}

async function sendToLexware(
  apiKey: string,
  vouchers: LexwareVoucher[],
  revenues: RevenueRecord[]
): Promise<string[]> {
  const LEXWARE_API_URL = "https://api.lexware.io/v1";
  const exportedIds: string[] = [];

  for (const voucher of vouchers) {
    try {
      const response = await fetch(`${LEXWARE_API_URL}/vouchers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(voucher),
      });

      if (response.ok) {
        // Find all revenue IDs for this invoice
        const invoiceRevenues = revenues.filter(r => r.invoice_number === voucher.voucherNumber);
        exportedIds.push(...invoiceRevenues.map(r => r.id));
      } else {
        const errorText = await response.text();
        console.error(`Lexware API error for ${voucher.voucherNumber}: ${errorText}`);
      }

      // Rate limiting: wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error sending voucher ${voucher.voucherNumber}:`, error);
    }
  }

  return exportedIds;
}
