/**
 * useQodiaProducts
 * -----------------
 * Lädt Produktdaten (insbesondere Promo-Felder) für eine Menge von
 * product_name-Strings. Wird vom Qodia-Verbrauchs-UI verwendet, um echte
 * Promo-Aktivität anzuzeigen statt der alten Heuristik
 * `qodia_unit_price === 0` (siehe src/lib/promoStatus.ts).
 *
 * Muster analog zu useProviderStatusMap: Liefert eine Map keyed by
 * product_name für O(1)-Lookup im UI.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { PromoProductLike } from "@/lib/promoStatus";

export interface QodiaProductInfo extends PromoProductLike {
  name: string;
}

export function useQodiaProducts(productNames: string[]) {
  const uniqueNames = Array.from(new Set(productNames.filter(Boolean))).sort();
  const key = uniqueNames.join("|");

  const query = useQuery({
    queryKey: ["qodia-products-promo", key],
    enabled: uniqueNames.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("name, promo_price, promo_end_date, promo_price_label")
        .in("name", uniqueNames);
      if (error) throw error;
      const map = new Map<string, QodiaProductInfo>();
      for (const row of data ?? []) {
        map.set(row.name, row as QodiaProductInfo);
      }
      return map;
    },
  });

  return {
    productMap: query.data ?? new Map<string, QodiaProductInfo>(),
    isLoading: query.isLoading,
  };
}
