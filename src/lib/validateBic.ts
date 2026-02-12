/**
 * Validates a BIC/SWIFT code (ISO 9362).
 * Format: 4 letters (bank) + 2 letters (country) + 2 alphanumeric (location) + optional 3 alphanumeric (branch).
 */
export function validateBic(bic: string): { valid: boolean; message: string } {
  const cleaned = bic.replace(/\s/g, "").toUpperCase();

  if (!cleaned) return { valid: true, message: "" }; // optional field

  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)) {
    return { valid: false, message: "Ungültiges BIC-Format (z.B. COBADEFFXXX)" };
  }

  if (cleaned.length !== 8 && cleaned.length !== 11) {
    return { valid: false, message: "BIC muss 8 oder 11 Zeichen lang sein" };
  }

  return { valid: true, message: "" };
}
