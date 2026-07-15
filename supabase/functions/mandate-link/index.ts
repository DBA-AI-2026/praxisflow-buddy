// mandate-link
// Öffentliche GET-Route für den Mandat-Aktivierungslink aus Mail 1
// (`send-mandate-setup`). Ziel: Der Kunde klickt einen stabilen Link
// mit ?contract_id=... und wird auf eine frisch gemintete Stripe-Setup-
// Session weitergeleitet.
//
// Verhalten:
// - Vertrag existiert + Status ∈ {'eingegangen','wartend_auf_mandat'} +
//   stripe_customer_id gesetzt → neue Stripe-Setup-Session anlegen und
//   per 302 dorthin weiterleiten. Metadata exakt wie `send-mandate-setup`:
//     { source: "sepa_mandate_setup", contract_id, hfx_customer_number }
//   (Der Stripe-Webhook `handleSepaMandateSetup` findet den Vertrag
//   ausschließlich hierüber; er aktiviert beide Status.)
//   Nur im Erfolgsfall wird zusätzlich ein `MANDATE_LINK_OPENED`-Event
//   in `customer_events` geschrieben (non-blocking, Fehler nur geloggt).
// - Alles andere (kein contract_id, ungültige UUID, nicht gefunden,
//   falscher Status, kein stripe_customer_id, DB-/Stripe-Fehler) →
//   302 Redirect auf ${APP_URL}/mandate-info. Keine Details, keine PII,
//   keine Enumeration, kein Anhängen von contract_id.
//
// HINWEIS: Inline-HTML ist auf der Functions-Domain NICHT möglich —
// das Gateway erzwingt Content-Type: text/plain + nosniff + CSP-Sandbox.
// Der Info-Fall MUSS auf die Frontend-Route /mandate-info redirecten.
// (Gemessen 15.07.2026: text/html wird zu text/plain umgeschrieben,
// Cache-Control aus demselben Header-Objekt kommt durch.)
//
// Ausdrücklich NICHT: Customer anlegen, Vertrag mutieren, Mail versenden,
// Rate-Limit. Phase 3 (Token-Härtung) räumt den offenen Angriffspfad
// "Jemand mit gültiger UUID mintet wiederholt Sessions" mit ab — hier
// bewusst nicht gelöst.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const APP_URL = "https://praxisflow-buddy.lovable.app";

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

const INFO_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>HFX Honorarfuchs</title>
<style>
  html,body{margin:0;padding:0;background:#ffffff;color:#111827;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:520px;width:100%;text-align:center;}
  h1{color:#0b367f;font-size:22px;margin:0 0 16px;font-weight:700;}
  p{font-size:15px;line-height:1.55;margin:0 0 12px;color:#374151;}
  .mail{color:#0b367f;font-weight:600;text-decoration:none;}
  .foot{margin-top:32px;font-size:12px;color:#9ca3af;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Dieser Link ist nicht mehr aktiv.</h1>
      <p>Ihr Vertrag ist entweder bereits aktiviert oder der Link ist nicht mehr gültig.</p>
      <p>Bei Fragen erreichen Sie uns unter
        <a class="mail" href="mailto:info@hfx-honorarfuchs.de">info@hfx-honorarfuchs.de</a>.
      </p>
      <div class="foot">HFX Honorarfuchs — eine Marke der MCC Medical CareCapital GmbH</div>
    </div>
  </div>
</body>
</html>`;

const infoResponse = (reason: string) => {
  log("info_response", { reason });
  return new Response(INFO_HTML, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
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
    if (!contractId) return infoResponse("no_contract_id");

    // Gate 2: UUID-Format
    if (!UUID_RE.test(contractId)) return infoResponse("invalid_uuid");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Gate 3+4: Vertrag existiert und Status ∈ activatableStatuses.
    // Spiegelt handleSepaMandateSetup (stripe-webhook) exakt.
    // Konvention: Array-Query, kein .maybeSingle() — auch wenn Lookup über
    // Primary Key läuft (immer max. eine Zeile).
    const { data: rows, error: cErr } = await admin
      .from("contracts")
      .select("id, status, stripe_customer_id, hfx_customer_number")
      .eq("id", contractId)
      .in("status", ["eingegangen", "wartend_auf_mandat"]);

    if (cErr) {
      log("db error", { message: cErr.message });
      return infoResponse("db_error");
    }
    const contract = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!contract) return infoResponse("not_found_or_wrong_status");

    // Gate 5: stripe_customer_id muss existieren. Diese Route legt niemals
    // selbst einen Customer an. `send-mandate-setup` (Mail 1) hat das
    // bereits erledigt; ein aktivierbarer Vertrag ohne Customer ist
    // pathologisch und wird still auf die Info-Seite umgeleitet.
    const stripeCustomerId = (contract as any).stripe_customer_id as string | null;
    if (!stripeCustomerId) return infoResponse("no_stripe_customer");

    // Stripe-Setup-Session minten. Metadata EXAKT gespiegelt zu
    // `send-mandate-setup` — der Webhook `handleSepaMandateSetup`
    // routet ausschließlich hierüber.
    const stripeKey =
      Deno.env.get("STRIPE_SECRET_KEY_V2") || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log("missing stripe key");
      return infoResponse("stripe_key_missing");
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
      return infoResponse("stripe_no_url");
    }

    // Non-blocking Event — Signal "Kunde klickt (spät)". Nur im Erfolgsfall.
    try {
      await admin.from("customer_events").insert({
        event_type: "MANDATE_LINK_OPENED",
        entity_type: "contract",
        entity_id: contract.id,
        hfx_customer_number: (contract as any).hfx_customer_number ?? null,
        contract_id: contract.id,
        created_by: null,
        event_data: { status: (contract as any).status, source: "mandate_link" },
      });
    } catch (ex) {
      log("WARN: customer_events insert failed (non-blocking)", String(ex));
    }

    log("redirect_stripe", { contract_id: contract.id, session_id: session.id });
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: session.url },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return infoResponse("exception");
  }
});
