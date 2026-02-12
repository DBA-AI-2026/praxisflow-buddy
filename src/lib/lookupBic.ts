/**
 * Fetches BIC from a valid IBAN using the OpenIBAN API (free, no key required).
 * Only attempts lookup for IBANs that pass basic format validation.
 */
export async function lookupBicFromIban(iban: string): Promise<string | null> {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!cleaned || cleaned.length < 15) return null;

  try {
    const res = await fetch(`https://openiban.com/validate/${cleaned}?getBIC=true`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.valid && json.bankData?.bic) {
      return json.bankData.bic;
    }
    return null;
  } catch {
    return null;
  }
}
