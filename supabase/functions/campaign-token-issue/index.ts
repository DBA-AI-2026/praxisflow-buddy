// campaign-token-issue — Etappe 1 (Kampagnen-Token Fundament)
//
// Zweck:
//   Erzeugt (oder liefert idempotent) einen geheimen Kampagnen-Token für einen
//   Lead und gibt den fertigen /kampagne-Link auf der Produktivdomain zurück.
//   Aufruf ausschließlich durch admin oder sales_lead.
//
// Token-Logik gekapselt in _shared/campaign.ts → ensureCampaignToken.
// Response-Shape { url, reused } bleibt Byte-für-Byte identisch.
//
// [REVIEW REQUIRED] Rollback:
//   Bei Regression Function deaktivieren. Die Spalten leads.campaign_token /
//   campaign_token_created_at / campaign_token_used_at bleiben harmlos leer.
import { requireActiveRole } from "../_shared/auth.ts";
import { buildCampaignUrl, ensureCampaignToken } from "../_shared/campaign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  // Existenz-Check separat, damit "Lead not found" nicht in einem
  // generischen 500 aus ensureCampaignToken untergeht.
  const { data: existing, error: fetchErr } = await admin
    .from("leads")
    .select("id, hfx_customer_number")
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

  try {
    const { token, reused } = await ensureCampaignToken(admin, leadId);
    console.log("[campaign-token-issue]", {
      lead_id: existing.id,
      hfx_customer_number: existing.hfx_customer_number,
      reused,
    });
    return new Response(
      JSON.stringify({ url: buildCampaignUrl(token), reused }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-token-issue] ensure failed", {
      lead_id: leadId,
      error: msg,
    });
    return new Response(JSON.stringify({ error: "Token ensure failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
