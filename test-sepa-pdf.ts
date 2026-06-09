import { writeFile } from "node:fs/promises";
import { generateContractPdf } from "./src/lib/generateContractPdf";

const baseMock = {
  hfx_customer_number: "HFX-I01070",
  praxis: "Test Praxis",
  fachrichtung: "Allgemeinmedizin",
  vorname: "Peter",
  nachname: "Test",
  adresse: "Teststraße 1",
  plz: "12345",
  ort: "Berlin",
  telefon: "+49 30 0000000",
  email: "test@example.com",
  mp_nr: "12345",
  sales_partner_name: "Test-AD",
  product_name: "HFX GOÄ",
  modules: ["HFX GOÄ"],
  selected_addon_modules: [],
  addon_module_details: [],
  license_count: 1,
  start_date: "2026-01-01",
  end_date: "2099-12-31",
  duration_months: 0,
  payment_interval: "monatlich",
  monthly_price: 49,
  one_time_fee: 0,
  kontoinhaber: "Peter Test",
  iban: "",
  bic: "",
  status: "aktiv",
  qodia_unit_price: 0.99,
};

async function test() {
  console.log("=== Test 1: Leere IBAN (HFX-I01070-Szenario) ===");
  const emptyIban = { ...baseMock, iban: "", kontoinhaber: "" };
  const pdf1 = await generateContractPdf(emptyIban as any);
  await writeFile("/tmp/contract-empty-iban.pdf", pdf1);
  console.log("✓ PDF erzeugt: /tmp/contract-empty-iban.pdf (" + pdf1.byteLength + " bytes)");

  console.log("\n=== Test 2: Mit IBAN (Elisabeth-Freitag-Szenario) ===");
  const withIban = { ...baseMock, iban: "DE21300209002395", kontoinhaber: "Elisabeth Freitag" };
  const pdf2 = await generateContractPdf(withIban as any);
  await writeFile("/tmp/contract-with-iban.pdf", pdf2);
  console.log("✓ PDF erzeugt: /tmp/contract-with-iban.pdf (" + pdf2.byteLength + " bytes)");
}

test().catch(err => {
  console.error("FAIL:", err);
  process.exit(1);
});
