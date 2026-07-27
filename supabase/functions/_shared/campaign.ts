// _shared/campaign.ts — Geteiltes Kampagnen-Modul (GOÄ-Konvertierungs-Kampagne)
//
// Zweck: Kanonische Konstanten und Helper für alle Kampagnen-Functions
// (campaign-token-issue, campaign-start, campaign-mail-send).
//
// Abgrenzung: `campaign-mint-runner` (Weg-A-Altbestand) verwendet EIGENE
// Konstante `CAMPAIGN_ID = "goae_mint_2026_07"` und wird bewusst NICHT auf
// dieses Modul umgestellt — Entsorgungskandidat, siehe SYNCHRONIZE-Kommentar
// in campaign-start/index.ts.

export const CAMPAIGN_ID = "goae_conversion_2026";

// SYNCHRONIZE: qodia-initiate-booking → VALID_PRODUCTS. Ein Produkt,
// hartkodiert. Bei Produktnamens-Wechsel BEIDE Stellen anfassen.
export const CAMPAIGN_PRODUCT = "HFX GOÄ - die KI für ihre Privatabrechnung";

export const CAMPAIGN_URL_ORIGIN = "https://sales.hfx-honorarfuchs.de";

export const TOKEN_PREFIX = "hfxc_";

// Allowlist: alle Lead-Status, die einen Kampagnen-Klick einlösen dürfen.
// `vertrag` bleibt drin (Reuse-Pfad in qodia-initiate-booking).
export const ALLOWED_LEAD_STATUSES = [
  "neu",
  "kontaktiert",
  "qualifiziert",
  "vertrag",
];

// Zielmenge des Mailversands. MUSS Teilmenge von
// ALLOWED_LEAD_STATUSES sein — sonst bekommen Empfänger einen Link,
// den campaign-start Gate 4 auf /kampagne-info abweist.
export const MAIL_ELIGIBLE_STATUSES = [
  "neu",
  "kontaktiert",
  "qualifiziert",
  "vertrag",
];

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Erzeugt einen 32-Byte Kampagnen-Token mit Prefix `hfxc_`. */
export function generateCampaignToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + toBase64Url(bytes);
}

/** Fertiger /kampagne-Link auf der Produktivdomain. */
export function buildCampaignUrl(token: string): string {
  return `${CAMPAIGN_URL_ORIGIN}/kampagne?token=${encodeURIComponent(token)}`;
}

/**
 * Stellt sicher, dass ein Lead einen campaign_token besitzt. Idempotent:
 *  - Existierender Token → reused: true (kein Schreibvorgang).
 *  - Sonst neuer Token via generateCampaignToken(), Schreibvorgang mit
 *    Race-Guard .is("campaign_token", null), anschließender Read-Back.
 *
 * Wirft bei Fehlschlag. Token wird NIEMALS geloggt.
 */
export async function ensureCampaignToken(
  // deno-lint-ignore no-explicit-any
  admin: any,
  leadId: string,
): Promise<{ token: string; reused: boolean }> {
  const { data: existing, error: fErr } = await admin
    .from("leads")
    .select("campaign_token")
    .eq("id", leadId)
    .maybeSingle();
  if (fErr) throw new Error(`campaign token lookup failed: ${fErr.message}`);

  if (existing?.campaign_token) {
    return { token: existing.campaign_token as string, reused: true };
  }

  const newToken = generateCampaignToken();
  const { error: uErr } = await admin
    .from("leads")
    .update({
      campaign_token: newToken,
      campaign_token_created_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .is("campaign_token", null); // Race-Guard
  if (uErr) throw new Error(`campaign token write failed: ${uErr.message}`);

  const { data: after, error: aErr } = await admin
    .from("leads")
    .select("campaign_token")
    .eq("id", leadId)
    .maybeSingle();
  if (aErr || !after?.campaign_token) {
    throw new Error("campaign token read-back failed");
  }
  // Race-Fall: parallel wurde ein anderer Token gewonnen — dann diesen zurück.
  const finalToken = after.campaign_token as string;
  return { token: finalToken, reused: finalToken !== newToken };
}
