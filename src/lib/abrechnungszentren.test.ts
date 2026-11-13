import { describe, it, expect } from "vitest";
import { ABRECHNUNGSZENTREN, ABRECHNUNGSZENTRUM_DEFAULT, isKnownAbrechnungszentrum } from "./abrechnungszentren";

describe("Abrechnungszentren", () => {
  it("Default ist 'nein'", () => expect(ABRECHNUNGSZENTRUM_DEFAULT).toBe("nein"));
  it("enthält 60 Einträge inkl. PVS Ba-Wü, BFS und ZA", () => {
    expect(ABRECHNUNGSZENTREN.length).toBe(60);
    expect(isKnownAbrechnungszentrum("PVS Ba-Wü")).toBe(true);
    expect(isKnownAbrechnungszentrum("BFS")).toBe(true);
    expect(isKnownAbrechnungszentrum("ZA")).toBe(true);
  });
  it("alte Werte gelten als unbekannt (alter Wert)", () => {
    for (const v of ["keins", "pvs", "Sonstiges", "sonstige", "Epikur", "Blah!", "pad", "ARZ"]) {
      expect(isKnownAbrechnungszentrum(v)).toBe(false);
    }
  });
});
