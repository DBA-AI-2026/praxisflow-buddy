/**
 * Multi-Standort (Hauptaccount/Subaccount) — Helper.
 *
 * Geteiltes Stripe-Mandat pro Hauptaccount (customers.stripe_customer_id),
 * Grundgebühr + AD-Signup-Bonus nur auf dem Träger-Vertrag
 * (customers.base_fee_contract_id). Standorte werden als zusätzliche GOÄ-
 * Verträge unter demselben customers-Eintrag geführt.
 *
 * Single Source of Truth für die GOÄ-Erkennung. Wiederverwendet die bestehende
 * Regex /GOÄ|GOA/i, statt eine neue Ad-hoc-Prüfung einzuführen.
 */

export const GOAE_PRODUCT_REGEX = /GOÄ|GOA/i;

export function isGoaeProduct(productName: string | null | undefined): boolean {
  if (!productName) return false;
  return GOAE_PRODUCT_REGEX.test(productName);
}

/**
 * Trägervertrag-Bedingung: nur auf dem Träger feuern Grundgebühr und
 * AD-Signup-Bonus. NULL-Behandlung wichtig: Wenn noch kein Träger gesetzt ist
 * (z. B. Erstvertrag), wird der aktuelle Vertrag als Träger behandelt.
 * Self-Heal in den Aktivierungs-/Stripe-Pfaden schreibt das Feld später fest.
 */
export function isCarrierContract(
  contractId: string,
  customerBaseFeeContractId: string | null | undefined,
): boolean {
  return !customerBaseFeeContractId || customerBaseFeeContractId === contractId;
}

/**
 * Erkennt Standort-HFX im Format `{base}-NN` (Phase 1b).
 * Hauptaccount: "HFX-I01070" (ein Bindestrich). Standort: "HFX-I01070-01"
 * (zwei Bindestriche, Suffix `-\d{2}`). Demo-/Legacy-HFX (HFX-D…, HFX-…)
 * tragen ebenfalls nur einen Bindestrich und gelten daher nie als Standort.
 */
export function isStandortHfx(hfx: string | null | undefined): boolean {
  if (!hfx) return false;
  return /^HFX-[A-Z0-9]+-\d{2}$/i.test(hfx);
}

/**
 * Dedup-Schlüssel für die Kunden-Zählung (#17 Phase 3).
 * Contract-vs-Customer: mehrere Verträge (Träger + Standorte) gehören zu einem
 * Kunden. Primärschlüssel ist `customer_id`; Altzeilen ohne customer_id fallen
 * auf `hfx_customer_number` und zuletzt auf den Praxis-/Kundennamen zurück.
 */
export function customerKey(c: {
  customer_id?: string | null;
  hfx_customer_number?: string | null;
  praxis?: string | null;
  customer_name?: string | null;
}): string {
  if (c.customer_id) return `cust:${c.customer_id}`;
  if (c.hfx_customer_number) return `hfx:${c.hfx_customer_number}`;
  return `name:${(c.praxis || c.customer_name || "").toLowerCase().trim()}`;
}

/** Anzahl distinkter Kunden in einer Vertragsliste. */
export function countDistinctCustomers(contracts: Parameters<typeof customerKey>[0][]): number {
  const seen = new Set<string>();
  for (const c of contracts) seen.add(customerKey(c));
  return seen.size;
}
