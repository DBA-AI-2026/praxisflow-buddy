import { describe, it, expect } from "vitest";
import { ABRECHNUNGSZENTREN, ABRECHNUNGSZENTRUM_DEFAULT, isKnownAbrechnungszentrum } from "./abrechnungszentren";

describe("Abrechnungszentren", () => {
  it("Default ist 'nein'", () => expect(ABRECHNUNGSZENTRUM_DEFAULT).toBe("nein"));
  it("enthält 59 Einträge inkl. PVS Ba-Wü und BFS", () => {
    expect(ABRECHNUNGSZENTREN.length).toBe(59);
    expect(isKnownAbrechnungszentrum("PVS Ba-Wü")).toBe(true);
    expect(isKnownAbrechnungszentrum("BFS")).toBe(true);
  });
  it("alte Werte gelten als unbekannt (alter Wert)", () => {
    for (const v of ["keins", "pvs", "Sonstiges", "sonstige", "Epikur", "Blah!", "pad", "ARZ"]) {
      expect(isKnownAbrechnungszentrum(v)).toBe(false);
    }
  });
});
