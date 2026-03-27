import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  console.log(`[create-contract-subscription][${ts}] ${step}${details ? " – " + JSON.stringify(details) : ""}`);
};

/**
 * Check for an existing open Stripe Checkout Session for this contract.
 */
async function findExistingSession(
  stripe: Stripe,
  contractId: string
): Promise<{ url: string; sessionId: string } | null> {
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const existing = sessions.data.find(
      (s) =>
        s.metadata?.contract_id === contractId &&
        s.metadata?.source === "contract_activation" &&
        s.status === "open" &&
        s.url
    );
    if (existing) {
      log("Found existing open checkout session (idempotent)", {
        sessionId: existing.id,
        contractId,
      });
      return { url: existing.url!, sessionId: existing.id };
    }
  } catch (err) {
    log("Warning: existing session check failed", { error: String(err) });
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    log("Function invoked");

    // Authenticate calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");
    log("User authenticated", { userId: userData.user.id });

    const body = await req.json();
    const { contract_id, success_path, cancel_path } = body;
    if (!contract_id) throw new Error("contract_id is required");
    log("Request parsed", { contract_id });

    // Load contract with admin privileges
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: contract, error: contractErr } = await supabaseAdmin
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .maybeSingle();
    if (contractErr || !contract) throw new Error("Contract not found");
    log("Contract loaded", {
      contractId: contract.id,
      product: contract.product_name,
      modules: contract.modules,
      licenseCount: contract.license_count,
    });

    // Build line items from stripeProducts mapping
    const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
      "HFX EBM": { price_id: "price_1TERRU50U5wLsXk2vhiRszuy", recurring: true },
      "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1TERR350U5wLsXk2G6CMcuGV", recurring: true },
      "HFX GOÄ/GOZ Live-Check": { price_id: "price_1TERZH50U5wLsXk2FzJL0VSl", recurring: false },
    };

    const selectedProducts: string[] = contract.modules || (contract.product_name ? [contract.product_name] : []);
    const lineItems = selectedProducts
      .filter((p: string) => STRIPE_PRODUCT_MAP[p])
      .map((p: string) => ({
        price: STRIPE_PRODUCT_MAP[p].price_id,
        quantity: contract.license_count || 1,
      }));

    if (lineItems.length === 0) {
      log("No Stripe products mapped – skipping checkout", { selectedProducts });
      return new Response(JSON.stringify({ url: null, reason: "no_stripe_products" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    log("Line items built", { count: lineItems.length, items: lineItems });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
      apiVersion: "2025-08-27.basil",
    });
    log("Stripe client initialized");

    // ── Idempotency: check for existing open session ──
    const existing = await findExistingSession(stripe, contract_id);
    if (existing) {
      return new Response(JSON.stringify({ url: existing.url, session_id: existing.sessionId, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerEmail = contract.email || userData.user.email;

    // Find or reuse existing Stripe customer
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    let customerId: string | undefined = undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      log("Reusing existing Stripe customer", { customerId });
    } else {
      log("No existing Stripe customer found", { email: customerEmail });
    }

    const hasRecurring = selectedProducts.some((p: string) => STRIPE_PRODUCT_MAP[p]?.recurring);
    const mode = hasRecurring ? "subscription" : "payment";
    log("Checkout mode", { mode, hasRecurring });

    const origin = req.headers.get("origin") || "https://praxisflow-buddy.lovable.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : customerEmail,
      client_reference_id: contract_id,
      line_items: lineItems,
      mode,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      payment_method_types: ["card", "sepa_debit"],
      success_url: `${origin}${success_path || "/vertrieb/vertraege?checkout=success"}`,
      cancel_url: `${origin}${cancel_path || "/vertrieb/vertraege?checkout=canceled"}`,
      metadata: {
        source: "contract_activation",
        contract_id,
        customer_name: contract.customer_name || "",
        created_by: userData.user.id,
      },
      subscription_data: hasRecurring ? {
        metadata: { contract_id },
      } : undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min expiry
    });

    log("Checkout session created", { sessionId: session.id, mode, url: session.url });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id, reused: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg, stack: error instanceof Error ? error.stack : undefined });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
