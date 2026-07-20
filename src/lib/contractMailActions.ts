/**
 * contractMailActions — Helper für Mail-/Link-Aktionen rund um Verträge
 * (Etappe 3b-ii + 4). Fire-and-toast pattern: Aufrufer zeigt Toast.
 *
 * - sendMandateMail: invoked `send-mandate-setup` Edge Function
 *   + customer_events MAIL_SENT_MANDATE (force differenziert)
 * - resendConfirmationMail: invoked `send-contract-confirmation`
 *   + customer_events MAIL_SENT_CONFIRMATION
 * - copyBuchungslink: kopiert /buchen?contract_id=... in die Zwischenablage
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { logCustomerEvent } from "@/lib/customerEvents";

export interface MailActionResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

function invalidateAfterMail(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["contracts"] });
  qc.invalidateQueries({ queryKey: ["kundenDialogData"] });
  qc.invalidateQueries({ queryKey: ["kunden-dialog-contracts"] });
  qc.invalidateQueries({ queryKey: ["kunden-dialog-events"] });
}

export async function sendMandateMail(params: {
  contractId: string;
  force?: boolean;
  queryClient: QueryClient;
  hfxCustomerNumber?: string | null;
  userId?: string | null;
}): Promise<MailActionResult> {
  const { contractId, force = false, queryClient, hfxCustomerNumber, userId } = params;
  try {
    const { data, error } = await supabase.functions.invoke("send-mandate-setup", {
      body: { contract_id: contractId, force },
    });
    if (error) return { success: false, error: error.message };
    if (data && typeof data === "object" && (data as any).skipped) {
      return { success: true, skipped: true };
    }
    await logCustomerEvent({
      eventType: "MAIL_SENT_MANDATE",
      entityType: "contract",
      entityId: contractId,
      hfxCustomerNumber: hfxCustomerNumber ?? null,
      contractId,
      createdBy: userId ?? null,
      eventData: {
        force: force === true,
        source: "kunden_dialog_vertrag_tab",
      },
    });
    invalidateAfterMail(queryClient);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}

export async function resendConfirmationMail(params: {
  contractId: string;
  force?: boolean;
  queryClient: QueryClient;
  hfxCustomerNumber?: string | null;
  userId?: string | null;
}): Promise<MailActionResult> {
  const { contractId, force = false, queryClient, hfxCustomerNumber, userId } = params;
  try {
    const { data, error } = await supabase.functions.invoke("send-contract-confirmation", {
      body: { contract_id: contractId, force },
    });
    if (error) return { success: false, error: error.message };
    if (data && typeof data === "object" && (data as any).skipped) {
      return { success: true, skipped: true };
    }
    await logCustomerEvent({
      eventType: "MAIL_SENT_CONFIRMATION",
      entityType: "contract",
      entityId: contractId,
      hfxCustomerNumber: hfxCustomerNumber ?? null,
      contractId,
      createdBy: userId ?? null,
      eventData: {
        force: force === true,
        source: "kunden_dialog_vertrag_tab",
      },
    });
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
  // Origin fest auf die Produktivdomain — window.location.origin würde in
  // id-preview-Umgebungen eine Lovable-Domain in den kopierten Link schreiben
  // (dieselbe Falle wie #16 Phase 2b).
  const origin = params.appUrl ?? "https://sales.hfx-honorarfuchs.de";
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

