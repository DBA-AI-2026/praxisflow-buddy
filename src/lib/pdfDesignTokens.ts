/**
 * ⚠ SYNCHRONIZE MIT supabase/functions/_shared/pdfDesignTokens.ts
 *
 * PDF-Design-Tokens für HFX-Vertragsübersicht und (Phase D) Rechnungen.
 *
 * Diese Tokens sind die einzige Quelle für Farben, Schriftgrößen, Abstände
 * und Linien-Stärken in den PDF-Renderern. Änderungen IMMER in beiden Dateien.
 *
 * Stand: C.3a (Infrastruktur). Layout-Werte werden in C.3b angepasst.
 */

// ---------- Brand-Farben ----------
export const COLOR_BRAND_RED = "#b6193d";    // HFX-Rot
export const COLOR_BRAND_NAVY = "#0b367f";   // HFX-Navy

// ---------- Neutrale Palette ----------
export const COLOR_TEXT = "#1a1a1a";         // Haupt-Text
export const COLOR_MUTED = "#6b7280";        // Labels, Footer
export const COLOR_LINE = "#d1d5db";         // Trennlinien (Standard)
export const COLOR_LINE_LIGHT = "#e5e7eb";   // Trennlinien (subtil)
export const COLOR_BG_LIGHT = "#f9fafb";     // Sektions-Hintergrund (heute noch genutzt, in C.3b ggf. weg)

// ---------- Schriftgrößen (Stand C.3a — Helvetica-Werte) ----------
// In C.3b werden die für Exo 2 ggf. angepasst (etwas andere x-Höhe).
export const SIZE_BODY = 9;
export const SIZE_LABEL = 7;
export const SIZE_SECTION_HEADER = 10;
export const SIZE_HEADING = 20;
export const SIZE_FOOTER = 6;

// ---------- Layout ----------
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN_LEFT = 56;
export const MARGIN_RIGHT = 56;

// ---------- Helfer ----------
// rgb()-Tuples für pdf-lib (das nimmt 0-1 Floats, nicht Hex)
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}
