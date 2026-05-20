/**
 * customer_events helper — fire-and-forget logger for business status changes.
 *
 * Never throws. Failures are logged to console.warn only, so a failed event
 * insert never blocks the actual status update. Strictly append-only.
 */
import { supabase } from "@/lib/supabaseClient";

type EntityType = "lead" | "contract";

interface LogStatusChangeArgs {
  eventType: "LEAD_STATUS_CHANGED" | "CONTRACT_STATUS_CHANGED";
  entityType: EntityType;
  entityId: string;
  oldStatus: string | null;
  newStatus: string;
  source: string; // e.g. "vertraege_save", "lead_detail_dialog", "stripe_webhook"
  hfxCustomerNumber?: string | null;
  leadId?: string | null;
  contractId?: string | null;
  createdBy?: string | null;
  extraData?: Record<string, unknown>;
}

export async function logCustomerStatusChange(args: LogStatusChangeArgs): Promise<void> {
  try {
    // Only log actual transitions — never log initial creation (oldStatus null)
    if (args.oldStatus === null || args.oldStatus === undefined) return;
    if (args.oldStatus === args.newStatus) return;

    const { error } = await (supabase as any).from("customer_events").insert({
      event_type: args.eventType,
      entity_type: args.entityType,
      entity_id: args.entityId,
      hfx_customer_number: args.hfxCustomerNumber ?? null,
      lead_id: args.leadId ?? (args.entityType === "lead" ? args.entityId : null),
      contract_id: args.contractId ?? (args.entityType === "contract" ? args.entityId : null),
      event_data: {
        old_status: args.oldStatus,
        new_status: args.newStatus,
        source: args.source,
        ...(args.extraData ?? {}),
      },
      created_by: args.createdBy ?? null,
    });

    if (error) {
      console.warn("[customer_events] insert failed (non-blocking):", error.message);
    }
  } catch (err) {
    console.warn("[customer_events] exception (non-blocking):", err);
  }
}
