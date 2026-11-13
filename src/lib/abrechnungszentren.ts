// Gemeinsame Liste der Abrechnungszentren für Interessent + Kunde.
// value = label, exakt wie im HubSpot-Formular, damit Formularwerte 1:1 passen.
export const ABRECHNUNGSZENTREN = [
  "nein", "CareCapital", "privadis", "anderes Abrechnungszentrum", "ABZeg", "ABZR", "AeV", "afH", "ALG",
  "ARC", "BFS", "Büdingen-dent", "Büdingen Med", "d.facto", "dentisratio", "dgpar", "Dr. Meindl", "DZR",
  "EOS", "Fabius", "FRH", "GFD", "Health AG", "Helmsauer Gruppe", "HZA", "imex finance", "Indento",
  "Kölner Abrechnungsdienst Heiartz & Vogel oHG", "Lipke & Lipke", "m&m", "MAZ Regensburg",
  "Medas", "Medipay", "Medipay / Z-Easy", "MediServ", "Nelly", "PAS Dr. Hammerl", "PAS Stolzke", "PVB",
  "PVS", "PVS Ba-Wü", "PVS Bremen", "PVS Dental", "PVS Hannover", "PVS Limburg", "PVS MEFA",
  "PVS Mosel-Saar", "PVS Rhein-Ruhr", "PVS Sachsen", "PVS Schleswig-Holstein",
  "PVS Westfalen-Süd", "rodger", "S&F Süddeutsche Factoring", "SF Demedics", "Teamfactor",
  "Unimed", "VfH", "ZA", "ZAB", "ZAG",
] as const;

export const ABRECHNUNGSZENTRUM_DEFAULT = "nein";

/** Exakter Vergleich: nur Werte, die genau so in der Liste stehen, gelten als bekannt. */
export function isKnownAbrechnungszentrum(value: string | null | undefined): boolean {
  return !!value && (ABRECHNUNGSZENTREN as readonly string[]).includes(value);
}
