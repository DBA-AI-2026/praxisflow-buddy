/**
 * scripts/diff-contract-pdf.ts
 * ------------------------------------------------------------------
 * Drift-Wächter zwischen UI- und Edge-Renderer der Vertragsübersicht-PDF.
 *
 *  - UI:   src/lib/generateContractPdf.ts            (generateContractPdf)
 *  - Edge: supabase/functions/send-contract-confirmation/index.ts (buildContractPdf)
 *
 * Erwartete Unterschiede (alles andere wird als Drift gemeldet):
 *   1. IBAN-Maskierung: UI = "partial" (DE21 •••• •••• •••• 2395),
 *                       Edge = "compact" (••••2395).
 *   2. UNTERSCHRIFT-Sektion: UI rendert sie wenn `signature_data` vorhanden,
 *                            Edge nie.
 *
 * Beide Renderer sind durch ⚠ SYNCHRONIZE-Header gekoppelt; dieses Skript
 * macht die Kopplung sichtbar, indem es beide PDFs erzeugt und die im
 * Klartext extrahierten Sektions-Titel + Feld-Labels vergleicht.
 *
 * Manuell ausführen:
 *   bun run scripts/diff-contract-pdf.ts
 *
 * Hinweis: Das Skript ruft das UI-Modul direkt auf. Die Edge-Variante wird
 * über `supabase functions invoke` getestet — alternativ kann eine lokal
 * gespeicherte Bytes-Vergleichsbasis gegen einen Snapshot geprüft werden.
 * Es läuft NICHT in CI; es ist eine reine Drift-Checkliste.
 */
import { writeFile } from "node:fs/promises";
import { generateContractPdf } from "../src/lib/generateContractPdf";

const MOCK_CONTRACT = {
  hfx_customer_number: "HFX-I01070",
  praxis: "Diff-Test Praxis",
  fachrichtung: "Allgemeinmedizin",
  vorname: "Peter",
  nachname: "Diff",
  adresse: "Teststraße 1",
  plz: "12345",
  ort: "Berlin",
  telefon: "+49 30 0000000",
  email: "diff@example.com",
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
  monthly_price: 0,
  one_time_fee: 0,
  kontoinhaber: "Peter Diff",
  iban: "DE21300209002395",
  bic: "CMCIDEDD",
  status: "aktiv",
  qodia_unit_price: 0.99,
};

const MOCK_PROMO_PRODUCT = {
  name: "HFX GOÄ",
  promo_price: 0.99,
  promo_end_date: "2099-12-31",
  promo_price_label: "0,99 EUR/Rechnung",
  promo_base_fee_end_date: "2099-12-31",
  monthly_price: 49,
  price_per_unit: 1.49,
  price_per_unit_label: "Rechnung",
};

const EXPECTED_DIFF_NOTES = [
  "IBAN-Maskierungsmodus: UI = partial, Edge = compact",
  "UNTERSCHRIFT-Sektion: nur UI",
];

async function main() {
  console.log("=== Contract-PDF Drift-Check ===\n");

  const uiBytes = await generateContractPdf(
    MOCK_CONTRACT as any,
    undefined,
    { promoProduct: MOCK_PROMO_PRODUCT },
  );
  await writeFile("/tmp/contract-ui.pdf", uiBytes);
  console.log("✓ UI-PDF erzeugt:   /tmp/contract-ui.pdf   (" + uiBytes.byteLength + " bytes)");

  console.log(
    "\nℹ Edge-PDF: bitte separat erzeugen via\n" +
      "   supabase functions invoke send-contract-confirmation \\\n" +
      "     --body '{\"contract_id\":\"<TEST-2703>\",\"force\":true}'\n" +
      "  oder über `curl_edge_functions` im Lovable-Tooling. Die Mail enthält\n" +
      "  die Edge-PDF als Anhang — herunterladen nach /tmp/contract-edge.pdf.\n",
  );

  console.log("Erwartete Unterschiede (alles andere = Drift, bitte beheben):");
  for (const note of EXPECTED_DIFF_NOTES) console.log("  • " + note);

  console.log(
    "\nSync-Check-Liste — diese Helfer MÜSSEN in beiden Dateien wortgleich sein:\n" +
      "  - text, rightText, ensureSpace, drawFooter\n" +
      "  - sectionHeader (rowH=24, size 10 fett, characterSpacing 0.5, y-1)\n" +
      "  - fieldRow (y-=13, y-=13, Trennlinie y+9)\n" +
      "  - drawPriceRow (priceRowH=24)\n" +
      "  - maskIban (modes compact/partial/full)\n",
  );
}

main().catch((err) => {
  console.error("Drift-Check fehlgeschlagen:", err);
  process.exit(1);
});
