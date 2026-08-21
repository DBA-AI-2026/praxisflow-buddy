/**
 * leadActions — Helper für Lead-bezogene externe Aktionen (Etappe 3b-ii + 4).
 *
 * - registerLeadAtQodia: Edge Function `sync-lead-qodia`
 * - sendQodiaCredentials: Edge Function `resend-lead-credentials`
 *   + customer_events MAIL_SENT_CREDENTIALS
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { logCustomerEvent } from "@/lib/customerEvents";

export interface LeadActionResult {
  success: boolean;
  error?: string;
  alreadySynced?: boolean;
  conflict?: boolean;
}

function invalidateAfterLead(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["kundenDialogData"] });
  qc.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });
  qc.invalidateQueries({ queryKey: ["kunden-dialog-events"] });
}

export async function registerLeadAtQodia(params: {
  leadId: string;
  queryClient: QueryClient;
}): Promise<LeadActionResult> {
  const { leadId, queryClient } = params;
  try {
    const { data, error } = await supabase.functions.invoke("sync-lead-qodia", {
      body: { leadId },
    });
    if (error) return { success: false, error: error.message };
    const r = (data ?? {}) as any;
    if (r.already_synced) {
      invalidateAfterLead(queryClient);
      return { success: true, alreadySynced: true };
    }
    if (r.success === false) {
      return { success: false, error: r.error ?? "Qodia-Registrierung fehlgeschlagen", conflict: !!r.conflict };
    }
    invalidateAfterLead(queryClient);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}

export async function sendQodiaCredentials(params: {
  leadId: string;
  queryClient: QueryClient;
  hfxCustomerNumber?: string | null;
  userId?: string | null;
}): Promise<LeadActionResult> {
  const { leadId, queryClient, hfxCustomerNumber, userId } = params;
  // 21.08.2026: Vorübergehend gesperrt. resend-lead-credentials setzt das Passwort
  // nur in Supabase Auth zurück, propagiert es aber nicht zu Qodia – der Kunde
  // würde sich danach nicht mehr im Qodia-Tool anmelden können.
  return { success: false, error: "Zugangsdaten-Versand ist vorübergehend gesperrt." };
  try {
    const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
      body: { leadId },
    });
    if (error) return { success: false, error: error.message };
    const r = (data ?? {}) as any;
    if (r.error) return { success: false, error: r.error };
    await logCustomerEvent({
      eventType: "MAIL_SENT_CREDENTIALS",
      entityType: "lead",
      entityId: leadId,
      hfxCustomerNumber: hfxCustomerNumber ?? null,
      leadId,
      createdBy: userId ?? null,
      eventData: { source: "kunden_dialog_vertrag_tab" },
    });
    invalidateAfterLead(queryClient);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}
