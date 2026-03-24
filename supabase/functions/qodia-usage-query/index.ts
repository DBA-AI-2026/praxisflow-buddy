import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Role check: only admin and sales_lead
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("sales_lead")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, hfx_customer_number } = body as {
      startDate?: string;
      endDate?: string;
      hfx_customer_number?: string;
    };

    // Service role client for querying contracts
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch active HFX GOÄ contracts with email
    let contractQuery = serviceClient
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
            "https://api.qodia.de/api/external/usage",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": qodiaApiKey,
              },
              body: JSON.stringify(requestBody),
            }
          );

          const data = await res.json();

          if (!res.ok || !data.success) {
            const noAccount = res.status === 403 || res.status === 404;
            return {
              hfx_customer_number: contract.hfx_customer_number,
              customer_name: contract.customer_name,
              email: contract.email,
              error: noAccount
                ? "Kein Qodia-Account vorhanden"
                : data.error || `Fehler ${res.status}`,
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
