/**
 * useCarrierMap — Map customer_id → base_fee_contract_id (Trägervertrag).
 *
 * Zentrale Quelle für die Standortvertrag-Erkennung (Weg A).
 * NULL-sicher: customers ohne base_fee_contract_id (Altverträge / kein Träger
 * gesetzt) tauchen nicht in der Map auf → kein Carrier → kein Badge, kein Crash.
 *
 * Ersetzt die dreifach duplizierte Inline-Query in Vertraege/PraxenJourney/VertragTab.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export type CarrierMap = Record<string, string>;

export function useCarrierMap() {
  return useQuery<CarrierMap>({
    queryKey: ["carrier-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, base_fee_contract_id")
        .not("base_fee_contract_id", "is", null);
      if (error) throw error;
      const map: CarrierMap = {};
      for (const c of data || []) {
        if (c.base_fee_contract_id) map[c.id] = c.base_fee_contract_id;
      }
      return map;
    },
    staleTime: 60_000,
  });
}
