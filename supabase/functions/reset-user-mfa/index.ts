import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify calling user is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || callerRole.role !== "admin") {
      return new Response(JSON.stringify({ error: "Nur Administratoren können MFA zurücksetzen." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") {
      return new Response(JSON.stringify({ error: "targetUserId fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-reset
    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Sie können Ihre eigene MFA nicht über diese Funktion zurücksetzen." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List MFA factors for target user via Admin API
    const { data: factorsData, error: factorsError } = await adminClient.auth.admin.mfa.listFactors({
      userId: targetUserId,
    });

    if (factorsError) {
      return new Response(JSON.stringify({ error: factorsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totpFactors = factorsData?.factors?.filter((f: any) => f.factor_type === "totp") ?? [];

    if (totpFactors.length === 0) {
      return new Response(JSON.stringify({ message: "Kein aktiver 2FA-Faktor vorhanden.", reset: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unenroll all TOTP factors
    let resetCount = 0;
    for (const factor of totpFactors) {
      const { error: deleteError } = await adminClient.auth.admin.mfa.deleteFactor({
        userId: targetUserId,
        factorId: factor.id,
      });
      if (deleteError) {
        console.error(`Failed to delete factor ${factor.id}:`, deleteError.message);
      } else {
        resetCount++;
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      action: "MFA_RESET",
      resource_path: `/admin/users/${targetUserId}/mfa`,
      user_id: caller.id,
      user_email: caller.email,
      user_role: "admin",
      success: true,
      details: `Admin hat MFA für Benutzer ${targetUserId} zurückgesetzt (${resetCount} Faktor(en) entfernt).`,
    });

    return new Response(
      JSON.stringify({ message: `${resetCount} MFA-Faktor(en) erfolgreich zurückgesetzt.`, reset: true, count: resetCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
