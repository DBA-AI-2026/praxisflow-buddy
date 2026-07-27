// campaign-start
// Öffentliche GET-Route für den Kampagnen-Klick-Link (Weg B).
// Der Kunde öffnet …/kampagne?token=hfxc_… → KampagneRedirect leitet an
// diesen Endpoint durch → hier wird der Token geprüft, ggf. ein Vertrag
// via qodia-initiate-booking angelegt (mit skip_mail: true) oder ein
// bestehender wiederverwendet, und der Kunde per 302 nach /buchen geleitet.
//
// Architektur 1:1 gespiegelt aus `mandate-link`:
// - Alle Info-Fälle → 302 auf ${APP_URL}/kampagne-info (kein Detail, kein Leak).
// - Cache-Control: no-store auf jeder Antwort.
// - Token wird niemals geloggt; nur lead_id / hfx_customer_number.
//
// Gate-Kette (Reihenfolge = Reihenfolge im Code):
//   1. token vorhanden
//   2. Format-Präfix `hfxc_`
//   3. Lead per campaign_token gefunden
//   4. Status ∈ Allowlist {neu, kontaktiert, qualifiziert, vertrag}
//      (vertrag bleibt drin: der Reuse-Pfad in qodia-initiate-booking
//       findet den bereits angelegten eingegangen-Vertrag; ein wirklich
//       aktiver Vertrag wird durch den 409 dort abgefangen.)
//   5. promo_end_date des Produkts noch in der Zukunft (leer → Info)
//   6. qodia-initiate-booking(skip_mail=true) liefert contract_id
//      → 302 nach /buchen?contract_id=…
//      → 409 (bereits aktiv) → /kampagne-info
//
// AUSDRÜCKLICH NICHT: Rate-Limit, Token-Härtung (HMAC/Entropie), Rotation
// nach Einlösung — bewusst offen (siehe mandate-link Phase 3).

import { createClient } from "npm:@supabase/supabase-js@2";

// Produktivdomain — identisch zu mandate-link (kanonische Frontend-URL).
const APP_URL = "https://sales.hfx-honorarfuchs.de";

// SYNCHRONIZE: qodia-initiate-booking → VALID_PRODUCTS. Ein Produkt,
// hartkodiert. Bei Produktnamens-Wechsel BEIDE Stellen anfassen.
const CAMPAIGN_PRODUCT = "HFX GOÄ - die KI für ihre Privatabrechnung";

