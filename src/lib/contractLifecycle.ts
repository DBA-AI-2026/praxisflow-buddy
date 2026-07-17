/**
 * Zentrale Lifecycle-Helper für Verträge.
 *
 * isWaitingForMandate: Vertrag hängt zwischen "SEPA-Mandat-Mail raus"
 * und "Kunde hat Bankverbindung hinterlegt". Gilt für beide Wege:
 *   - Pfad A (eingegangen): Mail 1 versendet, wartet auf Mandat
 *   - Pfad B (gezeichnet):  Kunde hat über /buchen gebucht, wartet
 *                           noch auf Stripe-SEPA-Bestätigung
 *
 * Voraussetzung: status ∈ {eingegangen, gezeichnet}, mandate_email_sent_at
 * gesetzt, customer_confirmed_at noch NULL.
 */
export function isWaitingForMandate(c: {
  status?: string | null;
  mandate_email_sent_at?: string | null;
  customer_confirmed_at?: string | null;
}): boolean {
  return (
    (c.status === "eingegangen" || c.status === "gezeichnet") &&
    !!c.mandate_email_sent_at &&
    !c.customer_confirmed_at
  );
}

/**
 * Ermittelt die Kündigungsfrist (in Monaten) für eine Vertragserzeugung
 * anhand der ausgewählten Produkte.
 *
 * - Matcht `selectedNames` gegen `products.name` und sammelt deren
 *   `cancellation_period_months`.
 * - Genau ein Treffer → dessen Wert.
 * - Mehrere Treffer → MAX (kein Produkt darf unter-fristet werden).
 * - Kein Treffer / leere Auswahl → Fallback 6 Monate.
 *   Der Fallback entspricht dem bisherigen hartkodierten UI-De-facto-Wert.
 *   Absichtlich NICHT der DB-Default 3 und NICHT 0 (nur GOÄ ist heute 0).
 *
 * Keine hartkodierten Produktnamen — die Zuordnung geschieht ausschließlich
 * über die `products`-Tabelle.
 */
export function getCancellationPeriodForProducts(
  selectedNames: string[],
  products: { name: string; cancellation_period_months: number | null }[],
): number {
  const FALLBACK = 6;
  if (!selectedNames?.length || !products?.length) return FALLBACK;

  const matched = selectedNames
    .map((n) => products.find((p) => p.name === n))
    .filter((p): p is { name: string; cancellation_period_months: number | null } => !!p)
    .map((p) => p.cancellation_period_months)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (matched.length === 0) return FALLBACK;
  return Math.max(...matched);
}
