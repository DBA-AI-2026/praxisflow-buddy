import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// Priority mirrors useUserRole.ts — highest privilege first.
const ROLE_PRIORITY: AppRole[] = [
  "admin",
  "sales_lead",
  "regional_lead",
  "vertragsabteilung",
  "sales_partner",
  "user",
  "tippgeber",
];

function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return null;
}

interface AuditLogEntry {
  action: string;
  resourcePath: string;
  success: boolean;
  details?: string;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn("Cannot log audit event: No authenticated user");
      return;
    }

    // Multi-role aware: load ALL active roles, then reduce to primary.
    // A query error here is best-effort — audit log must still be written.
    let primaryRole: AppRole | null = null;
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (rolesError) {
      console.warn("useAuditLog: could not resolve user roles, logging without role:", rolesError);
    } else {
      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      primaryRole = pickPrimaryRole(roles);
    }

    const { error } = await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_email: user.email,
        action: entry.action,
        resource_path: entry.resourcePath,
        user_role: primaryRole,
        user_agent: navigator.userAgent,
        success: entry.success,
        details: entry.details,
      });

    if (error) {
      console.error("Failed to log audit event:", error);
    }
  } catch (error) {
    console.error("Error logging audit event:", error);
  }
}
