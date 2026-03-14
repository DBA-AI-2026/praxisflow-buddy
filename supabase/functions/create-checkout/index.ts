import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${d}`);
};

// Stripe Coupon ID for HFX GOÄ promo: 100% off for 18 months (covers until 31.12.2026)
// Applied automatically for contracts signed before 30.06.2026
const GOA_PROMO_COUPON_ID = "Z6xkvF0U";
const GOA_PROMO_PRICE_ID = "price_1T7z2Z6v0qHdbOipvyPDB9mB";
const GOA_PROMO_DEADLINE = new Date("2026-06-30T23:59:59Z");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  try {
    logStep("Function started");

    // Authenticate calling user (sales partner)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("Sales partner authenticated", { userId: user.id });

    const body = await req.json();
    const { customer_email, customer_name, contract_id, line_items, success_path, cancel_path } = body;

    if (!customer_email) throw new Error("customer_email is required");
    if (!line_items || line_items.length === 0) throw new Error("line_items is required");
    logStep("Request parsed", { customer_email, contract_id, itemCount: line_items.length });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or reference Stripe customer by email
    const customers = await stripe.customers.list({ email: customer_email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    } else {
      logStep("No existing Stripe customer, will create via checkout");
    }

    // Determine mode: if any item is recurring → subscription, else payment
    const hasRecurring = line_items.some((item: { recurring: boolean }) => item.recurring);
    const mode = hasRecurring ? "subscription" : "payment";
    logStep("Checkout mode", { mode });

    // Check if HFX GOÄ promo applies:
    // - Contract contains the GOÄ product
    // - Current date is on or before 30.06.2026
    const now = new Date();
    const isGoaProduct = line_items.some(
      (item: { price_id: string }) => item.price_id === GOA_PROMO_PRICE_ID
    );
    const isWithinPromoDeadline = now <= GOA_PROMO_DEADLINE;
    const applyPromoCoupon = isGoaProduct && isWithinPromoDeadline && mode === "subscription";

    if (applyPromoCoupon) {
      logStep("Applying HFX GOÄ promo coupon (100% off until 31.12.2026)", {
        couponId: GOA_PROMO_COUPON_ID,
      });
    }

    const origin = req.headers.get("origin") || "https://praxisflow-buddy.lovable.app";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : customer_email,
      client_reference_id: contract_id || undefined,
      line_items: line_items.map((item: { price_id: string; quantity?: number }) => ({
        price: item.price_id,
        quantity: item.quantity || 1,
      })),
      mode,
      success_url: `${origin}${success_path || "/vertrieb/vertraege?checkout=success"}`,
      cancel_url: `${origin}${cancel_path || "/vertrieb/vertraege?checkout=canceled"}`,
      metadata: {
        contract_id: contract_id || "",
        created_by: user.id,
        customer_name: customer_name || "",
        promo_applied: applyPromoCoupon ? "GOA_PROMO_2026" : "",
      },
      payment_method_types: ["card", "sepa_debit"],
    };

    // Apply promo coupon for GOÄ subscriptions within the deadline
    if (applyPromoCoupon) {
      sessionParams.discounts = [{ coupon: GOA_PROMO_COUPON_ID }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logStep("Checkout session created", {
      sessionId: session.id,
      url: session.url,
      promoCouponApplied: applyPromoCoupon,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        promo_applied: applyPromoCoupon,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
