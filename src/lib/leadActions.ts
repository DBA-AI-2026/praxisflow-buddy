/**
 * leadActions — Helper für Lead-bezogene externe Aktionen.
 *
 * - registerLeadAtQodia: Edge Function `sync-lead-qodia`
 *
 * Hinweis: Der frühere Zugangsdaten-Versand (`sendQodiaCredentials` →
 * `resend-lead-credentials`) wurde am 01.09.2026 entfernt. Die Einrichtung
 * läuft ausschließlich über die Einrichtungs-Mail `send-zugang-info`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

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
