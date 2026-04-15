import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Auth failed");

    // Check admin role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin only");

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default: dry_run = true

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get all contracts with stripe_customer_id
    const { data: contracts } = await adminClient
      .from("contracts")
      .select("id, customer_name, hfx_customer_number, stripe_customer_id, status")
      .not("stripe_customer_id", "is", null);

    const results: Array<{
      hfx_customer_number: string;
      customer_name: string;
      stripe_customer_id: string;
      status: string;
      customer_exists: boolean;
      default_pm_before: string | null;
      sepa_methods_count: number;
      action: string;
      set_pm_id?: string;
      error?: string;
    }> = [];

    for (const contract of contracts || []) {
      const entry: typeof results[0] = {
        hfx_customer_number: contract.hfx_customer_number,
        customer_name: contract.customer_name,
        stripe_customer_id: contract.stripe_customer_id,
        status: contract.status,
        customer_exists: false,
        default_pm_before: null,
        sepa_methods_count: 0,
        action: "none",
      };

      try {
        // 1. Retrieve customer
        const customer = await stripe.customers.retrieve(contract.stripe_customer_id);
        if ((customer as any).deleted) {
          entry.action = "customer_deleted";
          results.push(entry);
          continue;
        }
        entry.customer_exists = true;
        entry.default_pm_before =
          (customer as Stripe.Customer).invoice_settings?.default_payment_method
            ? typeof (customer as Stripe.Customer).invoice_settings.default_payment_method === "string"
              ? (customer as Stripe.Customer).invoice_settings.default_payment_method as string
              : ((customer as Stripe.Customer).invoice_settings.default_payment_method as Stripe.PaymentMethod).id
            : null;

        // 2. If default already set, skip
        if (entry.default_pm_before) {
          entry.action = "already_set";
          results.push(entry);
          continue;
        }

        // 3. List SEPA payment methods
        const pms = await stripe.paymentMethods.list({
          customer: contract.stripe_customer_id,
          type: "sepa_debit",
        });
        entry.sepa_methods_count = pms.data.length;

        if (pms.data.length === 0) {
          entry.action = "no_sepa_pm";
        } else if (pms.data.length === 1) {
          const pmId = pms.data[0].id;
          if (dryRun) {
            entry.action = "would_set_default";
            entry.set_pm_id = pmId;
          } else {
            // Actually set the default
            await stripe.customers.update(contract.stripe_customer_id, {
              invoice_settings: { default_payment_method: pmId },
            });
            entry.action = "default_set";
            entry.set_pm_id = pmId;
          }
        } else {
          entry.action = "multiple_sepa_manual_review";
        }
      } catch (err) {
        entry.error = String(err);
        entry.action = "error";
      }

      results.push(entry);
    }

    return new Response(
      JSON.stringify({ dry_run: dryRun, total: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
