// ============================================================================
// entityCanon.ts — SSOT für die kundensichtbare Entität-Tagline (Deno)
// ============================================================================
// ⚠ SYNCHRONIZE mit src/lib/entityCanon.ts — beide Konstanten müssen wortgleich
// bleiben (Literal-Halbgeviertstrich "–", KEIN "&ndash;", KEIN Geviertstrich "—").
// Verwendung: alle kundensichtbaren Tagline-Stellen (Mail-Footer, PDF-Header/
// -Footer, Landing-Pages, Prosa in Buchen.tsx) importieren ausschließlich
// ENTITY_TAGLINE. Reine Firmen-Rechtszeilen (Impressum, HRB, Anschrift) sind
// bewusst NICHT hier abgebildet und bleiben separat.
// ============================================================================

export const ENTITY_TAGLINE =
  "HFX Honorarfuchs – ein Angebot von MCC Medical CareCapital GmbH";
