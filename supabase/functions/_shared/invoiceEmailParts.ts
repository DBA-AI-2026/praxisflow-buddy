// Shared invoice email HTML parts.
// HTML/Styles wurden byte-identisch aus auto-invoice/index.ts extrahiert
// (Positions-Rows, Table-Wrapper, Totals-Block, Zahlungs-Hinweisboxen).
// Änderungen hier wirken auf ALLE Konsumenten – keine Umgestaltung ohne Design-Freigabe.

export interface InvoicePosition {
  description: string;
  quantity: number;
  unit_price: number;
}

export function renderPositionsRows(positions: InvoicePosition[]): string {
  return positions.map((p) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${p.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(p.unit_price).toFixed(2)} €</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(p.quantity * p.unit_price).toFixed(2)} €</td>
          </tr>`).join("");
}

export function renderPositionsTable(positionsHtml: string): string {
  return `<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;">
      <thead><tr>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:left;font-size:12px;">Beschreibung</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Menge</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Einzelpreis</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Gesamt</th>
      </tr></thead>
      <tbody>${positionsHtml}</tbody>
    </table>`;
}

export function renderTotalsBlock(args: { net: number; tax: number; gross: number }): string {
  const { net, tax, gross } = args;
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Nettobetrag:</span><strong>${net.toFixed(2)} €</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6b7280;"><span>MwSt. (19%):</span><span>${tax.toFixed(2)} €</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:16px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${gross.toFixed(2)} €</strong></div>
    </div>`;
}

export function renderStripeFailedBox(opts: { includeRetryHint?: boolean } = {}): string {
  const retryHint = opts.includeRetryHint
    ? `<p style="margin:6px 0 0;font-size:13px;color:#8a4b00;">Der automatische SEPA-Einzug für diese Rechnung ist beim ersten Versuch fehlgeschlagen. Wir versuchen den Einzug automatisch erneut. Sie müssen aktuell <strong>nichts unternehmen</strong>.</p>`
    : "";
  return `<div style="background:#fff4e5;border:1px solid #ffb74d;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#8a4b00;"><strong>⚠️ Hinweis: Automatischer Einzug aktuell nicht möglich</strong></p>
              ${retryHint}
              <p style="margin:6px 0 0;font-size:13px;color:#8a4b00;">Bei Rückfragen wenden Sie sich bitte an <a href="mailto:info@hfx-honorarfuchs.de" style="color:#8a4b00;">info@hfx-honorarfuchs.de</a>.</p>
            </div>`;
}

export function renderSepaOkBox(opts: { collectionDate?: string; usageHint?: string } = {}): string {
  const dateLine = opts.collectionDate
    ? `<p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📅 <strong>Einzugsdatum:</strong> ${opts.collectionDate}</p>`
    : "";
  const usageLine = opts.usageHint
    ? `<p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">📊 <strong>Enthält Nutzungsgebühren:</strong> ${opts.usageHint}</p>`
    : "";
  return `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
              <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>🔄 Automatischer Einzug (SEPA via Stripe)</strong></p>
              <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Der Betrag wird automatisch von Ihrem hinterlegten SEPA-Konto eingezogen.</p>
              ${dateLine}
              ${usageLine}
            </div>`;
}
