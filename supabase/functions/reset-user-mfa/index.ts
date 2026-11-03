import { requireActiveRole } from "../_shared/auth.ts";

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
    const guard = await requireActiveRole(req, ["admin"], corsHeaders);
    if (guard instanceof Response) return guard;
    const adminClient = guard.admin;
    const caller = { id: guard.userId, email: guard.email };

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
