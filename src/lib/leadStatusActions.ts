/**
 * changeLeadStatus — zentrale Lead-Status-Wechsel-Logik.
 *
 * Extrahiert aus LeadDetailDialog onSubmit (Z. 184–215). Schlanker als
 * Contract-Variante: UPDATE + customer_events. Keine Toasts.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { logCustomerStatusChange } from "@/lib/customerEvents";

export interface ChangeLeadStatusParams {
  leadId: string;
  newStatus: string;
  oldStatus: string | null;
  hfxCustomerNumber?: string | null;
  userId: string | null;
  queryClient: QueryClient;
  source?: string;
}

export interface ChangeLeadStatusResult {
  success: boolean;
  error?: string;
}

export async function changeLeadStatus(
  p: ChangeLeadStatusParams,
): Promise<ChangeLeadStatusResult> {
  const {
    leadId,
    newStatus,
    oldStatus,
    hfxCustomerNumber,
    userId,
    queryClient,
    source = "lead_status_actions",
  } = p;

  const { error } = await supabase
    .from("leads")
    .update({ status: newStatus })
    .eq("id", leadId);
  if (error) return { success: false, error: error.message };

  if (oldStatus && oldStatus !== newStatus) {
    await logCustomerStatusChange({
      eventType: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: leadId,
      oldStatus,
      newStatus,
      hfxCustomerNumber: hfxCustomerNumber ?? null,
      leadId,
      source,
      createdBy: userId,
    });
  }

  queryClient.invalidateQueries({ queryKey: ["leads"] });
  queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] });
  queryClient.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });

  return { success: true };
}
