/**
 * Validates an IBAN using the MOD-97 algorithm (ISO 13616).
 * Returns { valid, message }.
 */
export function validateIban(iban: string): { valid: boolean; message: string } {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();

  if (!cleaned) return { valid: true, message: "" }; // optional field

  // Basic format: 2 letters + 2 digits + up to 30 alphanumeric
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
    return { valid: false, message: "Ungültiges IBAN-Format" };
  }

  // Country-specific length check (common ones)
  const lengths: Record<string, number> = {
    DE: 22, AT: 20, CH: 21, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, LU: 20, GB: 22,
    PL: 28, CZ: 24, DK: 18, SE: 24, NO: 15, FI: 18, PT: 25, IE: 22, GR: 27, HU: 28,
  };
  const country = cleaned.substring(0, 2);
  const expectedLen = lengths[country];
  if (expectedLen && cleaned.length !== expectedLen) {
    return { valid: false, message: `IBAN für ${country} muss ${expectedLen} Zeichen lang sein (aktuell: ${cleaned.length})` };
  }

  // MOD-97 check (ISO 7064)
  const rearranged = cleaned.substring(4) + cleaned.substring(0, 4);
  const numericStr = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : ch;
    })
    .join("");

  // Calculate mod 97 on large number string
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, message: "IBAN-Prüfziffer ist ungültig" };
  }

  return { valid: true, message: "" };
}
