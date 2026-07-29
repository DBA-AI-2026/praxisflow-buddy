import { supabase } from "@/lib/supabaseClient";

/**
 * Nicht-destruktiver AGB-Upload (Phase B).
 *
 * Legt eine neue Datei unter einem eindeutigen Pfad im `contracts`-Bucket ab
 * (kein `upsert`) und erzeugt anschließend atomar via RPC `create_agb_version`
 * eine neue Version in `agb_versions` (fortlaufende Nummer, `is_current`-Flip)
 * plus Aktualisierung von `products.agb_pdf_path`.
 *
 * Race-Verhalten: Bei parallelen Uploads fangen der UNIQUE (product_id, version)
 * und der partielle Unique-Index `agb_versions_one_current_per_product` die
 * Kollision ab — der unterlegene Aufruf wirft einen Fehler, keine Korruption.
 *
 * @returns die neu vergebene Versionsnummer
 */
export async function uploadAgbVersion(productId: string, file: File): Promise<number> {
  const uniqueSuffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const safeName = (() => {
    const base = (file.name || "").trim();
    const sanitized = base
      .replace(/[^a-zA-Z0-9äöüÄÖÜß.\-_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    const name = sanitized || "datei";
    const nameWithPdf = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
    return nameWithPdf;
  })();

  const path = `agb/${productId}/${uniqueSuffix}/${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("contracts")
    .upload(path, file, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw upErr;

  const { data, error } = await supabase.rpc("create_agb_version", {
    p_product_id: productId,
    p_storage_path: path,
    p_file_name: file.name,
  });
  if (error) throw error;

  return data as number;
}

/**
 * Deaktiviert das aktuelle AGB eines Produkts history-sicher:
 * - setzt alle `is_current=true`-Einträge des Produkts auf false
 * - setzt `products.agb_pdf_path=null`
 * - Storage-Dateien werden NICHT gelöscht (Historie bleibt).
 */
export async function deactivateCurrentAgb(productId: string): Promise<void> {
  const { error: versionsError } = await supabase
    .from("agb_versions")
    .update({ is_current: false })
    .eq("product_id", productId)
    .eq("is_current", true);
  if (versionsError) throw versionsError;

  const { error: productError } = await supabase
    .from("products")
    .update({ agb_pdf_path: null } as any)
    .eq("id", productId);
  if (productError) throw productError;
}
