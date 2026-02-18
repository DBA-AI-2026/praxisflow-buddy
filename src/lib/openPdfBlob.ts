import { showPdfInViewer } from "@/lib/pdfViewerState";

/**
 * Opens a PDF Uint8Array reliably across all browsers,
 * including iOS Safari on iPhone & iPad.
 */
export function openPdfBlob(pdfBytes: Uint8Array, filename = "Vertrag.pdf") {
  // Detect iOS (iPhone / iPad / iPod — including iPad with desktop UA)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    // iOS Safari cannot open blob: URLs in new *tabs*, but they work
    // inside iframes. Create a blob URL and show it in the in-app viewer.
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    showPdfInViewer(blobUrl);
  } else {
    // Standard browsers: blob URL + window.open works fine
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
