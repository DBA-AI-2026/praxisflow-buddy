/**
 * Opens a PDF Uint8Array in a way that works reliably across all browsers,
 * including iOS Safari on iPhone & iPad where blob: URLs fail with
 * "WebKitBlobResource-Fehler 1".
 */
export function openPdfBlob(pdfBytes: Uint8Array, filename = "Vertrag.pdf") {
  // Detect iOS (iPhone / iPad / iPod — including iPad with desktop UA)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    // iOS Safari cannot open blob: URLs in new tabs.
    // Convert to base64 data-URI and open that instead.
    let binary = "";
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/pdf;base64,${base64}`;

    // Use window.location to navigate the current tab to the PDF.
    // This is the most reliable method on iOS Safari.
    window.location.href = dataUrl;
  } else {
    // Standard browsers: blob URL + window.open works fine
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
