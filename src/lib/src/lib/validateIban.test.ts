import { describe, it, expect } from "vitest";
import { validateIban } from "@/lib/validateIban";

/**
 * Unit-Tests für validateIban().
 *
 * Hinweis: validateIban liefert ein Objekt { valid, message }.
 * Eine LEERE Eingabe gilt bewusst als gültig (optionales Feld).
 *
 * Diese Tests greifen NICHT auf Supabase, APIs, Webhooks oder
 * sonstige externe Dienste zu — reine Unit-Tests einer
 * deterministischen Pure-Function.
 */
describe("validateIban", () => {
  // ---------- Gültige IBANs ----------

  describe("gültige IBANs", () => {
    it("akzeptiert eine gültige deutsche IBAN", () => {
      // Offizielle Test-IBAN aus der Deutschen Bundesbank-Doku
      const result = validateIban("DE89370400440532013000");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige IBAN mit Leerzeichen (4er-Blöcke)", () => {
      // Gleiche IBAN wie oben, nur formatiert wie auf einem Kontoauszug
      const result = validateIban("DE89 3704 0044 0532 0130 00");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige IBAN in Kleinbuchstaben", () => {
      const result = validateIban("de89370400440532013000");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige österreichische IBAN", () => {
      // Offizielle Test-IBAN AT
      const result = validateIban("AT611904300234573201");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Leere / weggelassene Eingabe ----------

  describe("leere Eingabe", () => {
    it("behandelt einen leeren String als gültig (optionales Feld)", () => {
      const result = validateIban("");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("behandelt einen reinen Whitespace-String als gültig (optionales Feld)", () => {
      // Wird nach .replace(/\s/g, '') zu '' und greift damit den Optional-Pfad
      const result = validateIban("   ");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Falsches Format ----------

  describe("falsches Format", () => {
    it("lehnt eine IBAN ohne Länderpräfix ab", () => {
      const result = validateIban("89370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine IBAN mit Sonderzeichen ab", () => {
      const result = validateIban("DE89-3704-0044-0532-0130-00");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine viel zu kurze IBAN ab", () => {
      const result = validateIban("DE89");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine IBAN mit Buchstaben statt Prüfziffern ab", () => {
      // Stellen 3-4 müssen Ziffern sein, hier stehen Buchstaben
      const result = validateIban("DEAB370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine deutsche IBAN mit falscher Länge ab", () => {
      // DE muss exakt 22 Zeichen haben — hier nur 21 (eine Ziffer fehlt)
      const result = validateIban("DE8937040044053201300");

      expect(result.valid).toBe(false);
      expect(result.message).toContain("DE");
      expect(result.message).toContain("22");
    });
  });

  // ---------- Falsche Prüfziffer (MOD-97 schlägt fehl) ----------

  describe("ungültige Prüfziffer", () => {
    it("lehnt eine deutsche IBAN mit korrektem Format aber falscher Prüfziffer ab", () => {
      // Wie DE89370400440532013000, aber Prüfziffer 89 → 99 manipuliert.
      // Format und Länge sind ok, daher schlägt der MOD-97-Check zu.
      const result = validateIban("DE99370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("IBAN-Prüfziffer ist ungültig");
    });

    it("lehnt eine deutsche IBAN mit veränderter Kontonummer ab", () => {
      // Letzte Stellen verändert → Prüfziffer passt nicht mehr
      const result = validateIban("DE89370400440532013999");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("IBAN-Prüfziffer ist ungültig");
    });
  });
});
import { describe, it, expect } from "vitest";
import { validateIban } from "@/lib/validateIban";

/**
 * Unit-Tests für validateIban().
 *
 * Hinweis: validateIban liefert ein Objekt { valid, message }.
 * Eine LEERE Eingabe gilt bewusst als gültig (optionales Feld).
 *
 * Diese Tests greifen NICHT auf Supabase, APIs, Webhooks oder
 * sonstige externe Dienste zu — reine Unit-Tests einer
 * deterministischen Pure-Function.
 */
describe("validateIban", () => {
  // ---------- Gültige IBANs ----------

  describe("gültige IBANs", () => {
    it("akzeptiert eine gültige deutsche IBAN", () => {
      // Offizielle Test-IBAN aus der Deutschen Bundesbank-Doku
      const result = validateIban("DE89370400440532013000");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige IBAN mit Leerzeichen (4er-Blöcke)", () => {
      // Gleiche IBAN wie oben, nur formatiert wie auf einem Kontoauszug
      const result = validateIban("DE89 3704 0044 0532 0130 00");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige IBAN in Kleinbuchstaben", () => {
      const result = validateIban("de89370400440532013000");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige österreichische IBAN", () => {
      // Offizielle Test-IBAN AT
      const result = validateIban("AT611904300234573201");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige Malta-IBAN (Land NICHT in der Längen-Tabelle)", () => {
      // MT steht nicht in der hardcoded `lengths`-Tabelle in validateIban.
      // Dieser Test deckt damit den Code-Pfad ab, in dem der
      // länderspezifische Längen-Check übersprungen wird und direkt
      // zur MOD-97-Prüfung gegangen wird.
      const result = validateIban("MT84MALT011000012345MTLCAST001S");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("akzeptiert eine gültige britische IBAN (Buchstaben im BBAN-Teil)", () => {
      // 'WEST' im BBAN-Teil zwingt die MOD-97-Schleife, die
      // Buchstaben-zu-Zahl-Konvertierung (charCodeAt → code-55)
      // tatsächlich auszuführen. Bei DE/AT-IBANs wird dieser
      // Branch nie betreten.
      const result = validateIban("GB82WEST12345698765432");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Leere / weggelassene Eingabe ----------

  describe("leere Eingabe", () => {
    it("behandelt einen leeren String als gültig (optionales Feld)", () => {
      const result = validateIban("");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });

    it("behandelt einen reinen Whitespace-String als gültig (optionales Feld)", () => {
      // Wird nach .replace(/\s/g, '') zu '' und greift damit den Optional-Pfad
      const result = validateIban("   ");

      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
  });

  // ---------- Falsches Format ----------

  describe("falsches Format", () => {
    it("lehnt eine IBAN ohne Länderpräfix ab", () => {
      const result = validateIban("89370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine IBAN mit Sonderzeichen ab", () => {
      const result = validateIban("DE89-3704-0044-0532-0130-00");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine viel zu kurze IBAN ab", () => {
      const result = validateIban("DE89");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine IBAN mit Buchstaben statt Prüfziffern ab", () => {
      // Stellen 3-4 müssen Ziffern sein, hier stehen Buchstaben
      const result = validateIban("DEAB370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Ungültiges IBAN-Format");
    });

    it("lehnt eine deutsche IBAN mit falscher Länge ab", () => {
      // DE muss exakt 22 Zeichen haben — hier nur 21 (eine Ziffer fehlt)
      const result = validateIban("DE8937040044053201300");

      expect(result.valid).toBe(false);
      expect(result.message).toContain("DE");
      expect(result.message).toContain("22");
    });
  });

  // ---------- Falsche Prüfziffer (MOD-97 schlägt fehl) ----------

  describe("ungültige Prüfziffer", () => {
    it("lehnt eine deutsche IBAN mit korrektem Format aber falscher Prüfziffer ab", () => {
      // Wie DE89370400440532013000, aber Prüfziffer 89 → 99 manipuliert.
      // Format und Länge sind ok, daher schlägt der MOD-97-Check zu.
      const result = validateIban("DE99370400440532013000");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("IBAN-Prüfziffer ist ungültig");
    });

    it("lehnt eine deutsche IBAN mit veränderter Kontonummer ab", () => {
      // Letzte Stellen verändert → Prüfziffer passt nicht mehr
      const result = validateIban("DE89370400440532013999");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("IBAN-Prüfziffer ist ungültig");
    });
  });
});
