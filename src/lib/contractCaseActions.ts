/**
 * contractCaseActions — Helper zum Anlegen von Vorgängen (contract_cases).
 * Etappe 3b-ii.
 *
 * RLS-Hinweis: Nicht-Admins können nur Cases mit gültiger `contract_id`
 * einer ihnen zugewiesenen Vertrag anlegen. Daher ist contract_id im
 * UI Pflichtfeld, wenn Verträge existieren — Lead-only-Fälle werden
 * dort blockiert.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export interface CreateContractCaseParams {
  customerId: string | null;
  contractId?: string | null;
  caseType: string;
  title: string;
  notes?: string;
  userId: string | null;
  queryClient: QueryClient;
}

export interface CreateContractCaseResult {
  success: boolean;
  error?: string;
  caseId?: string;
}

export async function createContractCase(
  params: CreateContractCaseParams,
): Promise<CreateContractCaseResult> {
  const { customerId, contractId, caseType, title, notes, userId, queryClient } = params;

  try {
    const payload: Record<string, any> = {
      customer_id: customerId,
      contract_id: contractId ?? null,
      case_type: caseType,
      status: "offen",
      title,
      notes: notes ?? null,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("contract_cases" as any)
      .insert(payload)
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    queryClient.invalidateQueries({ queryKey: ["customer-cases"] });
    queryClient.invalidateQueries({ queryKey: ["kundenDialogData"] });
    queryClient.invalidateQueries({ queryKey: ["contract_cases"] });

    return { success: true, caseId: (data as any)?.id };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unbekannter Fehler" };
  }
}

export const CASE_TYPE_LABELS: Record<string, string> = {
  neuabschluss: "Neuabschluss",
  aenderung: "Änderung",
  upgrade: "Upgrade",
  kuendigung: "Kündigung",
  verlaengerung: "Verlängerung",
  support: "Support",
};
