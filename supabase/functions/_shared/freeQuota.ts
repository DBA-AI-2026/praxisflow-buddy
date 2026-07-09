// Free-Quota-/Effektivnetto-Formel – EXTRAHIERT AUS auto-invoice/index.ts.
// Reiner Move der Formel: gemischte unit_prices → Perioden-Durchschnittspreis,
// Frei-Abzug einmal auf Perioden-Summe, Rundung auf 2 Nachkommastellen.
//
// Motor bleibt in auto-invoice/index.ts, dieser Baustein wird von auto-invoice
// UND commission-forecast/index.ts geteilt. KEINE Logikänderung erlaubt.
//
// SYNCHRONISATION: Der Description-Prefix "Freikontingent-Abzug" ist
// API-relevant (Retry-Pfad processFailedInvoiceRetry in auto-invoice erkennt
// diesen Posten per description.startsWith(...) + unit_price < 0).

export interface RawUsageCharge {
  id: string;
  quantity: number | string;
  unit_price: number | string;
  unit_description?: string | null;
}

export interface UsagePosition {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface EffectiveUsageResult {
  usageChargeIds: string[];
  /** Netto NACH Freikontingent-Abzug (Provisions-/FiBu-Basis). */
  usageNetAmount: number;
  /** Roher Netto vor Abzug (nur informativ). */
  usageNetAmountRaw: number;
  periodUsageQty: number;
  /** grantsTotal - usageInvoicedPrior, min 0. */
  saldo: number;
  freiQty: number;
  grantDeductionNet: number;
  /** Rechnungspositionen inkl. Abzugsposten in Reihenfolge (usage lines, dann Abzug). */
  positions: UsagePosition[];
}

/**
 * Reine Funktion. Alle DB-Reads führt der Aufrufer aus und übergibt Rohdaten.
 * VERBATIM identisch zur ursprünglichen Inline-Berechnung in auto-invoice/index.ts.
 */
export function computeEffectiveUsageNet(
  charges: RawUsageCharge[],
  grantsTotal: number,
  usageInvoicedPrior: number,
  billingPeriod: string,
): EffectiveUsageResult {
  const usageChargeIds: string[] = [];
  const positions: UsagePosition[] = [];
  let usageNetAmount = 0;
  let periodUsageQty = 0;

  for (const uc of charges) {
    const qty = Number(uc.quantity);
    const price = Number(uc.unit_price);
    const lineNet = qty * price;
    usageNetAmount += lineNet;
    periodUsageQty += Number(uc.quantity) || 0;
    usageChargeIds.push(uc.id);
    positions.push({
      description: uc.unit_description || `Geprüfte GOÄ-Rechnungen (HFX GOÄ) – ${billingPeriod}`,
      quantity: qty,
      unit_price: price,
    });
  }

  const usageNetAmountRaw = usageNetAmount;
  const saldo = Math.max(0, grantsTotal - usageInvoicedPrior);
  const freiQty = Math.min(periodUsageQty, saldo);
  let grantDeductionNet = 0;

  if (freiQty > 0 && usageNetAmount > 0 && periodUsageQty > 0) {
    const avgUnitPrice = usageNetAmount / periodUsageQty;
    grantDeductionNet = Math.round(freiQty * avgUnitPrice * 100) / 100;
    positions.push({
      description: `Freikontingent-Abzug (${freiQty} Rechnungen à ${avgUnitPrice.toFixed(2)} €) – ${billingPeriod}`,
      quantity: 1,
      unit_price: -grantDeductionNet,
    });
    usageNetAmount = Math.round((usageNetAmount - grantDeductionNet) * 100) / 100;
  }

  return {
    usageChargeIds,
    usageNetAmount,
    usageNetAmountRaw,
    periodUsageQty,
    saldo,
    freiQty,
    grantDeductionNet,
    positions,
  };
}
