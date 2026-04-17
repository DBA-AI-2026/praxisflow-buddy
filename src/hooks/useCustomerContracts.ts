/**
 * Loads all contracts for a set of customer IDs, grouped by customer_id.
 *
 * Used in the Pipeline (Kunden tab) to display ALL active products a
 * customer holds — not just the row's own contract — without introducing
 * a parallel data source. When the schema later moves from
 * contracts.product_name to a contract_products / product_id model, only
 * this hook (and the mapping in the consumer) needs to change.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export interface CustomerContractRow {
  id: string;
  customer_id: string | null;
  product_name: string;
  status: string;
}

const ACTIVE_STATUSES = ["aktiv", "gekuendigt"];

export function useCustomerContractsMap(customerIds: string[], enabled = true) {
  const idsKey = [...customerIds].filter(Boolean).sort().join(",");
  return useQuery({
    queryKey: ["customer-contracts-map", idsKey],
    enabled: enabled && customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, customer_id, product_name, status")
        .in("customer_id", customerIds)
        .in("status", ACTIVE_STATUSES);
      if (error) throw error;
      const map: Record<string, CustomerContractRow[]> = {};
      (data ?? []).forEach((row: any) => {
        if (!row.customer_id) return;
        (map[row.customer_id] ??= []).push(row as CustomerContractRow);
      });
      return map;
    },
  });
}
