/**
 * contractPdfActions — wiederverwendbare PDF-Aktionen für Verträge.
 *
 * Quelle der Wahrheit für PDF-Generierung im UI. `Vertraege.tsx` hat
 * historisch noch eigene Inline-Versionen (handlePreviewPdf); bei
 * Änderungen beide Stellen synchronisieren.
 *
 * Alle Funktionen werfen bei Fehler; der Aufrufer ist für Toast/Logging
 * verantwortlich.
 */
import { supabase } from "@/lib/supabaseClient";
// generateContractPdf wird lazy via dynamic import geladen (C.3a), damit
// @pdf-lib/fontkit + Exo-2-TTFs nicht im Initial-Bundle landen.
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
 * Baut die PDF-Bytes für die Konditions-/Produktübersicht.
 * Geteilte Basis für previewContractPdf und downloadContractPdf.
 */
async function buildContractPdfBytes(contract: ContractLike): Promise<Uint8Array> {
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

  const promoProductRaw = products.find(
    (p: any) =>
      selectedNames.includes(p.name) &&
      p.promo_price != null &&
      p.promo_end_date &&
      new Date(p.promo_end_date) >= now,
  );
  const promoProduct = promoProductRaw
    ? {
        name: promoProductRaw.name,
        promo_price: promoProductRaw.promo_price ?? null,
        promo_end_date: promoProductRaw.promo_end_date ?? null,
        promo_price_label: promoProductRaw.promo_price_label ?? null,
        promo_base_fee_end_date: promoProductRaw.promo_base_fee_end_date ?? null,
        monthly_price: promoProductRaw.monthly_price ?? null,
        price_per_unit: promoProductRaw.price_per_unit ?? null,
        price_per_unit_label: promoProductRaw.price_per_unit_label ?? null,
      }
    : null;

  const { generateContractPdf } = await import("@/lib/generateContractPdf");
  const pdfBytes = await generateContractPdf(
    {
      ...contract,
      product_price_details,
      selected_addon_modules: addonNames,
      addon_module_details,
    },
    logoBytes,
    { promoProduct },
  );
  return new Uint8Array(pdfBytes);
}

/**
 * Konditions-/Produktübersicht (interne Vorschau im PDF-Viewer).
 */
export async function previewContractPdf(contract: ContractLike): Promise<void> {
  const bytes = await buildContractPdfBytes(contract);
  openPdfBlob(bytes);
}

/**
 * Konditions-/Produktübersicht als Download.
 */
export async function downloadContractPdf(contract: ContractLike): Promise<void> {
  const bytes = await buildContractPdfBytes(contract);
  const number = contract.contract_number || contract.hfx_customer_number || "Vertrag";
  const filename = `Vertrag_${String(number).replace(/[^A-Za-z0-9_-]+/g, "_")}.pdf`;
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Storage-Original (manuell hochgeladenes PDF) als signed URL öffnen.
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
