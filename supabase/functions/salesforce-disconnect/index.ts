// salesforce-disconnect: nullt Salesforce-Tokens (Service-Role), admin-gated.
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const guard = await requireActiveRole(req, ["admin"], corsHeaders);
    if (guard instanceof Response) return guard;
    const admin = guard.admin;

    // 3) Disconnect (Service-Role): Tokens + PKCE-Material nullen
    const { error: updErr } = await admin
      .from("salesforce_connections")
      .update({
        is_connected: false,
        access_token: null,
        refresh_token: null,
        code_verifier: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
