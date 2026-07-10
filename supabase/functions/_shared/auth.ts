// Shared auth guard for admin/role-gated edge functions.
//
// Verifies the caller's Bearer JWT via getClaims() and loads the caller's
// ACTIVE roles from public.user_roles (is_active = true). If the caller has
// none of the allowed roles, returns a 403 Response. Otherwise returns the
// caller context plus a service-role Supabase client for downstream use.
//
// Status codes match the pre-existing pattern across HOCH-group functions:
//   401 — missing/invalid Bearer, invalid or expired token
//   403 — token valid but no matching active role, or role-lookup failure
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ActiveRoleContext = {
  userId: string;
  email: string | null;
  roles: string[];
  admin: SupabaseClient;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireActiveRole(
  req: Request,
  allowedRoles: string[],
  corsHeaders: Record<string, string>,
): Promise<ActiveRoleContext | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

  // Verify JWT via getClaims (signing-keys compatible).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

  const userId = claimsData.claims.sub as string;
  const email = (claimsData.claims.email as string | undefined) ?? null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (roleErr) {
    console.error("[requireActiveRole] role lookup failed:", roleErr);
    return jsonResponse(403, { error: "Forbidden" }, corsHeaders);
  }

  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r) => allowedRoles.includes(r));
  if (!ok) {
    return jsonResponse(403, { error: "Forbidden" }, corsHeaders);
  }

  return { userId, email, roles, admin };
}
