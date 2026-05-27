/**
 * customer_events helper — fire-and-forget logger for business events.
 *
 * Generic base: `logCustomerEvent` (any event_type).
 * Backwards-compatible wrapper: `logCustomerStatusChange` (status transitions).
 * Convenience: `addCustomerNote` (NOTE_ADDED).
 *
 * Never throws. Failures are logged to console.warn only, so a failed event
 * insert never blocks the actual action. Strictly append-only.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

type EntityType = "lead" | "contract";

export interface LogCustomerEventArgs {
  eventType: string;
  entityType: EntityType;
  entityId: string;
  hfxCustomerNumber?: string | null;
  leadId?: string | null;
  contractId?: string | null;
  eventData?: Record<string, unknown>;
  createdBy?: string | null;
}

export async function logCustomerEvent(args: LogCustomerEventArgs): Promise<void> {
  try {
    const { error } = await (supabase as any).from("customer_events").insert({
      event_type: args.eventType,
      entity_type: args.entityType,
      entity_id: args.entityId,
      hfx_customer_number: args.hfxCustomerNumber ?? null,
      lead_id: args.leadId ?? (args.entityType === "lead" ? args.entityId : null),
      contract_id:
        args.contractId ?? (args.entityType === "contract" ? args.entityId : null),
      event_data: args.eventData ?? {},
      created_by: args.createdBy ?? null,
    });
    if (error) {
      console.warn("[customer_events] insert failed (non-blocking):", error.message);
    }
  } catch (err) {
    console.warn("[customer_events] exception (non-blocking):", err);
  }
}

interface LogStatusChangeArgs {
  eventType: "LEAD_STATUS_CHANGED" | "CONTRACT_STATUS_CHANGED";
  entityType: EntityType;
  entityId: string;
  oldStatus: string | null;
  newStatus: string;
  source: string;
  hfxCustomerNumber?: string | null;
  leadId?: string | null;
  contractId?: string | null;
  createdBy?: string | null;
  extraData?: Record<string, unknown>;
}

export async function logCustomerStatusChange(args: LogStatusChangeArgs): Promise<void> {
  // Only log actual transitions — never log initial creation (oldStatus null)
  if (args.oldStatus === null || args.oldStatus === undefined) return;
  if (args.oldStatus === args.newStatus) return;

  await logCustomerEvent({
    eventType: args.eventType,
    entityType: args.entityType,
    entityId: args.entityId,
    hfxCustomerNumber: args.hfxCustomerNumber,
    leadId: args.leadId,
    contractId: args.contractId,
    createdBy: args.createdBy,
    eventData: {
      old_status: args.oldStatus,
      new_status: args.newStatus,
      source: args.source,
      ...(args.extraData ?? {}),
    },
  });
}

/**
 * addCustomerNote — speichert eine Freitext-Notiz als customer_events-Eintrag
 * (event_type = NOTE_ADDED). Entity wird vorrangig auf Lead gemappt, sonst Contract.
 */
export async function addCustomerNote(params: {
  noteText: string;
  leadId?: string | null;
  contractId?: string | null;
  hfxCustomerNumber?: string | null;
  userId: string | null;
  queryClient: QueryClient;
}): Promise<{ success: boolean; error?: string }> {
  const text = params.noteText.trim();
  if (!text) return { success: false, error: "Notiz darf nicht leer sein." };
  if (!params.leadId && !params.contractId) {
    return { success: false, error: "Kein Lead oder Vertrag verknüpft." };
  }

  const entityType: EntityType = params.leadId ? "lead" : "contract";
  const entityId = (params.leadId || params.contractId)!;

  try {
    await logCustomerEvent({
      eventType: "NOTE_ADDED",
      entityType,
      entityId,
      hfxCustomerNumber: params.hfxCustomerNumber,
      leadId: params.leadId,
      contractId: params.contractId,
      createdBy: params.userId,
      eventData: {
        note_text: text,
        source: "kunden_dialog_verlauf_tab",
      },
    });
    params.queryClient.invalidateQueries({ queryKey: ["kunden-dialog-events"] });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}
