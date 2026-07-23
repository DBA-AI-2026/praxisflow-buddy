// campaign-token-issue — Etappe 1 (Kampagnen-Token Fundament)
//
// Zweck:
//   Erzeugt (oder liefert idempotent) einen geheimen Kampagnen-Token für einen
//   Lead und gibt den fertigen /kampagne-Link auf der Produktivdomain zurück.
//   Aufruf ausschließlich durch admin oder sales_lead.
//
// Regeln (siehe #16 Etappe 1):
//   - Token nur hier serverseitig via crypto.getRandomValues erzeugen.
//   - Token NIEMALS loggen (weder success noch error path).
//   - Rückgabe-URL hart auf https://sales.hfx-honorarfuchs.de/kampagne.
//   - Idempotent: hat der Lead bereits einen campaign_token, wird derselbe
//     Link zurückgegeben, kein Überschreiben.
//
// [REVIEW REQUIRED] Rollback:
//   Bei Regression Function deaktivieren. Die Spalten leads.campaign_token /
//   campaign_token_created_at / campaign_token_used_at bleiben harmlos leer;
//   Etappe 2 (/kampagne + campaign-start) existiert noch nicht.
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAMPAIGN_URL_ORIGIN = "https://sales.hfx-honorarfuchs.de";
const TOKEN_PREFIX = "hfxc_";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + toBase64Url(bytes);
}

function buildUrl(token: string): string {
  return `${CAMPAIGN_URL_ORIGIN}/kampagne?token=${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ctx = await requireActiveRole(req, ["admin", "sales_lead"], corsHeaders);
  if (ctx instanceof Response) return ctx;

  let body: { lead_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const leadId = body.lead_id?.trim();
  if (!leadId) {
    return new Response(JSON.stringify({ error: "lead_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { admin } = ctx;

  // 1) Idempotenz-Check
  const { data: existing, error: fetchErr } = await admin
    .from("leads")
    .select("id, hfx_customer_number, campaign_token")
    .eq("id", leadId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[campaign-token-issue] lead lookup failed", {
      lead_id: leadId,
      error: fetchErr.message,
    });
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!existing) {
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (existing.campaign_token) {
    console.log("[campaign-token-issue] reuse", {
      lead_id: existing.id,
      hfx_customer_number: existing.hfx_customer_number,
      reused: true,
    });
    return new Response(
      JSON.stringify({ url: buildUrl(existing.campaign_token), reused: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2) Neuen Token erzeugen und schreiben (Service-Role)
  const token = generateToken();
  const { error: updateErr } = await admin
    .from("leads")
    .update({
      campaign_token: token,
      campaign_token_created_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .is("campaign_token", null); // Race-Guard

  if (updateErr) {
    console.error("[campaign-token-issue] token write failed", {
      lead_id: leadId,
      error: updateErr.message,
    });
    return new Response(JSON.stringify({ error: "Token write failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Race-Fall: parallel wurde einer geschrieben — dann diesen zurückgeben.
  const { data: after, error: afterErr } = await admin
    .from("leads")
    .select("campaign_token")
    .eq("id", leadId)
    .maybeSingle();

  if (afterErr || !after?.campaign_token) {
    console.error("[campaign-token-issue] post-write reread failed", {
      lead_id: leadId,
      error: afterErr?.message,
    });
    return new Response(JSON.stringify({ error: "Token read-back failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[campaign-token-issue] issued", {
    lead_id: existing.id,
    hfx_customer_number: existing.hfx_customer_number,
    reused: false,
  });

  return new Response(
    JSON.stringify({ url: buildUrl(after.campaign_token), reused: false }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
