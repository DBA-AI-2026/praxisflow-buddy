/**
 * Loads provider status rows for a set of contracts.
 *
 * The data model is generic (contract_provider_status), but this hook
 * exposes a provider-scoped map for fast lookup in tables.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { ProviderStatusRow } from "@/components/pipeline/QodiaStatusBadges";

interface UseProviderStatusMapOptions {
  contractIds: string[];
  provider?: string;
  enabled?: boolean;
}

/** Returns a Record<contractId, ProviderStatusRow> for the given contracts. */
export function useProviderStatusMap({
  contractIds,
  provider = "qodia",
  enabled = true,
}: UseProviderStatusMapOptions) {
  const idsKey = [...contractIds].sort().join(",");
  return useQuery({
    queryKey: ["provider-status-map", provider, idsKey],
    enabled: enabled && contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_provider_status")
        .select("*")
        .eq("provider", provider)
        .in("contract_id", contractIds);
      if (error) throw error;
      const map: Record<string, ProviderStatusRow> = {};
      (data ?? []).forEach((row: any) => {
        map[row.contract_id] = row as ProviderStatusRow;
      });
      return map;
    },
  });
}

/** Returns the qodia-flag map: { [productName]: boolean } from products.provider_flags. */
export function useProductProviderFlags(provider: string = "qodia") {
  return useQuery({
    queryKey: ["product-provider-flags", provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("name, provider_flags");
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((p: any) => {
        map[p.name] = !!(p.provider_flags && p.provider_flags[provider]);
      });
      return map;
    },
  });
}
