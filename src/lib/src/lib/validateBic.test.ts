import { describe, it, expect } from "vitest";
import { validateBic } from "@/lib/validateBic";

/**
 * Unit-Tests für validateBic().
 *
 * Hinweise zur Implementierung (zur Erinnerung beim späteren Lesen):
 * - Rückgabe ist immer ein Objekt { valid: boolean, message: string }.
 * - Eine LEERE Eingabe (auch reiner Whitespace) gilt bewusst als gültig
 *   (optionales Feld in Formularen).
 * - Whitespace und Kleinbuchstaben werden vor der Prüfung normalisiert.
 * - Die Format-Regex erlaubt ausschließlich exakt 8 oder 11 Zeichen
 *   nach dem Cleaning. Dadurch erzeugen ALLE Längen-Fehler die
 *   Format-Fehlermeldung — nicht die separate Längen-Meldung im Code
 *   (die mit dem aktuellen Regex effektiv toter Code ist).
 * - Es gibt KEINE ISO-3166-Länderliste — eine syntaktisch korrekte,
 *   aber inhaltlich nicht existierende Länderkennung wie "XX" wird
 *   akzeptiert. Ein "ungültiger Ländercode" ist im Sinne dieser
 *   Funktion einer, dessen ZEICHEN-FORMAT (zwei Buchstaben) verletzt ist.
 *
 * Diese Tests greifen NICHT auf Supabase, APIs, Webhooks oder
 * sonstige externe Dienste zu — reine Unit-Tests einer
 * deterministischen Pure-Function.
 */
describe("validateBic", () => {
  // ---------- Gültige BICs ----------

  describe("gültige BICs", () => {
    it("akzeptiert einen gültigen 8-Zeichen-BIC (Commerzbank)", () => {
      const result = validateBic("COBADEFF");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen 11-Zeichen-BIC (Commerzbank, Hauptstelle)", () => {
      const result = validateBic("COBADEFFXXX");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen 8-Zeichen-BIC mit Ziffer im Location-Code", () => {
      // BayernLB München — Location-Code 'M1' (Ziffer erlaubt an Stelle 7-8)
      const result = validateBic("MARKDEF1");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen 11-Zeichen-BIC mit Ziffern im Branch-Code", () => {
      // Deutsche Bank, Filial-Branch 500
      const result = validateBic("DEUTDEFF500");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen BIC in Kleinbuchstaben (8 Zeichen)", () => {
      const result = validateBic("cobadeff");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen BIC in Kleinbuchstaben (11 Zeichen)", () => {
      const result = validateBic("cobadeffxxx");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert einen gültigen BIC mit Leerzeichen", () => {
      // 4er-Block-Schreibweise (so steht es manchmal auf Kontoauszügen)
      const result = validateBic("COBA DEFF XXX");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Leere / weggelassene Eingabe ----------

  describe("leere Eingabe", () => {
    it("behandelt einen leeren String als gültig (optionales Feld)", () => {
      const result = validateBic("");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("behandelt einen reinen Whitespace-String als gültig (optionales Feld)", () => {
      // Wird nach .replace(/\s/g, '') zu '' und greift damit den Optional-Pfad
      const result = validateBic("   ");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Falsche Länge ----------

  describe("ungültige Länge", () => {
    // Hinweis: alle Längen-Fehler werden vom Format-Regex abgefangen,
    // bevor die separate Längen-Prüfung greift. Erwartete Meldung
    // ist daher die Format-Meldung.

    it("lehnt einen BIC mit 7 Zeichen ab (zu kurz)", () => {
      const result = validateBic("COBADEF");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });

    it("lehnt einen BIC mit 9 Zeichen ab (weder 8 noch 11)", () => {
      const result = validateBic("COBADEFF1");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });

    it("lehnt einen BIC mit 10 Zeichen ab (weder 8 noch 11)", () => {
      const result = validateBic("COBADEFFXX");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });

    it("lehnt einen BIC mit 12 Zeichen ab (zu lang)", () => {
      const result = validateBic("COBADEFFXXX1");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });
  });

  // ---------- Sonderzeichen ----------

  describe("Sonderzeichen", () => {
    it("lehnt einen BIC mit Bindestrich ab", () => {
      const result = validateBic("COBA-DEFF");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });

    it("lehnt einen BIC mit Punkt ab", () => {
      const result = validateBic("COBA.DEFF");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });
  });

  // ---------- Ungültiger Ländercode ----------

  describe("ungültiger Ländercode", () => {
    // Die Funktion prüft keine ISO-3166-Länderliste. "Ungültig" heißt
    // hier: das Zeichen-Format des Ländercode-Felds (zwei Buchstaben
    // an Position 5-6) ist verletzt.

    it("lehnt einen BIC ab, in dem der Ländercode eine Ziffer enthält", () => {
      // Position 6 ist '3' statt eines Buchstabens
      const result = validateBic("COBAD3FF");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });

    it("lehnt einen BIC ab, dessen Ländercode nur einen Buchstaben hat", () => {
      // Position 6 ist '0' statt zweiter Länderbuchstabe
      const result = validateBic("COBAD0FFXXX");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });
  });

  // ---------- Falsches Format (sonstiges) ----------

  describe("falsches Format", () => {
    it("lehnt einen BIC ab, in dem das Bank-Präfix Ziffern enthält", () => {
      // Erste 4 Zeichen müssen Buchstaben sein
      const result = validateBic("COB1DEFF");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges BIC-Format (z.B. COBADEFFXXX)");
    });
  });
});
