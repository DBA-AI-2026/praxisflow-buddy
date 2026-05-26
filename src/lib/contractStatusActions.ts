/**
 * changeContractStatus — zentrale Status-Wechsel-Logik für Verträge.
 *
 * Extrahiert aus Vertraege.tsx handleStatusChange (Z. 1287–1419).
 * Side-Effects (in Reihenfolge):
 *  1. Stripe-Mandat-Guard bei "aktiv" (return success:false ohne Toast — Caller toastet)
 *  2. UPDATE contracts.status (+ approved_by/approved_at bei "aktiv")
 *  3. customer_events: CONTRACT_STATUS_CHANGED (neu — schliesst Bestands-Lücke)
 *  4. fibu_events: cancellation_created (idempotent) bei gekuendigt/beendet
 *  5. leads → "kunde" + customer_events LEAD_STATUS_CHANGED bei aktiv/gezeichnet
 *  6. praxen-Eintrag (idempotent via mp_nr) bei "aktiv"
 *  7. Query-Invalidation
 *
 * Keine Toasts — die macht der Aufrufer (Vertraege.tsx & VertragTab).
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { logCustomerStatusChange } from "@/lib/customerEvents";
import type { ContractRow } from "@/hooks/useKundenDialogData";

export interface ChangeContractStatusParams {
  contractId: string;
  newStatus: string;
  oldStatus: string | null;
  hfxCustomerNumber: string | null;
  userId: string | null;
  queryClient: QueryClient;
  contract: ContractRow;
  /** Quelle für customer_events (z. B. "vertraege_page", "kunden_dialog_vertrag_tab"). */
  source?: string;
}

export interface ChangeContractStatusResult {
  success: boolean;
  error?: string;
  /** Wenn true, wurde ein Praxen-Eintrag angelegt — Caller kann separaten Toast zeigen. */
  praxenCreated?: boolean;
}

export async function changeContractStatus(
  p: ChangeContractStatusParams,
): Promise<ChangeContractStatusResult> {
  const {
    contractId,
    newStatus,
    oldStatus,
    hfxCustomerNumber,
    userId,
    queryClient,
    contract,
    source = "contract_status_actions",
  } = p;

  // 1) Stripe-Mandat-Guard
  if (newStatus === "aktiv" && !contract?.stripe_customer_id) {
    return {
      success: false,
      error:
        "Kein SEPA-Zahlungsmandat (Stripe) hinterlegt. Der Kunde erhält beim nächsten Abrechnungslauf automatisch einen Einrichtungslink.",
    };
  }

  // 2) UPDATE contracts
  const updateData: Record<string, any> = { status: newStatus };
  if (newStatus === "aktiv") {
    updateData.approved_by = userId;
    updateData.approved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("contracts").update(updateData).eq("id", contractId);
  if (error) return { success: false, error: error.message };

  // 3) customer_events: CONTRACT_STATUS_CHANGED (schliesst Bestands-Lücke)
  if (oldStatus && oldStatus !== newStatus) {
    await logCustomerStatusChange({
      eventType: "CONTRACT_STATUS_CHANGED",
      entityType: "contract",
      entityId: contractId,
      oldStatus,
      newStatus,
      hfxCustomerNumber,
      contractId,
      source,
      createdBy: userId,
    });
  }

  // 4) fibu_events bei Kündigung/Beendigung (idempotent)
  if (newStatus === "gekuendigt" || newStatus === "beendet") {
    try {
      const { data: existing } = await (supabase as any)
        .from("fibu_events")
        .select("id")
        .eq("event_type", "cancellation_created")
        .eq("source_reference_id", contractId)
        .eq("metadata->>new_status", newStatus)
        .maybeSingle();

      if (!existing) {
        await (supabase as any).from("fibu_events").insert({
          event_type: "cancellation_created",
          source_module: "contracts",
          source_reference_id: contractId,
          contract_id: contractId,
          customer_id: contract.customer_id ?? null,
          product_name: contract.product_name ?? null,
          amount_net: 0,
          tax_amount: 0,
          amount_gross: 0,
          currency: "EUR",
          status: "draft",
          export_status: "open",
          occurred_at: new Date().toISOString(),
          description: `Vertrag ${newStatus === "gekuendigt" ? "gekündigt" : "beendet"} – ${contract.praxis || contract.customer_name} – ${contract.product_name}${contract.contract_number ? ` (${contract.contract_number})` : ""}`,
          created_by: userId,
          metadata: {
            contract_id: contractId,
            contract_number: contract.contract_number ?? null,
            product_name: contract.product_name ?? null,
            hfx_customer_number: contract.hfx_customer_number ?? null,
            new_status: newStatus,
            changed_by: userId,
          },
        });
      }
    } catch (fibuEx) {
      console.error("[contractStatusActions] fibu cancellation_created exception:", String(fibuEx));
    }
  }

  let praxenCreated = false;

  // 5) Lead → kunde + 6) praxen-Eintrag bei aktiv/gezeichnet
  if (newStatus === "aktiv" || newStatus === "gezeichnet") {
    const hfxNr = contract?.hfx_customer_number || contract?.mp_nr || null;

    if (hfxNr) {
      const { data: leadBefore } = await supabase
        .from("leads")
        .select("id, status")
        .eq("hfx_customer_number", hfxNr)
        .maybeSingle();

      await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", hfxNr);

      if (leadBefore?.id && leadBefore.status && leadBefore.status !== "kunde") {
        await logCustomerStatusChange({
          eventType: "LEAD_STATUS_CHANGED",
          entityType: "lead",
          entityId: leadBefore.id,
          oldStatus: leadBefore.status,
          newStatus: "kunde",
          source,
          hfxCustomerNumber: hfxNr,
          leadId: leadBefore.id,
          contractId,
          createdBy: userId,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    }

    if (newStatus === "aktiv" && contract) {
      const existingCheck = hfxNr
        ? await supabase.from("praxen").select("id").eq("mp_nr", hfxNr).maybeSingle()
        : { data: null };

      if (!existingCheck.data) {
        await supabase.from("praxen").insert({
          name: contract.praxis || contract.customer_name,
          adresse: contract.praxisanschrift || contract.adresse || null,
          plz: contract.plz || null,
          ort: contract.ort || null,
          telefon: contract.telefon || null,
          email: contract.email || null,
          mp_nr: contract.mp_nr || null,
          produkt: contract.product_name || null,
          module: contract.modules || [],
          preis: contract.monthly_price || 0,
          buchungs_datum: new Date().toISOString().split("T")[0],
          status: "aktiv",
          converted_from_lead_id: (contract as any).converted_from_lead_id || null,
        });
        queryClient.invalidateQueries({ queryKey: ["praxen"] });
        praxenCreated = true;
      }
    }
  }

  // 7) Invalidations
  queryClient.invalidateQueries({ queryKey: ["contracts"] });
  queryClient.invalidateQueries({ queryKey: ["kunden-dialog-contracts"] });
  queryClient.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });
  queryClient.invalidateQueries({ queryKey: ["journey-leads"] });

  return { success: true, praxenCreated };
}
