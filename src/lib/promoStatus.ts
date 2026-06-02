/**
 * Promo-Status Helper
 * --------------------
 * Single Source of Truth, ob ein HFX-GOÄ-Vertrag aktuell unter einer aktiven
 * Produkt-Promo läuft.
 *
 * WICHTIG — historische Falle:
 * Vor dieser Funktion wurde im UI per Heuristik `qodia_unit_price === 0`
 * geraten. Diese Heuristik ist gleich doppelt falsch:
 *
 *   1. False Positive bei Datenfehlern:
 *      Pre-System-Verträge mit qodia_unit_price = 0 (z. B. Altdaten vor
 *      Heilung) bekamen ein „Promo"-Badge, obwohl es kein Promo war,
 *      sondern ein Daten-Bug.
 *
 *   2. False Negative bei echter Promo:
 *      Die reale HFX-GOÄ-Einführungspromo ist 0,99 €/Rechnung
 *      (products.promo_price). Korrekte Promo-Verträge bekamen kein Badge.
 *
 * Die einzige verlässliche Quelle ist das Produktpreismodell
 * (products.promo_price, products.promo_end_date). Diese Funktion fragt das
 * Produkt — nicht den Vertrag.
 *
 * Konsistent mit der PDF-Logik in src/lib/contractPdfActions.ts.
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

/**
 * Fallback-Wert für qodia_unit_price, wenn beim Vertrag noch kein Wert
 * gesetzt ist (z. B. neuer Vertrag, leeres Formular).
 *
 * Der Wert entspricht aktuell dem HFX-GOÄ-Promo-Preis aus
 * products.promo_price. Wenn Marketing den Promo-Preis ändert, MUSS
 * dieser Default mit angepasst werden, sonst zeigt das Formular einen
 * veralteten Vorschlagswert.
 *
 * Langfristig sauberer wäre, den Default zur Laufzeit aus der
 * products-Tabelle zu holen. Bis dahin: diese Konstante = SSOT.
 */
export const DEFAULT_QODIA_UNIT_PRICE = 0.99;
