// _shared/agbResolver.ts
// Resolver für produktspezifische AGB-PDFs.
// Genutzt von: send-mandate-setup, send-contract-confirmation.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ProductWithAgb = {
  name: string;
  agb_pdf_path: string | null;
  id?: string;
};

/**
 * Leichtgewichtiger Version-Resolver für Beweis-Trail (agb_acceptances.agb_version).
 * Kein PDF-Fetch. Wirft nie — Fehler ⇒ generischer Fallback-Label.
 */
export async function resolveCurrentAgbVersion(
  admin: SupabaseClient,
  candidates: Array<string | null | undefined>,
): Promise<{ label: string; version: number | null; source: "product" | "generic" }> {
  try {
    const { data: products } = await admin
      .from("products")
      .select("id, name, agb_pdf_path")
      .not("agb_pdf_path", "is", null);

    const matched = findBestProductMatch((products ?? []) as ProductWithAgb[], candidates);

    if (matched?.agb_pdf_path && matched.id) {
      const { data: cur } = await admin
        .from("agb_versions")
        .select("version")
        .eq("product_id", matched.id)
        .eq("is_current", true)
        .maybeSingle();
      if (cur?.version != null) {
        return {
          label: `${matched.name} v${cur.version}`,
          version: cur.version as number,
          source: "product",
        };
      }
    }
  } catch (_err) {
    // fall through to generic
  }
  return { label: "Standard-AGB (generisch)", version: null, source: "generic" };
}

const normalizeProductKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function findBestProductMatch(
  products: ProductWithAgb[],
  candidates: Array<string | null | undefined>,
): ProductWithAgb | null {
  const preparedCandidates = candidates
    .flatMap((candidate) => String(candidate || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (preparedCandidates.length === 0) return null;

  const exactMatch = products.find((product) =>
    preparedCandidates.some(
      (candidate) => candidate.toLowerCase() === product.name.toLowerCase(),
    ),
  );
  if (exactMatch) return exactMatch;

  return (
    products.find((product) => {
      const normalizedProduct = normalizeProductKey(product.name);
      return preparedCandidates.some((candidate) => {
        const normalizedCandidate = normalizeProductKey(candidate);
        return (
          normalizedCandidate === normalizedProduct ||
          normalizedCandidate.includes(normalizedProduct) ||
          normalizedProduct.includes(normalizedCandidate)
        );
      });
    }) ?? null
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type ResolvedAgb = {
  base64: string | undefined;
  filename: string;
  downloadUrl: string;
  source: "product" | "generic" | "none";
  matchedProductName: string | null;
};

/**
 * Resolve product-specific AGB PDF with generic fallback.
 * - Queries products.agb_pdf_path
 * - createSignedUrl 14 days
 * - fetch + toBase64
 * - Fallback: generic template at `${appUrl}/templates/vertrag-honorarfuchs.pdf`
 * - Filename: AGB-<safeProductName>.pdf
 */
export async function resolveAgbForCandidates(
  admin: SupabaseClient,
  appUrl: string,
  candidates: Array<string | null | undefined>,
  logPrefix = "[agbResolver]",
): Promise<ResolvedAgb> {
  let base64: string | undefined;
  let filename = "AGB-Honorarfuchs.pdf";
  let downloadUrl = `${appUrl}/templates/vertrag-honorarfuchs.pdf`;
  let source: ResolvedAgb["source"] = "none";
  let matchedProductName: string | null = null;

  try {
    const { data: productsWithAgb } = await admin
      .from("products")
      .select("name, agb_pdf_path")
      .not("agb_pdf_path", "is", null);

    const matched = findBestProductMatch(
      (productsWithAgb ?? []) as ProductWithAgb[],
      candidates,
    );

    if (matched?.agb_pdf_path) {
      const { data: signed } = await admin.storage
        .from("contracts")
        .createSignedUrl(matched.agb_pdf_path, 60 * 60 * 24 * 14);

      if (signed?.signedUrl) {
        downloadUrl = signed.signedUrl;
        const res = await fetch(signed.signedUrl);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          base64 = toBase64(bytes);
          const safeName = (matched.name || "Honorarfuchs").replace(
            /[^a-zA-Z0-9äöüÄÖÜß\-_.]/g,
            "_",
          );
          filename = `AGB-${safeName}.pdf`;
          source = "product";
          matchedProductName = matched.name;
          console.log(`${logPrefix} Using product AGB for "${matched.name}"`);
        }
      }
    }

    if (!base64) {
      const res = await fetch(`${appUrl}/templates/vertrag-honorarfuchs.pdf`);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        base64 = toBase64(bytes);
        source = "generic";
        console.log(`${logPrefix} Falling back to generic AGB`);
      }
    }
  } catch (err) {
    console.warn(`${logPrefix} AGB resolution failed:`, String(err));
  }

  return { base64, filename, downloadUrl, source, matchedProductName };
}
