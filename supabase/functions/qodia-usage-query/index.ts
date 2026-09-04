import { requireActiveRole } from "../_shared/auth.ts";
import { loadLeadCohort, syncLeadUsage } from "../_shared/leadUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const guard = await requireActiveRole(req, ["admin", "sales_lead"], corsHeaders);
    if (guard instanceof Response) return guard;
    const supabase = guard.admin;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, hfx_customer_number, source } = body as {
      startDate?: string;
      endDate?: string;
      hfx_customer_number?: string;
      source?: "contract" | "lead";
    };

    // ── source: "lead" ─────────────────────────────────────────────────────
    // Live-Abruf für die Testphasen-Kohorte. Fenster sind fest (12 Monate +
    // laufender Monat), startDate/endDate werden ignoriert. Ergebnis wird
    // serverseitig auf public.leads zurückgeschrieben – exakt dieselbe
    // Kohorten- und Delta-Logik wie der Cron (qodia-lead-usage-sync).
    if (source === "lead") {
      const qodiaApiKeyLead = Deno.env.get("QODIA_API_KEY");
      if (!qodiaApiKeyLead) {
        return new Response(JSON.stringify({ error: "API key not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { leads, excludedByContract } = await loadLeadCohort(
        supabase,
        hfx_customer_number ? { hfx_customer_number } : undefined,
      );
      const now = new Date();
      const results = [];
      for (const lead of leads) {
        results.push(await syncLeadUsage(supabase, qodiaApiKeyLead, lead, "[qodia-usage-query][lead]", now));
      }
      return new Response(JSON.stringify({ source: "lead", results, excluded_by_contract: excludedByContract }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active HFX GOÄ contracts with email
    let contractQuery = supabase
      .from("contracts")
      .select("id, customer_name, email, hfx_customer_number, product_name")
      .ilike("product_name", "HFX GOÄ%")
      .not("email", "is", null)
      .not("hfx_customer_number", "is", null);

    if (hfx_customer_number) {
      contractQuery = contractQuery.eq(
        "hfx_customer_number",
        hfx_customer_number
      );
    }

    const { data: contracts, error: contractsError } = await contractQuery;

    if (contractsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch contracts" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
    if (!qodiaApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate contracts by email (take first occurrence)
    const seen = new Set<string>();
    const uniqueContracts = contracts.filter((c) => {
      if (seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    });

    // Fetch usage for each customer in parallel
    const results = await Promise.all(
      uniqueContracts.map(async (contract) => {
        const requestBody: Record<string, string> = {
          email: contract.email,
        };
        if (startDate) requestBody.startDate = startDate;
        if (endDate) requestBody.endDate = endDate;

        try {
          const res = await fetch(
            "https://auth.qodia.de/api/external/usage",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": qodiaApiKey,
              },
              body: JSON.stringify(requestBody),
            }
          );

          const rawText = await res.text();
          console.log(`[qodia-usage-query] ${contract.hfx_customer_number} (${contract.email}) → HTTP ${res.status}: ${rawText}`);

          let data: Record<string, unknown> = {};
          try { data = JSON.parse(rawText); } catch { /* not JSON */ }

          if (!res.ok || !data.success) {
            // 403 = kein Account / kein externer Benutzer (laut API-Doku)
            const noAccount = res.status === 403 || res.status === 404;
            const errorMsg = (data.error as string) || (data.message as string) || `Fehler ${res.status}`;
            return {
              hfx_customer_number: contract.hfx_customer_number,
              customer_name: contract.customer_name,
              email: contract.email,
              error: noAccount && (errorMsg === "Access denied" || errorMsg === "User not found")
                ? "Kein Qodia-Account vorhanden"
                : errorMsg,
              usage: null,
            };
          }

          return {
            hfx_customer_number: contract.hfx_customer_number,
            customer_name: contract.customer_name,
            email: contract.email,
            error: null,
            usage: data.usage ?? {},
            startDate: data.startDate,
            endDate: data.endDate,
          };
        } catch (e) {
          return {
            hfx_customer_number: contract.hfx_customer_number,
            customer_name: contract.customer_name,
            email: contract.email,
            error: "Netzwerkfehler",
            usage: null,
          };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
