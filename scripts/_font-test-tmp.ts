import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "fs";

const toU8 = (p: string) => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit as any);
const reg = await doc.embedFont(toU8("/tmp/Exo2-Reg-static.ttf"), { subset: true });
const med = await doc.embedFont(toU8("/tmp/Exo2-Med.ttf"), { subset: true });
const bold = await doc.embedFont(toU8("/tmp/Exo2-Bold.ttf"), { subset: true });
const page = doc.addPage([595, 842]);
let y = 780;
const lines: [string, any, number][] = [
  ["VERTRAGSÜBERSICHT — Exo 2 PoC", bold, 22],
  ["Regular: Müller & Söhne GmbH – Honorarfuchs", reg, 12],
  ["Medium:  1.234,56 EUR / Monat – ÄÖÜß", med, 12],
  ["Bold:    DE21 1234 5678 9012 3456", bold, 12],
  ["Ziffern: 0123456789 / Symbole: – — · §", reg, 11],
];
for (const [t, f, s] of lines) { page.drawText(t, { x: 50, y, size: s, font: f, color: rgb(0.044, 0.212, 0.498) }); y -= 30; }
const bytes = await doc.save();
writeFileSync("/mnt/documents/font-test-exo2.pdf", bytes);
console.log("OK bytes:", bytes.length, "(subset)");

// No-subset comparison
const doc2 = await PDFDocument.create();
doc2.registerFontkit(fontkit as any);
await doc2.embedFont(toU8("/tmp/Exo2-Reg-static.ttf"));
await doc2.embedFont(toU8("/tmp/Exo2-Med.ttf"));
await doc2.embedFont(toU8("/tmp/Exo2-Bold.ttf"));
doc2.addPage([595, 842]).drawText("x", { x: 50, y: 700, size: 12 });
const b2 = await doc2.save();
console.log("NO-subset (3 cuts embedded fully):", b2.length);
