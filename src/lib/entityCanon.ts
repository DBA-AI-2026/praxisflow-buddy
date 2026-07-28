// ============================================================================
// entityCanon.ts — SSOT für die kundensichtbare Entität-Tagline (Frontend)
// ============================================================================
// ⚠ SYNCHRONIZE mit supabase/functions/_shared/entityCanon.ts — beide
// Konstanten müssen wortgleich bleiben (Literal-Halbgeviertstrich "–",
// KEIN "&ndash;", KEIN Geviertstrich "—").
// Verwendung: alle kundensichtbaren Tagline-Stellen (PDFs, Landing-Pages,
// EmailPreview-Mocks, Buchen-Prosa) importieren ausschließlich ENTITY_TAGLINE.
// Reine Firmen-Rechtszeilen (Impressum, HRB, Anschrift) sind bewusst NICHT
// hier abgebildet und bleiben separat.
// ============================================================================

export const ENTITY_TAGLINE =
  "HFX Honorarfuchs – ein Angebot von MCC Medical CareCapital GmbH";
