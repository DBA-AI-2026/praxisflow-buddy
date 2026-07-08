// Zentrale Zweck-Labels für Provisions-Auszahlungen (Dashboard, PDF, CSV).
// Einzige Wahrheitsquelle für payout_trigger → menschenlesbares Label.

export type PayoutTrigger =
  | "contract_signup"
  | "usage_revenue"
  | "tippgeber_milestone"
  | string
  | null
  | undefined;

export function payoutPurposeLabel(trigger: PayoutTrigger): string {
  switch (trigger) {
    case "contract_signup":
      return "Abschlussprovision";
    case "usage_revenue":
      return "Verbrauchsprovision";
    case "tippgeber_milestone":
      return "Tippgeber-Prämie";
    default:
      return "Provision";
  }
}

/**
 * Optionaler Sub-Zeilen-Text "<HFX-Nr> · <Kundenname>".
 * Kunde per Coalesce: customer_name ?? praxis ?? "".
 * Gibt leeren String zurück, wenn weder HFX-Nr. noch Kunde vorliegen.
 */
export function payoutPurposeLine(contracts: {
  hfx_customer_number?: string | null;
  customer_name?: string | null;
  praxis?: string | null;
} | null | undefined): string {
  const hfx = contracts?.hfx_customer_number?.trim() || "";
  const name = (contracts?.customer_name ?? contracts?.praxis ?? "")?.toString().trim();
  if (hfx && name) return `${hfx} · ${name}`;
  return hfx || name || "";
}
