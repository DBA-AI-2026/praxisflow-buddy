/**
 * ⚠ SYNCHRONIZE MIT src/lib/pdfDesignTokens.ts
 *
 * PDF-Design-Tokens für HFX-Vertragsübersicht und (Phase D) Rechnungen.
 *
 * Diese Tokens sind die einzige Quelle für Farben, Schriftgrößen, Abstände
 * und Linien-Stärken in den PDF-Renderern. Änderungen IMMER in beiden Dateien.
 *
 * Stand: C.3b (Layout-Modernisierung — SaaS-Stil, Bänder weg, Tabellen-Stil).
 */

// ---------- Brand-Farben ----------
export const COLOR_BRAND_RED = "#b6193d";    // HFX-Rot (Akzent AKTIONSPREIS)
export const COLOR_BRAND_NAVY = "#0b367f";   // HFX-Navy (Sektions-Titel)

// ---------- Neutrale Palette ----------
export const COLOR_TEXT = "#1a1a1a";         // Haupt-Text (Werte)
export const COLOR_MUTED = "#6b7280";        // Labels, Footer
export const COLOR_LINE = "#d1d5db";         // Trennlinien (Sektion)
export const COLOR_LINE_LIGHT = "#e5e7eb";   // Trennlinien zwischen Tabellen-Reihen

// ---------- Akzent-Farben für spezifische Sektionen ----------
export const COLOR_SECTION_TITLE = COLOR_BRAND_NAVY;  // Standard-Sektions-Titel
export const COLOR_ACCENT_PROMO = COLOR_BRAND_RED;    // AKTIONSPREIS-Hervorhebung

// ---------- Schriftgrößen ----------
export const SIZE_HEADING = 22;          // VERTRAGSÜBERSICHT
export const SIZE_SECTION_TITLE = 11;    // Sektions-Überschriften (ohne Band)
export const SIZE_LABEL = 8;             // Tabellen-Labels (links, grau)
export const SIZE_VALUE = 9.5;           // Tabellen-Werte (rechts, schwarz)
export const SIZE_BODY = 9;              // Fließtext (Closing, Bullets)
export const SIZE_FOOTER = 6;

// ---------- Layout ----------
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN_LEFT = 56;
export const MARGIN_RIGHT = 56;

// ---------- Layout-Konstanten (C.3b SaaS-Stil) ----------
export const SECTION_GAP_BEFORE = 18;
export const SECTION_GAP_AFTER = 10;
export const SECTION_LINE_THICKNESS = 0.6;
export const ROW_HEIGHT = 22;
export const ROW_LINE_THICKNESS = 0.4;
export const LABEL_COL_WIDTH_RATIO = 0.35;

// ---------- Helfer ----------
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}
