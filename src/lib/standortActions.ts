/**
 * standortActions — Phase 2b Helper: Zugangsdaten an Standort senden.
 *
 * Strikt isoliert vom Lead-Pfad: kein leads-Touch, kein Auth-User-Touch,
 * Passwort kommt unverändert aus contracts.generated_password (server-side).
 * MAIL_SENT_CREDENTIALS wird erst NACH erfolgreichem Send geloggt.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { logCustomerEvent } from "@/lib/customerEvents";

export interface SendStandortCredentialsResult {
  success: boolean;
  error?: string;
  message?: string;
}

export async function sendStandortCredentials(params: {
  contractId: string;
  hfxCustomerNumber: string | null;
  queryClient: QueryClient;
  userId?: string | null;
}): Promise<SendStandortCredentialsResult> {
  const { contractId, hfxCustomerNumber, queryClient, userId } = params;
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-standort-credentials",
      { body: { contractId } },
    );
    if (error) return { success: false, error: error.message };
    if (!data?.success) {
      return { success: false, error: data?.error || "Unbekannter Fehler" };
    }

    // Event-Log erst nach erfolgreichem Send.
    await logCustomerEvent({
      eventType: "MAIL_SENT_CREDENTIALS",
      entityType: "contract",
      entityId: contractId,
      hfxCustomerNumber: hfxCustomerNumber ?? null,
      contractId,
      createdBy: userId ?? null,
      eventData: {
        source: "vertraege_standort_dropdown",
        kind: "standort",
      },
    });

    queryClient.invalidateQueries({ queryKey: ["contracts"] });
    queryClient.invalidateQueries({ queryKey: ["kunden-dialog-events"] });

    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}
