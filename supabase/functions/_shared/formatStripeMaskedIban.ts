/**
 * Erzeugt eine maskierte SEPA-IBAN-Anzeige aus Stripe-Daten.
 *
 * Stripe liefert für sepa_debit nur `country` (ISO-2) und `last4`,
 * niemals die volle IBAN (PCI/SEPA-Regulation). Diese Funktion
 * baut die Anzeige-IBAN nach dem Schema:
 *
 *   DE** **** **** **** **30 00
 *
 * — Land + ICs maskiert, Quartette mit •/* ersetzt, letzte 4 Ziffern sichtbar
 * (geteilt in 2+2 für Lesbarkeit).
 *
 * Wird sowohl im stripe-webhook (Live-Befüllung bei Mandat-Erteilung) als
 * auch im backfill-sepa-iban (manueller Re-Run) verwendet — SSOT.
 *
 * Hinweis: Die hier erzeugte Maske wird vom PDF-Renderer NICHT erneut
 * durch maskIban() geschickt. Vorrang-Regel:
 *   contracts.iban_masked  → 1:1 ausgeben
 *   contracts.iban (voll)  → durch maskIban("partial"|"compact")
 */
export function formatStripeMaskedIban(input: {
  country?: string | null;
  last4?: string | null;
}): string | null {
  const country = String(input.country ?? "").trim().toUpperCase();
  const last4 = String(input.last4 ?? "").trim();
  if (country.length !== 2 || last4.length !== 4) return null;
  // Format: CC** **** **** **** **XX XX
  return `${country}** **** **** **** **${last4.slice(0, 2)} ${last4.slice(2, 4)}`;
}
