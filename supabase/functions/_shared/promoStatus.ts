/**
 * Promo-Status Helper (Edge-Function-Spiegel)
 * --------------------------------------------
 * Deno-kompatible Kopie von src/lib/promoStatus.ts. Single Source of Truth,
 * ob ein HFX-GOÄ-Vertrag aktuell unter einer aktiven Produkt-Promo läuft.
 *
 * Hintergrund (siehe src/lib/promoStatus.ts für die Langfassung):
 *  - Heuristik `qodia_unit_price === 0` ist doppelt falsch (False-Positives
 *    bei Daten-Bugs, False-Negatives bei echter 0,99-€-Promo).
 *  - Verlässlich ist nur: Produktpreismodell (products.promo_price /
 *    products.promo_end_date) gegen vertraglich vereinbarten Stückpreis.
 *
 * Edge Functions können nicht direkt aus `src/` importieren — daher diese
 * Spiegelung. Bei Änderungen beide Stellen synchron halten.
 */
export interface PromoProductLike {
  promo_price: number | null;
  promo_end_date: string | null;
  promo_price_label?: string | null;
}

export interface PromoContractLike {
  qodia_unit_price: number | null;
}

export function isContractPromoActive(
  contract: PromoContractLike,
  product: PromoProductLike | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!product?.promo_price || !product?.promo_end_date) return false;
  if (new Date(product.promo_end_date) < today) return false;
  return Number(contract.qodia_unit_price ?? 0) === Number(product.promo_price);
}
