/**
 * contractMailActions — Helper für Mail-/Link-Aktionen rund um Verträge
 * (Etappe 3b-ii). Fire-and-toast pattern: Aufrufer zeigt Toast.
 *
 * - sendMandateMail: invoked `send-mandate-setup` Edge Function
 * - resendConfirmationMail: invoked `send-contract-confirmation`
 * - copyBuchungslink: kopiert /buchen?contract_id=... in die Zwischenablage
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export interface MailActionResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

function invalidateAfterMail(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["contracts"] });
  qc.invalidateQueries({ queryKey: ["kundenDialogData"] });
  qc.invalidateQueries({ queryKey: ["kunden-dialog-contracts"] });
}

export async function sendMandateMail(params: {
  contractId: string;
  force?: boolean;
  queryClient: QueryClient;
}): Promise<MailActionResult> {
  const { contractId, force = false, queryClient } = params;
  try {
    const { data, error } = await supabase.functions.invoke("send-mandate-setup", {
      body: { contract_id: contractId, force },
    });
    if (error) return { success: false, error: error.message };
    if (data && typeof data === "object" && (data as any).skipped) {
      return { success: true, skipped: true };
    }
    invalidateAfterMail(queryClient);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}

export async function resendConfirmationMail(params: {
  contractId: string;
  queryClient: QueryClient;
}): Promise<MailActionResult> {
  const { contractId, queryClient } = params;
  try {
    const { error } = await supabase.functions.invoke("send-contract-confirmation", {
      body: { contract_id: contractId },
    });
    if (error) return { success: false, error: error.message };
    invalidateAfterMail(queryClient);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}

export async function copyBuchungslink(params: {
  contractId: string;
  appUrl?: string;
}): Promise<{ success: boolean; error?: string; url: string }> {
  const origin = params.appUrl ?? window.location.origin;
  const url = `${origin}/buchen?contract_id=${params.contractId}`;
  try {
    if (!navigator.clipboard?.writeText) {
      return { success: false, error: "Zwischenablage nicht verfügbar", url };
    }
    await navigator.clipboard.writeText(url);
    return { success: true, url };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Kopieren fehlgeschlagen", url };
  }
}
