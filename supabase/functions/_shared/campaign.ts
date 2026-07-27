// _shared/campaign.ts — Geteiltes Kampagnen-Modul (GOÄ-Konvertierungs-Kampagne)
//
// Zweck: Kanonische Konstanten und Helper für alle Kampagnen-Functions
// (campaign-token-issue, campaign-start, campaign-mail-send). Reine
// Extraktion — Werte 1:1 aus den vorherigen Inline-Definitionen übernommen.
//
// Abgrenzung: `campaign-mint-runner` (Weg-A-Altbestand) verwendet EIGENE
// Konstante `CAMPAIGN_ID = "goae_mint_2026_07"` und wird bewusst NICHT auf
// dieses Modul umgestellt — Entsorgungskandidat, siehe SYNCHRONIZE-Kommentar
// in campaign-start/index.ts.

export const CAMPAIGN_ID = "goae_conversion_2026";

export const CAMPAIGN_PRODUCT = "HFX GOÄ - die KI für ihre Privatabrechnung";

// SYNCHRONIZE: qodia-initiate-booking → VALID_PRODUCTS. Ein Produkt,
// hartkodiert. Bei Produktnamens-Wechsel BEIDE Stellen anfassen.

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
