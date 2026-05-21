/**
 * contractPdfActions — wiederverwendbare PDF-Aktionen für Verträge.
 *
 * Diese drei Helfer kapseln die Logik aus `src/pages/vertrieb/Vertraege.tsx`
 * (handlePreviewPdf / handleTemplatePdf / Storage-Download). Sie werden
 * aktuell vom neuen VertragTab im KundenDialog genutzt; Vertraege.tsx hat
 * heute noch seine eigenen inline-Versionen (Quelle der Wahrheit). Wenn
 * sich die PDF-Logik ändert, beide Stellen synchronisieren — oder
 * Vertraege.tsx später hierauf umziehen.
 *
 * Alle Funktionen werfen bei Fehler; der Aufrufer ist für Toast/Logging
 * verantwortlich.
 */
import { supabase } from "@/lib/supabaseClient";
import { generateContractPdf } from "@/lib/generateContractPdf";
import { fillContractTemplate } from "@/lib/fillContractTemplate";
import { openPdfBlob } from "@/lib/openPdfBlob";
import foxLogoUrl from "@/assets/logo.png";

type ContractLike = Record<string, any>;

async function loadProductsAndEbm() {
  const { data: products = [] } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true);
  const ebmProduct = (products ?? []).find((p: any) => p.name === "HFX EBM");
  let ebmModules: any[] = [];
  if (ebmProduct?.id) {
    const { data } = await supabase
      .from("product_modules")
      .select("*")
      .eq("product_id", ebmProduct.id)
      .eq("is_active", true);
    ebmModules = data ?? [];
  }
  return { products: products ?? [], ebmModules };
}

async function fetchLogoBytes(): Promise<ArrayBuffer | undefined> {
  try {
    const res = await fetch(foxLogoUrl);
    return await res.arrayBuffer();
  } catch {
    return undefined;
  }
}

/**
 * Konditions-/Produktübersicht (interne Vorschau).
 * Spiegelt handlePreviewPdf aus Vertraege.tsx.
 */
export async function previewContractPdf(contract: ContractLike): Promise<void> {
  const { products, ebmModules } = await loadProductsAndEbm();
  const now = new Date();
  const selectedNames: string[] = contract.modules?.length
    ? contract.modules
    : contract.selected_products || [];
  const product_price_details = products
    .filter((p: any) => selectedNames.includes(p.name))
    .map((p: any) => {
      const hasPromo =
        p.promo_price != null &&
        p.promo_end_date &&
        new Date(p.promo_end_date) >= now;
      return {
        name: p.name,
        monthly_price: Number(p.monthly_price) || 0,
        price_per_unit: p.price_per_unit != null ? Number(p.price_per_unit) || 0 : null,
        price_per_unit_label: p.price_per_unit_label || null,
        promo_price: p.promo_price != null ? Number(p.promo_price) || 0 : null,
        promo_price_label: p.promo_price_label || null,
        promo_end_date: p.promo_end_date || null,
        promo_base_fee_end_date: p.promo_base_fee_end_date || null,
        has_active_promo: hasPromo,
      };
    });

  const addonNames: string[] =
    contract.selected_addon_modules || contract.selected_modules || [];
  const addon_module_details = ebmModules
    .filter((m: any) => addonNames.includes(m.name))
    .map((m: any) => ({ name: m.name, monthly_price: Number(m.monthly_price) || 0 }));

  const logoBytes = await fetchLogoBytes();

  const pdfBytes = await generateContractPdf(
    {
      ...contract,
      product_price_details,
      selected_addon_modules: addonNames,
      addon_module_details,
    },
    logoBytes,
  );
  openPdfBlob(new Uint8Array(pdfBytes));
}

/**
 * Offizielles Vertragsdokument (template-basiert) — dasselbe PDF, das
 * nach Stripe-Erfolg per Mail an den Kunden geht.
 * Spiegelt handleTemplatePdf aus Vertraege.tsx.
 */
export async function templateContractPdf(contract: ContractLike): Promise<void> {
  const templateRes = await fetch("/templates/vertrag-honorarfuchs.pdf");
  const templateBytes = await templateRes.arrayBuffer();

  const pdfBytes = await fillContractTemplate(templateBytes, {
    mp_nr: contract.mp_nr,
    praxis: contract.praxis,
    fachrichtung: contract.fachrichtung,
    rechtsform: contract.rechtsform,
    vorname: contract.vorname,
    nachname: contract.nachname,
    adresse: contract.adresse,
    praxisanschrift: contract.praxisanschrift,
    plz: contract.plz,
    telefon: contract.telefon,
    email: contract.email,
    kontoinhaber: contract.kontoinhaber,
    kontoinhaber_strasse: contract.kontoinhaber_strasse,
    kontoinhaber_plz_ort: contract.kontoinhaber_plz_ort,
    bank_name: contract.bank_name,
    iban: contract.iban,
    bic: contract.bic,
    bsnr: contract.bsnr,
    lanr: contract.lanr,
    weitere_bsnr: contract.weitere_bsnr,
    weitere_lanr: contract.weitere_lanr,
    ort: contract.ort,
    monthly_price: contract.monthly_price,
    start_date: contract.start_date,
    end_date: contract.end_date,
    modules: contract.modules?.length ? contract.modules : contract.selected_products,
    duration_months: contract.duration_months,
    notes: contract.notes,
    signature_data: contract.signature_data || null,
    vertrieb_signature_data: contract.vertrieb_signature_data || null,
    praxissystem: contract.praxissystem,
    stundenaufwand_pro_woche: contract.stundenaufwand_pro_woche,
    selected_addon_modules:
      contract.selected_addon_modules || contract.selected_modules || [],
  });

  openPdfBlob(new Uint8Array(pdfBytes));
}

/**
 * Storage-Original (manuell hochgeladenes PDF) als signed URL öffnen.
 * Liefert die signed URL; Aufrufer öffnet sie (z.B. window.open).
 */
export async function getContractStorageSignedUrl(
  documentUrl: string,
  expiresSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("contracts")
    .createSignedUrl(documentUrl, expiresSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Signed URL konnte nicht erstellt werden.");
  }
  return data.signedUrl;
}