// Allowlist: alle Lead-Status, die einen Kampagnen-Klick einlösen dürfen.
// `vertrag` bleibt drin (Reuse-Pfad in qodia-initiate-booking).
const ALLOWED_LEAD_STATUSES = ["neu", "kontaktiert", "qualifiziert", "vertrag"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[campaign-start][${ts}] ${step}${d}`);
};

const INFO_URL = `${APP_URL}/kampagne-info`;

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
    // Gate 1: token vorhanden
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return redirectToInfo("no_token");

    // Gate 2: Format-Präfix (Token nie loggen — nur Präsenz/Format prüfen)
    if (!token.startsWith("hfxc_") || token.length < 16) {
      return redirectToInfo("invalid_token_format");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Gate 3: Lead per campaign_token finden
    const { data: leadRows, error: lErr } = await admin
      .from("leads")
      .select("id, status, hfx_customer_number, campaign_token_used_at")
      .eq("campaign_token", token);

    if (lErr) {
      log("db error (lead lookup)", { message: lErr.message });
      return redirectToInfo("db_error");
    }
    const lead = Array.isArray(leadRows) && leadRows.length > 0 ? leadRows[0] : null;
    if (!lead) return redirectToInfo("token_not_found");

    // Gate 4: Lead-Status in Allowlist
    if (!ALLOWED_LEAD_STATUSES.includes(String(lead.status))) {
      log("status not eligible", {
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
        status: lead.status,
      });
      return redirectToInfo("status_not_eligible");
    }

    // Gate 5: Produkt-Aktion live (promo_end_date in der Zukunft, nicht leer)
    const { data: productRow, error: pErr } = await admin
      .from("products")
      .select("promo_end_date")
      .eq("name", CAMPAIGN_PRODUCT)
      .maybeSingle();

    if (pErr) {
      log("db error (product lookup)", { message: pErr.message });
      return redirectToInfo("db_error");
    }
    const promoEnd = productRow?.promo_end_date as string | null | undefined;
    if (!promoEnd) return redirectToInfo("promo_not_active");
    if (new Date(promoEnd) < new Date()) return redirectToInfo("promo_expired");

    // Gate 6: Vertrag anlegen (oder Reuse) via qodia-initiate-booking.
    // skip_mail: true — der Kunde ist gerade live, keine Zusatzmail.
    const apiKey = Deno.env.get("QODIA_API_KEY");
    if (!apiKey) {
      log("missing QODIA_API_KEY");
      return redirectToInfo("config_error");
    }

    const fnUrl = `${SUPABASE_URL}/functions/v1/qodia-initiate-booking`;
    const bookingRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        hfx_customer_number: lead.hfx_customer_number,
        product_name: CAMPAIGN_PRODUCT,
        skip_mail: true,
      }),
    });

    if (bookingRes.status === 409) {
      // Vertrag bereits aktiv — nichts zu tun, still auf Info-Seite.
      log("already active", {
        lead_id: lead.id,
        hfx_customer_number: lead.hfx_customer_number,
      });
      return redirectToInfo("already_active");
    }
    if (!bookingRes.ok) {
      const body = await bookingRes.text();
      log("booking failed", {
        lead_id: lead.id,
        status: bookingRes.status,
        body: body.slice(0, 500),
      });
      return redirectToInfo("booking_failed");
    }

    const bookingJson = (await bookingRes.json()) as { contract_id?: string };
    const contractId = bookingJson?.contract_id;
    if (!contractId) {
      log("booking returned no contract_id", { lead_id: lead.id });
      return redirectToInfo("booking_no_contract");
    }

    // Vorwert VOR dem Update festhalten — nicht später aus `lead` lesen.
    // Ein künftiges Refactor, das `lead` mutiert, würde das Flag sonst still kippen.
    const wasFirstRedemption = !lead.campaign_token_used_at;

    // Ersteinlösung markieren (idempotent — nur setzen, wenn NULL).
    if (wasFirstRedemption) {
      const { error: uErr } = await admin
        .from("leads")
        .update({ campaign_token_used_at: new Date().toISOString() })
        .eq("id", lead.id)
        .is("campaign_token_used_at", null);
      if (uErr) log("WARN: campaign_token_used_at update failed", { message: uErr.message });
    }

    // [REVIEW REQUIRED] customer_events CAMPAIGN_LINK_REDEEMED (non-blocking).
    // Muster analog buchen-submit (Zeilen 164–186): try/catch, log()-Helper, kein Throw.
    // Rollback: diesen Block (bis inkl. schließendem catch) entfernen — sonst nichts.
    // first_redemption ist best effort (Race bei Parallelklicks möglich).
    // Autoritativ für "erstmals eingelöst" ist leads.campaign_token_used_at.
    try {
      const { error: ceErr } = await admin.from("customer_events").insert({
        event_type: "CAMPAIGN_LINK_REDEEMED",
        entity_type: "contract",
        entity_id: contractId,
        hfx_customer_number: lead.hfx_customer_number,
        lead_id: lead.id,
        contract_id: contractId,
        created_by: null,
        event_data: {
          campaign: "goae_mint_2026_07",
          product_name: CAMPAIGN_PRODUCT,
          first_redemption: wasFirstRedemption,
          source: "campaign_start",
        },
      });
      if (ceErr) log("WARN: customer_events insert failed (non-blocking)", ceErr.message);
    } catch (ex) {
      log("WARN: customer_events insert exception (non-blocking)", String(ex));
    }


    log("redirect_buchen", {
      lead_id: lead.id,
      hfx_customer_number: lead.hfx_customer_number,
      contract_id: contractId,
    });
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `${APP_URL}/buchen?contract_id=${encodeURIComponent(contractId)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return redirectToInfo("exception");
  }
});
