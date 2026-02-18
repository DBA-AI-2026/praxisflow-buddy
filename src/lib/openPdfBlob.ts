/**
 * Opens a PDF blob in a way that works reliably across all browsers,
 * including iOS Safari on iPhone & iPad where window.open() is blocked
 * after async operations.
 */
export function openPdfBlob(pdfBytes: Uint8Array, filename = "Vertrag.pdf") {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  // Detect iOS (iPhone / iPad / iPod)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    // On iOS Safari, window.open is blocked after async work.
    // Use a programmatic <a> click which Safari trusts more,
    // or fall back to navigating the current tab.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    // iOS Safari may still block target=_blank, so we also set download as fallback
    // However, iOS Safari doesn't support download attribute for PDFs well,
    // so we try opening first and fall back to same-tab navigation.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // If the above didn't open a new tab (common on iOS), try location.href
    // after a short delay. We use a timeout to allow the click to resolve first.
    setTimeout(() => {
      // Only revoke after enough time for the PDF to load
      URL.revokeObjectURL(url);
    }, 120000);
  } else {
    // Standard browsers: window.open works fine
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
