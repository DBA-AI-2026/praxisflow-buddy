// mandate-link
// Öffentliche GET-Route für den Mandat-Aktivierungslink aus Mail 1
// (`send-mandate-setup`). Ziel: Der Kunde klickt einen stabilen Link
// mit ?contract_id=... und wird auf eine frisch gemintete Stripe-Setup-
// Session weitergeleitet.
//
// Verhalten:
// - Vertrag existiert + Status 'eingegangen' + stripe_customer_id gesetzt
//   → neue Stripe-Setup-Session anlegen und per 302 dorthin weiterleiten.
//   Metadata exakt wie `send-mandate-setup`:
//     { source: "sepa_mandate_setup", contract_id, hfx_customer_number }
//   (Der Stripe-Webhook findet den Vertrag ausschließlich hierüber.)
// - Alles andere (kein contract_id, ungültige UUID, nicht gefunden,
//   falscher Status, kein stripe_customer_id) → identische 302-
//   Weiterleitung auf /mandate-info. Keine Details, keine Enumeration.
//
// Ausdrücklich NICHT: Customer anlegen, Vertrag mutieren, Mail versenden,
// Events schreiben, Rate-Limit. Phase 3 (Token-Härtung) räumt den offenen
// Angriffspfad "Jemand mit gültiger UUID mintet wiederholt Sessions" mit
// ab — hier bewusst nicht gelöst.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const APP_URL = "https://praxisflow-buddy.lovable.app";
const INFO_URL = `${APP_URL}/mandate-info`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[mandate-link][${ts}] ${step}${d}`);
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const redirectToInfo = (reason: string) => {
  log("redirect_info", { reason });
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: INFO_URL },
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Gate 1: contract_id vorhanden
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    if (!contractId) return redirectToInfo("no_contract_id");

    // Gate 2: UUID-Format
    if (!UUID_RE.test(contractId)) return redirectToInfo("invalid_uuid");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Gate 3+4: Vertrag existiert und Status 'eingegangen'
    // Konvention: Array-Query, kein .maybeSingle() — auch wenn Lookup über
    // Primary Key läuft (immer max. eine Zeile).
    const { data: rows, error: cErr } = await admin
      .from("contracts")
      .select("id, status, stripe_customer_id, hfx_customer_number")
      .eq("id", contractId)
      .eq("status", "eingegangen");

    if (cErr) {
      log("db error", { message: cErr.message });
      return redirectToInfo("db_error");
    }
    const contract = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!contract) return redirectToInfo("not_found_or_wrong_status");

    // Gate 5: stripe_customer_id muss existieren. Diese Route legt niemals
    // selbst einen Customer an. `send-mandate-setup` (Mail 1) hat das
    // bereits erledigt; ein 'eingegangen'-Vertrag ohne Customer ist
    // pathologisch und wird still auf die Info-Seite umgeleitet.
    const stripeCustomerId = (contract as any).stripe_customer_id as string | null;
    if (!stripeCustomerId) return redirectToInfo("no_stripe_customer");

    // Stripe-Setup-Session minten. Metadata EXAKT gespiegelt zu
    // `send-mandate-setup` — der Webhook `handleSepaMandateSetup`
    // routet ausschließlich hierüber.
    const stripeKey =
      Deno.env.get("STRIPE_SECRET_KEY_V2") || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log("missing stripe key");
      return redirectToInfo("stripe_key_missing");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      payment_method_types: ["sepa_debit"],
      success_url: `${APP_URL}/mandate-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/mandate-success?cancelled=1`,
      metadata: {
        source: "sepa_mandate_setup",
        contract_id: contract.id,
        hfx_customer_number: (contract as any).hfx_customer_number || "",
      },
    });

    if (!session.url) {
      log("stripe returned no url", { session_id: session.id });
      return redirectToInfo("stripe_no_url");
    }

    log("redirect_stripe", { contract_id: contract.id, session_id: session.id });
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: session.url },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return redirectToInfo("exception");
  }
});
