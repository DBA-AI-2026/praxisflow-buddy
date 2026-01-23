import { supabase } from "@/integrations/supabase/client";

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

    // Get user role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_email: user.email,
        action: entry.action,
        resource_path: entry.resourcePath,
        user_role: roleData?.role || null,
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
