import { showPdfInViewer } from "@/lib/pdfViewerState";

/**
 * Opens a PDF Uint8Array reliably across all browsers,
 * including iOS Safari on iPhone & iPad.
 */
export function openPdfBlob(pdfBytes: Uint8Array, filename = "Vertrag.pdf") {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);

  // Always use in-app viewer — works on all platforms and avoids popup-blocker issues
  showPdfInViewer(blobUrl);
}
