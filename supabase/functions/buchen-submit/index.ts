// buchen-submit
// Öffentlicher Empfänger für den Kunden-Buchen-Knopf auf /buchen.
// - Speichert Fachrichtung / Rechtsform / BSNR / LANR am Vertrag
// - Legt AGB-Zustimmung in agb_acceptances ab (gleiches Schema wie initiate-booking + stripe-webhook)
// - Ruft intern send-mandate-setup (Service-Role, force:true) auf und gibt setup_url zurück
// - Schreibt customer_events BUCHEN_SUBMITTED (non-blocking, gleiches Muster wie stripe-webhook)
//
// Berührt NICHT: initiate-booking, create-contract-subscription, send-mandate-setup,
// Vertragsstatus (Statuswechsel läuft weiter über den Mandat-/Webhook-Pfad).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const ts = new Date().toISOString();
  const d = details ? ` – ${JSON.stringify(details)}` : "";
  console.log(`[buchen-submit][${ts}] ${step}${d}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      contract_id,
      fachrichtung,
      rechtsform,
      bsnr,
      lanr,
      agb_accepted,
      agb_version,
      user_agent,
    } = body as {
      contract_id?: string;
      fachrichtung?: string;
      rechtsform?: string;
      bsnr?: string | null;
      lanr?: string | null;
      agb_accepted?: boolean;
      agb_version?: string;
      user_agent?: string | null;
    };

    log("payload", { contract_id, has_fach: !!fachrichtung, has_rf: !!rechtsform, agb_accepted });

    if (!contract_id || !fachrichtung || !rechtsform) {
      return new Response(
        JSON.stringify({ error: "contract_id, fachrichtung und rechtsform sind Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!agb_accepted) {
      return new Response(
        JSON.stringify({ error: "AGB müssen akzeptiert werden" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1) Vertrag laden + Status prüfen (nur 'eingegangen' zulässig)
    const { data: contract, error: cErr } = await admin
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .eq("status", "eingegangen")
      .maybeSingle();

    if (cErr || !contract) {
      log("contract not found or wrong status", { contract_id, error: cErr?.message });
      return new Response(
        JSON.stringify({ error: "Vertrag nicht gefunden oder nicht im Status 'eingegangen'" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Formularfelder am Vertrag speichern
    const { error: updErr } = await admin
      .from("contracts")
      .update({
        fachrichtung,
        rechtsform,
        bsnr: bsnr || null,
        lanr: lanr || null,
      } as any)
      .eq("id", contract_id);
    if (updErr) {
      log("ERROR: contract update failed", { error: updErr.message });
      return new Response(
        JSON.stringify({ error: "Vertragsdaten konnten nicht gespeichert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) AGB-Zustimmung ablegen (gleiches Schema wie initiate-booking)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const { error: agbErr } = await admin.from("agb_acceptances").insert({
      contract_id,
      agb_version: agb_version || "1.0",
      ip_address: clientIp,
      user_agent: user_agent || null,
      customer_email: (contract as any).email ?? null,
      customer_name: (contract as any).customer_name ?? null,
    });
    if (agbErr) {
      log("WARN: agb_acceptances insert failed (non-blocking)", agbErr.message);
    }

    // 4) send-mandate-setup intern aufrufen (Service-Role + force:true)
    let setupUrl: string | null = null;
    try {
      const mandateResp = await fetch(`${SUPABASE_URL}/functions/v1/send-mandate-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ contract_id, force: true }),
      });
      const mandateJson = await mandateResp.json().catch(() => ({}));
      if (!mandateResp.ok) {
        log("ERROR: send-mandate-setup failed", { status: mandateResp.status, body: mandateJson });
        return new Response(
          JSON.stringify({ error: "Mandat-Mail konnte nicht ausgelöst werden" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      setupUrl = (mandateJson as any)?.setup_url ?? null;
      if (!setupUrl) {
        log("ERROR: send-mandate-setup returned no setup_url", mandateJson);
        return new Response(
          JSON.stringify({ error: "Keine Weiterleitungs-URL erhalten" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (ex) {
      log("ERROR: send-mandate-setup invocation exception", String(ex));
      return new Response(
        JSON.stringify({ error: "Mandat-Mail konnte nicht ausgelöst werden" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5) customer_events BUCHEN_SUBMITTED (non-blocking, Muster aus stripe-webhook)
    try {
      const { error: ceErr } = await admin.from("customer_events").insert({
        event_type: "BUCHEN_SUBMITTED",
        entity_type: "contract",
        entity_id: contract_id,
        hfx_customer_number: (contract as any).hfx_customer_number ?? null,
        contract_id,
        created_by: null,
        event_data: {
          fachrichtung,
          rechtsform,
          has_bsnr: !!bsnr,
          has_lanr: !!lanr,
          agb_accepted: true,
          agb_version: agb_version || "1.0",
          source: "buchen_page",
        },
      });
      if (ceErr) log("WARN: customer_events insert failed (non-blocking)", ceErr.message);
    } catch (ex) {
      log("WARN: customer_events insert exception (non-blocking)", String(ex));
    }

    return new Response(
      JSON.stringify({ success: true, setup_url: setupUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(
      JSON.stringify({ error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
