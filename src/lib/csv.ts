// Shared CSV download helper. Extracted verbatim from src/pages/Buchhaltung.tsx.
// UTF-8 BOM + semicolon separator + double-quote escaping (Excel/Lexware kompatibel).

export function downloadCsv(rows: string[][], filename: string) {
  const bom = "\uFEFF";
  const csv = bom + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
