// ⚠ SYNCHRONIZE MIT src/lib/multiLocation.ts
// Änderungen an Konstanten/Funktionen IMMER in beiden Dateien anpassen.
//
// Multi-Standort (Hauptaccount/Subaccount) — Helper (Deno-Spiegel).
// Edge Functions können nicht direkt aus `src/` importieren — daher diese
// Kopie. Bei Änderungen beide Stellen synchron halten.

export const GOAE_PRODUCT_REGEX = /GOÄ|GOA/i;

export function isGoaeProduct(productName: string | null | undefined): boolean {
  if (!productName) return false;
  return GOAE_PRODUCT_REGEX.test(productName);
}

/**
 * Trägervertrag-Bedingung. NULL-Sicherheit ist Pflicht:
 *  - customer_id IS NULL          → keine Kunden-Verknüpfung → als Träger
 *  - base_fee_contract_id IS NULL → noch kein Träger gesetzt → als Träger
 *  - sonst: nur wenn contractId === base_fee_contract_id
 *
 * Altverträge ohne customer-Verknüpfung dürfen so nie still Grundgebühr
 * oder AD-Signup-Bonus verlieren.
 */
export function isCarrierContract(
  contractId: string,
  customerId: string | null | undefined,
  customerBaseFeeContractId: string | null | undefined,
): boolean {
  if (!customerId) return true;
  if (!customerBaseFeeContractId) return true;
  return customerBaseFeeContractId === contractId;
}

/**
 * Erkennt Standort-HFX im Format `{base}-NN` (Phase 1b). Siehe src/lib/multiLocation.ts.
 */
export function isStandortHfx(hfx: string | null | undefined): boolean {
  if (!hfx) return false;
  return /^HFX-[A-Z0-9]+-\d{2}$/i.test(hfx);
}

/**
 * Self-Heal-Helper für customers.stripe_customer_id.
 * Leitet den Kunden aus dem gerade geschriebenen Vertrag ab (contract.customer_id).
 * Niemals breit über WHERE stripe_customer_id = X. Bei NULL customer_id: Skip.
 * NULL-only Race-Guard: setzt nur, wenn auf customers noch IS NULL.
 */
export async function healCustomerStripeId(
  supabase: any,
  contractCustomerId: string | null | undefined,
  stripeCustomerId: string | null | undefined,
): Promise<void> {
  if (!contractCustomerId || !stripeCustomerId) return;
  try {
    await supabase
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", contractCustomerId)
      .is("stripe_customer_id", null);
  } catch (ex) {
    console.warn("[multiLocation] healCustomerStripeId non-fatal:", String(ex));
  }
}
