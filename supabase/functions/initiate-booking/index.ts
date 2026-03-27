import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[initiate-booking][${ts}] ${step}${d}`);
};

const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
  "HFX EBM": { price_id: "price_1TERRU50U5wLsXk2vhiRszuy", recurring: true },
  "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1TERR350U5wLsXk2G6CMcuGV", recurring: true },
  "HFX GOÄ/GOZ Live-Check": { price_id: "price_1TERZH50U5wLsXk2FzJL0VSl", recurring: false },
};

const GOA_PROMO_COUPON_ID = "Z6xkvF0U";
const GOA_PROMO_PRICE_ID = "price_1TERR350U5wLsXk2G6CMcuGV";
const GOA_PROMO_DEADLINE = new Date("2026-06-30T23:59:59Z");

/**
 * Check for an existing open Stripe Checkout Session for this contract.
 * Returns the session URL if one exists, otherwise null.
 */
async function findExistingSession(
  stripe: Stripe,
  contractId: string
): Promise<string | null> {
  try {
    // List recent checkout sessions and find one matching this contract
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const existing = sessions.data.find(
      (s) =>
        s.metadata?.contract_id === contractId &&
        s.metadata?.source === "contract_activation" &&
        s.status === "open" &&
        s.url
    );
    if (existing) {
      log("Found existing open checkout session", {
        sessionId: existing.id,
        contractId,
      });
      return existing.url!;
    }
  } catch (err) {
    log("Warning: could not check for existing sessions", {
      error: String(err),
    });
  }
  return null;
}

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

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_V2");
  if (!stripeKey) {
    log("ERROR: STRIPE_SECRET_KEY_V2 not configured");
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    log("Function invoked");

    const body = await req.json();
    const { contract_id, fachrichtung, rechtsform, bsnr, lanr, agb_accepted, agb_version, user_agent } = body;
    log("Request payload", { contract_id, fachrichtung, rechtsform, agb_accepted });

    if (!contract_id || !fachrichtung || !rechtsform) {
      log("Validation failed: missing required fields");
      return new Response(JSON.stringify({ error: "contract_id, fachrichtung and rechtsform are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load and validate contract
    const { data: contract, error: contractError } = await adminClient
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .eq("status", "eingegangen")
      .maybeSingle();

    if (contractError || !contract) {
      log("Contract not found or wrong status", { contract_id, error: contractError?.message });
      return new Response(JSON.stringify({ error: "Contract not found or not in correct state" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("Contract loaded", { contractId: contract.id, product: contract.product_name, email: contract.email });

    if (!contract.email) {
      log("Contract has no email");
      return new Response(JSON.stringify({ error: "Contract has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contract with form data
    const { error: updateErr } = await adminClient
      .from("contracts")
      .update({
        fachrichtung,
        rechtsform,
        bsnr: bsnr || null,
        lanr: lanr || null,
      } as any)
      .eq("id", contract_id);
    if (updateErr) {
      log("Warning: contract update failed", { error: updateErr.message });
    } else {
      log("Contract updated with form data");
    }

    // Record AGB acceptance
    if (agb_accepted) {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || req.headers.get("x-real-ip")
        || "unknown";

      const { error: agbErr } = await adminClient.from("agb_acceptances").insert({
        contract_id,
        agb_version: agb_version || "1.0",
        ip_address: clientIp,
        user_agent: user_agent || null,
        customer_email: contract.email,
        customer_name: contract.customer_name,
      });
      if (agbErr) {
        log("Warning: AGB acceptance insert failed", { error: agbErr.message });
      } else {
        log("AGB acceptance recorded");
      }
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    log("Stripe client initialized");

    // ── Idempotency: check for existing open session ──
    const existingUrl = await findExistingSession(stripe, contract_id);
    if (existingUrl) {
      log("Returning existing session (idempotent)", { contract_id });
      return new Response(
        JSON.stringify({ stripe_url: existingUrl, reused: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map product to Stripe price
    const productName = contract.product_name;
    const priceInfo = STRIPE_PRODUCT_MAP[productName];

    if (!priceInfo) {
      log("No Stripe price mapping found", { productName });
      return new Response(JSON.stringify({ error: "No Stripe price configured for this product. Please contact support." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("Price mapping resolved", { productName, priceId: priceInfo.price_id, recurring: priceInfo.recurring });

    const isGoaPromoEligible =
      priceInfo.price_id === GOA_PROMO_PRICE_ID &&
      priceInfo.recurring &&
      new Date() <= GOA_PROMO_DEADLINE;

    const mode = priceInfo.recurring ? "subscription" : "payment";
    log("Checkout mode determined", { mode, promoEligible: isGoaPromoEligible });

    // Build session params
    const sessionParams: any = {
      customer_email: contract.email,
      client_reference_id: contract_id,
      line_items: [{ price: priceInfo.price_id, quantity: 1 }],
      mode,
      payment_method_types: ["card", "sepa_debit"],
      success_url: `${APP_URL}/vertrag-bestaetigen?status=success&contract_id=${contract.id}`,
      cancel_url: `${APP_URL}/buchen?contract_id=${contract.id}`,
      metadata: {
        source: "contract_activation",
        contract_id: contract.id,
        customer_name: contract.customer_name || "",
      },
      subscription_data: priceInfo.recurring
        ? { metadata: { contract_id: contract.id } }
        : undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min expiry
    };

    if (isGoaPromoEligible) {
      sessionParams.discounts = [{ coupon: GOA_PROMO_COUPON_ID }];
      log("Applying GOÄ promo coupon", { couponId: GOA_PROMO_COUPON_ID });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    log("Stripe checkout session created", {
      sessionId: session.id,
      mode,
      promo: isGoaPromoEligible,
      expiresAt: sessionParams.expires_at,
    });

    return new Response(
      JSON.stringify({ stripe_url: session.url, session_id: session.id, reused: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg, stack: err instanceof Error ? err.stack : undefined });
    return new Response(
      JSON.stringify({ error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
