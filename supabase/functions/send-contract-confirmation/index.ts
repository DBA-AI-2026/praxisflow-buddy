import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

// ---------- PDF generation (mirrors client generateContractPdf, invoice-style) ----------

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "–";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number | null): string {
  if (value == null) return "0,00 €";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

type ProductWithAgb = {
  name: string;
  agb_pdf_path: string | null;
};

const normalizeProductKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function findBestProductMatch(products: ProductWithAgb[], candidates: Array<string | null | undefined>) {
  const preparedCandidates = candidates
    .flatMap((candidate) => String(candidate || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (preparedCandidates.length === 0) return null;

  const exactMatch = products.find((product) =>
    preparedCandidates.some((candidate) => candidate.toLowerCase() === product.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  return products.find((product) => {
    const normalizedProduct = normalizeProductKey(product.name);
    return preparedCandidates.some((candidate) => {
      const normalizedCandidate = normalizeProductKey(candidate);
      return (
        normalizedCandidate === normalizedProduct ||
        normalizedCandidate.includes(normalizedProduct) ||
        normalizedProduct.includes(normalizedCandidate)
      );
    });
  }) ?? null;
}

async function buildContractPdf(contract: Record<string, unknown>, logoBytes?: ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const ML = 56;
  const MR = 56;
  const CW = PAGE_W - ML - MR;
  const mmToPt = 2.8346;

  const C_NAVY = rgb(0.044, 0.212, 0.498);
  const C_TEXT = rgb(0.12, 0.12, 0.14);
  const C_MUTED = rgb(0.35, 0.37, 0.42);
  const C_LINE = rgb(0.044, 0.212, 0.498);
  const C_LINE_LIGHT = rgb(0.75, 0.80, 0.88);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    if (!t) return;
    page.drawText(t, { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const rightText = (t: string, rightEdge: number, yy: number, size: number, f = font, color = C_TEXT) => {
    const w = f.widthOfTextAtSize(t, size);
    text(t, rightEdge - w, yy, size, f, color);
  };

  const ensureSpace = (needed = 80) => {
    if (y < 60 + needed) {
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 50;
    }
  };

  const drawFooter = () => {
    const fY = 36;
    page.drawLine({ start: { x: ML, y: fY + 20 }, end: { x: PAGE_W - MR, y: fY + 20 }, thickness: 0.5, color: C_LINE_LIGHT });
    const footerLines = [
      "MCC Medical CareCapital GmbH · Hohenzollernstr. 47 · 47799 Krefeld",
      "Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke · Amtsgericht Krefeld, HRB 14709",
      "USt-IdNr. DE 227 420 712 · www.hfx-honorarfuchs.de",
    ];
    footerLines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, 6);
      text(line, (PAGE_W - w) / 2, fY + 10 - i * 9, 6, font, C_MUTED);
    });
  };

  // Logo
  const headerTop = PAGE_H - 36;
  if (logoBytes) {
    try {
      let img;
      try { img = await doc.embedPng(logoBytes); } catch { img = await doc.embedJpg(logoBytes); }
      const logoH = 40;
      const logoW = (img.width / img.height) * logoH;
      page.drawImage(img, { x: PAGE_W - MR - logoW, y: headerTop - logoH + 10, width: logoW, height: logoH });
    } catch { /* skip */ }
  }

  // Sender line
  y = PAGE_H - 48 * mmToPt;
  text("HFX Honorarfuchs · Hohenzollernstr. 47 · 47799 Krefeld", ML, y, 7, font, C_MUTED);
  y -= 4;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.3, color: C_LINE_LIGHT });
  y -= 14;

  // Two-column header
  const rightColX = ML + CW * 0.50;
  const rightColW = CW * 0.50;
  const boxTop = y;

  // Recipient
  const recipientLines: string[] = [];
  if (contract.praxis) recipientLines.push(String(contract.praxis));
  const fullName = [contract.vorname, contract.nachname].filter(Boolean).join(" ");
  if (fullName) recipientLines.push(fullName);
  if (contract.adresse) recipientLines.push(String(contract.adresse));
  if (contract.email) recipientLines.push(String(contract.email));

  let ry = boxTop - 4;
  recipientLines.forEach((line, i) => {
    text(line, ML, ry, i === 0 ? 10 : 8.5, i === 0 ? fontBold : font, C_TEXT);
    ry -= 13;
  });

  // Metadata
  const durationMonths = Number(contract.duration_months ?? 0);
  const endDate = String(contract.end_date || "");
  const statusLabels: Record<string, string> = { entwurf: "ENTWURF", aktiv: "AKTIV", eingegangen: "EINGEGANGEN", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET" };
  const intervalLabels: Record<string, string> = { monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich" };
  const st = String(contract.status || "entwurf");

  const metaRows: [string, string][] = [
    ["Kundennummer", String(contract.hfx_customer_number || "–")],
    ["Vertragsbeginn", formatDate(contract.start_date as string)],
    ["Vertragsende", endDate === "2099-12-31" ? "Unbefristet" : formatDate(endDate)],
    ["Laufzeit", durationMonths === 0 ? "Unbefristet" : `${durationMonths} Monate`],
    ["Zahlungsintervall", intervalLabels[String(contract.payment_interval || "monatlich")] || "Monatlich"],
    ["Status", statusLabels[st] || st.toUpperCase()],
  ];

  const recipBoxH = Math.max(recipientLines.length * 13 + 10, metaRows.length * 16 + 10);
  const metaRowH = recipBoxH / metaRows.length;

  metaRows.forEach((row, i) => {
    const rowY = boxTop - i * metaRowH;
    if (i > 0) page.drawLine({ start: { x: rightColX, y: rowY }, end: { x: rightColX + rightColW, y: rowY }, thickness: 0.4, color: C_LINE_LIGHT });
    const textY = rowY - metaRowH / 2 - 3;
    text(row[0], rightColX + 6, textY, 7.5, fontBold, C_TEXT);
    text(row[1], rightColX + rightColW * 0.48 + 6, textY, 8, font, C_TEXT);
  });

  y = boxTop - recipBoxH - 24 - 20 * mmToPt;

  // Title
  text("VERTRAGSÜBERSICHT", ML, y, 20, fontBold, C_TEXT);
  y -= 28;

  // Section header helper
  const sectionHeader = (title: string) => {
    ensureSpace(40);
    page.drawLine({ start: { x: ML, y: y + 10 }, end: { x: PAGE_W - MR, y: y + 10 }, thickness: 1, color: C_LINE });
    const rowH = 22;
    page.drawRectangle({ x: ML, y: y - rowH + 10, width: CW, height: rowH, color: C_BG_LIGHT });
    page.drawLine({ start: { x: ML, y: y - rowH + 10 }, end: { x: PAGE_W - MR, y: y - rowH + 10 }, thickness: 0.8, color: C_LINE });
    text(title, ML + 8, y, 8.5, fontBold, C_NAVY);
    y -= rowH + 6;
  };

  const fieldRow = (label: string, value: string, label2?: string, value2?: string) => {
    ensureSpace(20);
    const halfW = CW / 2;
    text(label, ML + 8, y, 7, font, C_MUTED);
    if (label2) text(label2, ML + halfW + 8, y, 7, font, C_MUTED);
    y -= 11;
    text(value || "–", ML + 8, y, 9, font, C_TEXT, halfW - 16);
    if (label2) text(value2 || "–", ML + halfW + 8, y, 9, font, C_TEXT, halfW - 16);
    y -= 15;
    page.drawLine({ start: { x: ML, y: y + 4 }, end: { x: PAGE_W - MR, y: y + 4 }, thickness: 0.3, color: C_LINE_LIGHT });
  };

  // Vertragsparteien
  sectionHeader("VERTRAGSPARTEIEN");
  fieldRow("Praxis", String(contract.praxis || "–"), "Fachrichtung", String(contract.fachrichtung || "–"));
  fieldRow("Vorname", String(contract.vorname || "–"), "Nachname", String(contract.nachname || "–"));
  fieldRow("Adresse", String(contract.adresse || "–"));
  fieldRow("Telefon", String(contract.telefon || "–"), "E-Mail", String(contract.email || "–"));
  fieldRow("MP-Nummer", String(contract.mp_nr || "–"), "Vertriebspartner", String(contract.sales_partner_name || "–"));
  y -= 10;

  // Produkte
  sectionHeader("PRODUKTE & LIZENZEN");
  fieldRow("Produkt", String(contract.product_name || "–"));
  fieldRow("Anzahl Lizenzen", String(contract.license_count ?? 1));
  y -= 6;

  // Laufzeit
  sectionHeader("LAUFZEIT");
  const endDateLabel = endDate === "2099-12-31" ? "Unbefristet" : formatDate(endDate);
  const laufzeitLabel = durationMonths === 0 ? "Unbefristet" : `${durationMonths} Monate`;
  fieldRow("Vertragsbeginn", formatDate(contract.start_date as string), "Vertragsende", endDateLabel);
  fieldRow("Laufzeit", laufzeitLabel);
  y -= 10;

  // Preisübersicht
  sectionHeader("PREISÜBERSICHT");

  const TABLE_RIGHT = PAGE_W - MR;
  const priceRowH = 24;

  const drawPriceRow = (label: string, value: string, isBold = false, topBorder = false) => {
    ensureSpace(priceRowH + 4);
    const rowTop = y + 10;
    const rowBottom = rowTop - priceRowH;
    if (topBorder) page.drawLine({ start: { x: ML, y: rowTop }, end: { x: TABLE_RIGHT, y: rowTop }, thickness: 0.8, color: C_LINE });
    page.drawLine({ start: { x: ML, y: rowBottom }, end: { x: TABLE_RIGHT, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: ML, y: rowTop }, end: { x: ML, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: TABLE_RIGHT, y: rowTop }, end: { x: TABLE_RIGHT, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    const textY = rowTop - priceRowH / 2 - 3;
    text(label, ML + 8, textY, 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    rightText(value, TABLE_RIGHT - 8, textY, isBold ? 10 : 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    y -= priceRowH;
  };

  drawPriceRow("Monatspreis (netto)", formatCurrency(Number(contract.monthly_price) || 0), false, true);
  drawPriceRow("Einmalgebühr", formatCurrency(Number(contract.one_time_fee) || 0));
  if (Number(contract.discount_percent) > 0) {
    drawPriceRow("Rabatt", `${contract.discount_percent}%`);
  }

  // Gesamtbetrag
  ensureSpace(30);
  const grossRowTop = y + 10;
  const grossRowH = 28;
  const grossRowBottom = grossRowTop - grossRowH;
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowTop }, thickness: 1.5, color: C_LINE });
  page.drawRectangle({ x: ML, y: grossRowBottom, width: CW, height: grossRowH, color: C_BG_LIGHT });
  page.drawLine({ start: { x: ML, y: grossRowBottom }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 1.5, color: C_LINE });
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: ML, y: grossRowBottom }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: TABLE_RIGHT, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 0.8, color: C_LINE });
  const grossTextY = grossRowTop - grossRowH / 2 - 2;
  text("Monatlicher Gesamtbetrag", ML + 8, grossTextY, 10, fontBold, C_NAVY);
  rightText(formatCurrency(Number(contract.monthly_price) || 0), TABLE_RIGHT - 8, grossTextY, 11, fontBold, C_NAVY);
  y -= grossRowH + 4;

  // Closing
  ensureSpace(50);
  y -= 8;
  text("Mit freundlichen Grüßen", ML, y, 9, font, C_TEXT);
  y -= 16;
  text("HFX Honorarfuchs", ML, y, 10, fontBold, C_NAVY);

  drawFooter();

  return doc.save();
}

// ---------- Helpers ----------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Allow service-role calls (e.g. from stripe-webhook) to bypass user auth
  const bearer = authHeader.slice("Bearer ".length).trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isServiceRole = bearer === serviceRoleKey;

  if (!isServiceRole) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { contract_id } = await req.json();
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: contractError } = await adminClient
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.email) {
      return new Response(JSON.stringify({ error: "Contract has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Generate contract summary PDF ---
    let logoBytes: ArrayBuffer | undefined;
    try {
      const logoRes = await fetch(`${APP_URL}/logo.png`);
      if (logoRes.ok) logoBytes = await logoRes.arrayBuffer();
    } catch { /* skip logo */ }

    const pdfBytes = await buildContractPdf(contract as Record<string, unknown>, logoBytes);
    const pdfBase64 = toBase64(pdfBytes);

    // --- Fetch product-specific AGB PDF (fallback to generic) ---
    let agbBase64: string | undefined;
    let agbFilename = "AGB-Honorarfuchs.pdf";
    let agbDownloadUrl = `${APP_URL}/templates/vertrag-honorarfuchs.pdf`;
    try {
      // Look up product-specific AGB (supports legacy labels like "HFX.GOÄ")
      const { data: productsWithAgb } = await adminClient
        .from("products")
        .select("name, agb_pdf_path")
        .not("agb_pdf_path", "is", null);

      const matchedProduct = findBestProductMatch((productsWithAgb ?? []) as ProductWithAgb[], [
        contract.product_name,
        ...(Array.isArray(contract.modules) ? contract.modules : []),
      ]);

      if (matchedProduct?.agb_pdf_path) {
        // Product has a specific AGB PDF in storage
        const { data: signed } = await adminClient.storage
          .from("contracts")
          .createSignedUrl(matchedProduct.agb_pdf_path, 60 * 60 * 24 * 14);

        if (signed?.signedUrl) {
          agbDownloadUrl = signed.signedUrl;
          const agbRes = await fetch(signed.signedUrl);
          if (agbRes.ok) {
            const agbBytes = new Uint8Array(await agbRes.arrayBuffer());
            agbBase64 = toBase64(agbBytes);
            const safeName = (matchedProduct.name || "Honorarfuchs").replace(/[^a-zA-Z0-9äöüÄÖÜß\-_.]/g, "_");
            agbFilename = `AGB-${safeName}.pdf`;
            console.log(`[send-contract-confirmation] Using product AGB for "${matchedProduct.name}"`);
          }
        }
      }

      // Fallback to generic AGB
      if (!agbBase64) {
        const agbRes = await fetch(`${APP_URL}/templates/vertrag-honorarfuchs.pdf`);
        if (agbRes.ok) {
          const agbBytes = new Uint8Array(await agbRes.arrayBuffer());
          agbBase64 = toBase64(agbBytes);
        }
        console.log("[send-contract-confirmation] Falling back to generic AGB");
      }
    } catch {
      /* skip AGB */
    }

    // --- Build email ---
    // DEPRECATED — alte Stripe-Welt-Buchungslink entfernt am 08.05.2026.
    // Mail ist nun reine Brücken-Mitteilung; SEPA-Aktivierung erfolgt separat
    // über mandate-recovery / auto-invoice (NEUE Welt). Template-Override wird
    // bewusst ignoriert, damit kein alter ${buchenUrl}-Link mehr ausgespielt wird.
    {
      // Lese Override nur fürs Logging, ohne ihn anzuwenden
      const { data: legacyOverride } = await adminClient
        .from("email_template_overrides")
        .select("template_key")
        .eq("template_key", "booking-link")
        .maybeSingle();
      if (legacyOverride) {
        console.log("[send-contract-confirmation] Legacy booking-link override gefunden – ignoriert (alte Stripe-Welt abgeklemmt)");
      }
    }

    const anrede = [contract.vorname, contract.nachname].filter(Boolean).join(" ").trim();
    const greeting = anrede ? `Sehr geehrte/r ${anrede}` : "Sehr geehrte Damen und Herren";
    const hfxNr = contract.hfx_customer_number || "–";

    let html: string;
    {
      // Default hardcoded template (Brücken-Mitteilung, ohne Buchungs-Link)
      console.log("[send-contract-confirmation] Using bridge confirmation template (no Stripe link)");

      // CTA block is now inlined in the template below

      html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ihr Vertrag bei Honorarfuchs wird vorbereitet</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fa;font-family:Arial,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fa;">
    <tr><td align="center" style="padding:40px 10px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="background-color:#ffffff;max-width:600px;width:100%;">
        <tr>
          <td align="center" style="background-color:#0b367f;padding:36px 40px;">
            <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">HFX Honorarfuchs</p>
            <p style="color:#cccccc;font-size:13px;margin:6px 0 0;">Ihr Vertrag wird vorbereitet</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 24px;">
            <p style="color:#1a1a2e;font-size:16px;margin:0 0 16px;">${greeting},</p>
            <p style="color:#374151;font-size:14px;line-height:22px;margin:0 0 16px;">
              vielen Dank f&uuml;r Ihren Vertragsabschluss bei Honorarfuchs.
            </p>
            <p style="color:#374151;font-size:14px;line-height:22px;margin:0 0 16px;">
              Ihr Vertrag mit der Vertragsnummer <strong>${hfxNr}</strong> ist bei uns registriert.
            </p>
            <p style="color:#374151;font-size:14px;line-height:22px;margin:0 0 16px;">
              In den n&auml;chsten Tagen erhalten Sie eine separate E-Mail mit einem Aktivierungs-Link f&uuml;r die SEPA-Lastschrift. Bitte schlie&szlig;en Sie damit den Vorgang ab, sobald die Mail eintrifft.
            </p>
            <p style="color:#374151;font-size:14px;line-height:22px;margin:0 0 16px;">
              Bei Fragen stehen wir Ihnen unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a> zur Verf&uuml;gung.
            </p>
            <p style="color:#374151;font-size:14px;line-height:22px;margin:24px 0 0;">
              Mit freundlichen Gr&uuml;&szlig;en<br />
              <strong>Ihr Honorarfuchs-Team</strong>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              HFX Honorarfuchs &bull; Diese E-Mail wurde automatisch generiert.<br />
              &copy; ${new Date().getFullYear()} HFX Honorarfuchs
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }

    // Build attachments
    const attachments: Array<{ filename: string; content: string }> = [
      { filename: "Vertragsuebersicht.pdf", content: pdfBase64 },
    ];
    if (agbBase64) {
      attachments.push({ filename: agbFilename, content: agbBase64 });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [contract.email],
        subject: `Ihr Vertrag bei Honorarfuchs wird vorbereitet${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`,
        html,
        text: [
          `${greeting},`,
          "",
          "vielen Dank für Ihren Vertragsabschluss bei Honorarfuchs.",
          "",
          `Ihr Vertrag mit der Vertragsnummer ${hfxNr} ist bei uns registriert.`,
          "",
          "In den nächsten Tagen erhalten Sie eine separate E-Mail mit einem Aktivierungs-Link für die SEPA-Lastschrift. Bitte schließen Sie damit den Vorgang ab, sobald die Mail eintrifft.",
          "",
          "Bei Fragen stehen wir Ihnen unter info@hfx-honorarfuchs.de zur Verfügung.",
          "",
          "Mit freundlichen Grüßen",
          "Ihr Honorarfuchs-Team",
        ].join("\n"),
        attachments,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("[send-contract-confirmation] Resend error:", err);
      throw new Error(`Email send failed: ${err}`);
    }

    console.log(`[send-contract-confirmation] Email with PDF attachments sent to ${contract.email} for contract ${contract_id}`);

    await adminClient
      .from("contracts")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", contract_id);

    return new Response(
      JSON.stringify({ success: true, email: contract.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-contract-confirmation] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
