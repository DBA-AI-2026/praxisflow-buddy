import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

const STRIPE_PRODUCT_MAP: Record<string, { price_id: string; recurring: boolean }> = {
  "HFX EBM": { price_id: "price_1T7z1h6v0qHdbOip4A7qocQC", recurring: true },
  "HFX GOÄ - die KI für ihre Privatabrechnung": { price_id: "price_1T7z2Z6v0qHdbOipvyPDB9mB", recurring: true },
  "HFX GOÄ/GOZ Live-Check": { price_id: "price_1T7z3X6v0qHdbOiplCCLqD2n", recurring: false },
};

const GOA_PROMO_COUPON_ID = "Z6xkvF0U";
const GOA_PROMO_PRICE_ID = "price_1T7z2Z6v0qHdbOipvyPDB9mB";
const GOA_PROMO_DEADLINE = new Date("2026-06-30T23:59:59Z");

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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { contract_id, fachrichtung, rechtsform, bsnr, lanr } = body;

    if (!contract_id || !fachrichtung || !rechtsform) {
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
      return new Response(JSON.stringify({ error: "Contract not found or not in correct state" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.email) {
      return new Response(JSON.stringify({ error: "Contract has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contract with form data
    await adminClient
      .from("contracts")
      .update({
        fachrichtung,
        rechtsform,
        bsnr: bsnr || null,
        lanr: lanr || null,
      } as any)
      .eq("id", contract_id);

    console.log(`[initiate-booking] Updated contract ${contract_id} with fachrichtung=${fachrichtung}, rechtsform=${rechtsform}`);

    // Create Stripe checkout session
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const productName = contract.product_name;
    const priceInfo = STRIPE_PRODUCT_MAP[productName];

    if (!priceInfo) {
      return new Response(JSON.stringify({ error: "No Stripe price configured for this product. Please contact support." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isGoaPromoEligible =
      priceInfo.price_id === GOA_PROMO_PRICE_ID &&
      priceInfo.recurring &&
      new Date() <= GOA_PROMO_DEADLINE;

    const sessionParams: any = {
      customer_email: contract.email,
      line_items: [{ price: priceInfo.price_id, quantity: 1 }],
      mode: priceInfo.recurring ? "subscription" : "payment",
      payment_method_types: ["card", "sepa_debit"],
      success_url: `${APP_URL}/vertrag-bestaetigen?status=success&contract_id=${contract.id}`,
      cancel_url: `${APP_URL}/buchen?contract_id=${contract.id}`,
      metadata: {
        source: "paper_contract_confirmation",
        contract_id: contract.id,
      },
      subscription_data: priceInfo.recurring
        ? { metadata: { contract_id: contract.id } }
        : undefined,
    };

    if (isGoaPromoEligible) {
      sessionParams.discounts = [{ coupon: GOA_PROMO_COUPON_ID }];
      console.log(`[initiate-booking] Applying GOÄ promo coupon ${GOA_PROMO_COUPON_ID}`);
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log(`[initiate-booking] Stripe session created: ${session.id}`);

    return new Response(
      JSON.stringify({ stripe_url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[initiate-booking] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
