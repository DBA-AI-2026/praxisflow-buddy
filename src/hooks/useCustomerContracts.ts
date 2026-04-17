/**
 * Builds a `customer_id → contracts[]` map.
 *
 * Performance note (Pipeline / Kunden tab):
 * The Kunden tab already loads ALL contracts in scope (statuses aktiv,
 * gekuendigt, beendet) for the user/team via its own query. A second
 * round-trip to fetch contracts per customer would be redundant and
 * scale linearly with the number of visible customers.
 *
 * We therefore aggregate client-side from the already-loaded contract
 * list. The hook signature stays stable so a later move to a dedicated
 * RPC (e.g. when the schema introduces contract_products / product_id)
 * can swap the implementation without touching the consumer.
 */
import { useMemo } from "react";

export interface CustomerContractRow {
  id: string;
  customer_id: string | null;
  product_name: string;
  status: string;
}

/** Statuses considered "currently held" for product-badge display. */
const ACTIVE_STATUSES = new Set(["aktiv", "gekuendigt"]);

/**
 * Group an already-loaded contracts array by customer_id, keeping only
 * statuses relevant for the product-badge display.
 */
export function useCustomerContractsMap(contracts: CustomerContractRow[]) {
  return useMemo(() => {
    const map: Record<string, CustomerContractRow[]> = {};
    for (const row of contracts) {
      if (!row.customer_id) continue;
      if (!ACTIVE_STATUSES.has(row.status)) continue;
      (map[row.customer_id] ??= []).push(row);
    }
    return map;
  }, [contracts]);
}
