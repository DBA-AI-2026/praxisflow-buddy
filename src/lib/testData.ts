/**
 * SSOT für Testdaten-Erkennung im Client.
 *
 * Erkennt Testmandanten anhand der HFX-Kundennummer (case-insensitiv, Prefix-Match).
 * Backend-Inline-Ausschlüsse (commission-forecast, stripe-webhook, backfill-sepa-iban)
 * dürfen später auf diese Logik konsolidiert werden.
 */
const TEST_HFX_PREFIXES = ["hfx-i01070", "test-harness"];

export function isTestHfx(hfx: string | null | undefined): boolean {
  if (!hfx) return false;
  const v = hfx.trim().toLowerCase();
  return TEST_HFX_PREFIXES.some((p) => v.startsWith(p));
}
