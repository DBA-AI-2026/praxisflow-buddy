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
    // iOS Safari cannot open blob: URLs in new tabs.
    // Convert to base64 data-URI and show in the in-app PDF viewer overlay.
    let binary = "";
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    showPdfInViewer(dataUrl);
  } else {
    // Standard browsers: blob URL + window.open works fine
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
