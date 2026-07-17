// mandate-link
// Öffentliche GET-Route für den Mandat-Aktivierungslink aus Mail 1
// (`send-mandate-setup`) UND aus dem auto-invoice-Recovery-Pfad (Mail an
// aktive Verträge ohne SEPA-Mandat). Ziel: Der Kunde klickt einen stabilen
// Link mit ?contract_id=... und wird auf eine frisch gemintete Stripe-
// Setup-Session weitergeleitet.
//
// Verhalten:
// - Vertrag existiert + Status ∈ {'eingegangen','wartend_auf_mandat','aktiv'}
//   + stripe_customer_id gesetzt → neue Stripe-Setup-Session anlegen und
//   per 302 dorthin weiterleiten. Metadata exakt wie `send-mandate-setup`:
//     { source: "sepa_mandate_setup", contract_id, hfx_customer_number }
//   (Der Stripe-Webhook `handleSepaMandateSetup` findet den Vertrag
//   ausschließlich hierüber; er aktiviert beide Status.)
//   Nur im Erfolgsfall wird zusätzlich ein `MANDATE_LINK_OPENED`-Event
//   in `customer_events` geschrieben (non-blocking, Fehler nur geloggt);
//   das Event trägt `recovery: true`, wenn der Klick aus dem aktiv-Zweig
//   kommt (auto-invoice-Recovery), sonst `false` (Mail 1).
// - Alles andere (kein contract_id, ungültige UUID, nicht gefunden,
//   falscher Status, kein stripe_customer_id, DB-/Stripe-Fehler) →
//   302 Redirect auf ${APP_URL}/mandate-info. Keine Details, keine PII,
//   keine Enumeration, kein Anhängen von contract_id.
//
// Gate 6 (nur für status === "aktiv"): Bevor eine Setup-Session gemintet
// wird, prüfen wir bei Stripe, ob der Customer schon eine SEPA-Zahlungs-
// methode hat. Wenn ja → redirectToInfo("active_with_existing_mandate").
// Grund: Ein zweites SEPA-PM am selben Customer macht den Einzug mehr-
// deutig (vgl. SKIP_AMBIGUOUS in backfill-sepa-iban). Der einzige
// legitime aktiv-Fall ist der auto-invoice-Recovery-Pfad, wo der Customer
// gerade frisch angelegt wurde und null PMs hat. Wir fragen bewusst
// Stripe und NICHT `contracts.iban_masked`: Altbestandsverträge haben ein
// gültiges Mandat, aber kein iban_masked (deshalb existiert überhaupt
// die `backfill-sepa-iban`-Function). iban_masked ist damit kein
// verlässliches „hat-Mandat"-Signal — Stripe ist die Wahrheit.
//
// HINWEIS: Inline-HTML ist auf der Functions-Domain NICHT möglich —
// das Gateway erzwingt Content-Type: text/plain + nosniff + CSP-Sandbox.
// Der Info-Fall MUSS auf die Frontend-Route /mandate-info redirecten.
// (Gemessen 15.07.2026: text/html wird zu text/plain umgeschrieben,
// Cache-Control aus demselben Header-Objekt kommt durch.)
//
// Ausdrücklich NICHT: Customer anlegen, Vertrag mutieren, Mail versenden,
// Rate-Limit, Mandatswechsel/-widerruf. Phase 3 (Token-Härtung) räumt
// den offenen Angriffspfad "Jemand mit gültiger UUID mintet wiederholt
// Sessions" mit ab — hier bewusst nicht gelöst.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

// Produktivdomain — liefert denselben Build wie die Lovable-Preview.
// In Kundenmails sichtbar (Info-Seite, Stripe success_url/cancel_url).
const APP_URL = "https://sales.hfx-honorarfuchs.de";

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

const INFO_URL = `${APP_URL}/mandate-info`;

const redirectToInfo = (reason: string) => {
  log("redirect_info", { reason });
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: INFO_URL, "Cache-Control": "no-store" },
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
      return redirectToInfo("db_error");
    }
    const contract = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!contract) return redirectToInfo("not_found_or_wrong_status");

    // Gate 5: stripe_customer_id muss existieren. Diese Route legt niemals
    // selbst einen Customer an. `send-mandate-setup` (Mail 1) hat das
    // bereits erledigt; ein aktivierbarer Vertrag ohne Customer ist
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
    return redirectToInfo("exception");
  }
});
