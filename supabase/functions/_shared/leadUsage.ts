// Aktivitäts-Monitoring für Interessenten in Testphase – gemeinsame Logik.
//
// Verwendet von:
//   - qodia-lead-usage-sync  (Cron, 05:30 UTC)
//   - qodia-usage-query      (Live-Abruf mit source: "lead", serverseitiges Rückschreiben)
//
// Beide Pfade nutzen exakt dieselbe Kohorten- und Delta-Logik, damit ein
// Live-Abruf niemals andere Werte schreibt als der nächtliche Cron.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// ⚠ SYNCHRONIZE ↔ src/pages/PraxenJourney.tsx (CLOSED_LEAD_STATUSES)
// Leads in diesen Status sind abgeschlossen und gehören nicht in die Kohorte.
export const CLOSED_LEAD_STATUSES = ["kein_abschluss", "abgelehnt"];

// Vertragsstatus, die einen Lead NICHT aus der Kohorte werfen.
// Ausschlusslogik (keine Whitelist!): Existiert zur hfx_customer_number
// irgendein Vertrag, dessen Status NICHT hier steht, ist der Lead aus der
// Testphase raus (entwurf, eingegangen, gezeichnet, aktiv, gesperrt, … und
// jeder künftige neue Status schließen per Default aus).
// "gekündigt" (Umlaut) ist defensiver Guard; kanonisch ist "gekuendigt".
export const TERMINAL_CONTRACT_STATUSES = ["gekuendigt", "beendet", "gekündigt"];

export interface LeadCohortRow {
  id: string;
  hfx_customer_number: string | null;
  praxis_name: string;
  email: string;
  created_at: string;
  qodia_invoice_count_total: number | null;
  qodia_last_usage_at: string | null;
}

export interface LeadUsageResult {
  lead_id: string;
  hfx_customer_number: string | null;
  customer_name: string;
  email: string;
  created_at: string;
  error: string | null;            // Klartext für UI
  error_code: "no_account" | "api_error" | "network_error" | null;
  usage: {
    rechnungscheck?: number;
    rechnungscheck_mini?: number;
    rechnungscheck_standard?: number;
  } | null;                        // Monatsfenster (identisch zum Contract-Pfad)
  count_total: number | null;      // 12-Monats-Fenster (gekappt auf created_at)
  count_month: number | null;
  last_usage_at: string | null;
}

const QODIA_USAGE_URL = "https://auth.qodia.de/api/external/usage";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Kohorte: qodia_synced = true, email not null, Lead-Status nicht geschlossen,
 * und KEIN nicht-terminaler Vertrag zur hfx_customer_number.
 */
export async function loadLeadCohort(
  admin: SupabaseClient,
  filter?: { hfx_customer_number?: string; lead_id?: string },
): Promise<{ leads: LeadCohortRow[]; excludedByContract: number }> {
  let q = admin
    .from("leads")
    .select("id, hfx_customer_number, praxis_name, email, created_at, qodia_invoice_count_total, qodia_last_usage_at")
    .eq("qodia_synced", true)
    .not("email", "is", null)
    .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`);

  if (filter?.hfx_customer_number) q = q.eq("hfx_customer_number", filter.hfx_customer_number);
  if (filter?.lead_id) q = q.eq("id", filter.lead_id);

  const { data: leads, error } = await q;
  if (error) throw new Error(`Lead-Kohorte konnte nicht geladen werden: ${error.message}`);
  if (!leads || leads.length === 0) return { leads: [], excludedByContract: 0 };

  const hfxNumbers = [...new Set(leads.map((l) => l.hfx_customer_number).filter((n): n is string => !!n))];
  const blocked = new Set<string>();

  if (hfxNumbers.length > 0) {
    // Ausschluss: irgendein Vertrag mit nicht-terminalem Status.
    const { data: contracts, error: cErr } = await admin
      .from("contracts")
      .select("hfx_customer_number, status")
      .in("hfx_customer_number", hfxNumbers)
      .not("status", "in", `(${TERMINAL_CONTRACT_STATUSES.join(",")})`);
    if (cErr) throw new Error(`Verträge konnten nicht geladen werden: ${cErr.message}`);
    for (const c of contracts ?? []) {
      if (c.hfx_customer_number) blocked.add(c.hfx_customer_number);
    }
  }

  const cohort = leads.filter((l) => !l.hfx_customer_number || !blocked.has(l.hfx_customer_number)) as LeadCohortRow[];
  return { leads: cohort, excludedByContract: leads.length - cohort.length };
}

type QodiaCall =
  | { ok: true; usage: Record<string, number> }
  | { ok: false; code: "no_account" | "api_error" | "network_error"; message: string };

async function callQodiaUsage(
  apiKey: string,
  email: string,
  startDate: string,
  endDate: string,
  logPrefix: string,
): Promise<QodiaCall> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(QODIA_USAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ email, startDate, endDate }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(raw); } catch { /* not JSON */ }

      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after")) || 3;
        console.log(`${logPrefix} 429 für ${email} – Retry in ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok || !data.success) {
        const msg = (data.error as string) || (data.message as string) || `Fehler ${res.status}`;
        const noAccount = (res.status === 403 || res.status === 404) &&
          (msg === "Access denied" || msg === "User not found");
        return noAccount
          ? { ok: false, code: "no_account", message: "Kein Qodia-Account vorhanden" }
          : { ok: false, code: "api_error", message: msg };
      }
      return { ok: true, usage: (data.usage ?? {}) as Record<string, number> };
    } catch {
      return { ok: false, code: "network_error", message: "Netzwerkfehler" };
    }
  }
  return { ok: false, code: "api_error", message: "Rate-Limit (429) nach Retry" };
}

function sumUsage(u: Record<string, number>): number {
  return (u.rechnungscheck ?? 0) + (u.rechnungscheck_mini ?? 0) + (u.rechnungscheck_standard ?? 0);
}

/**
 * Holt Usage für EINEN Lead (12-Monats-Fenster + laufender Monat), wendet die
 * Delta-Logik gegen qodia_invoice_count_total an und schreibt das Ergebnis
 * auf den Lead zurück.
 *
 * Delta-Logik:
 *   - Erstbefüllung (gespeichert NULL): last_usage_at = now NUR wenn
 *     count_month > 0. Bei total > 0 aber month = 0 bleibt NULL – die letzte
 *     Aktivität liegt irgendwo in den 12 Monaten, ist aber unbekannt (UI zeigt
 *     dafür den gelben Zustand „Letzte Aktivität unbekannt").
 *   - Folgeläufe: total > gespeichert         → last_usage_at = now
 *   - Rückgang / gleich                       → last_usage_at unverändert
 * Fehler: nur qodia_usage_error wird gesetzt; Zähler/synced_at bleiben stehen.
 */
export async function syncLeadUsage(
  admin: SupabaseClient,
  apiKey: string,
  lead: LeadCohortRow,
  logPrefix: string,
  now: Date = new Date(),
): Promise<LeadUsageResult> {
  const base = {
    lead_id: lead.id,
    hfx_customer_number: lead.hfx_customer_number,
    customer_name: lead.praxis_name,
    email: lead.email,
    created_at: lead.created_at, // für Alters-Kopplung der Ampel (total = 0) im UI
  };

  const today = fmt(now);
  // 12-Monats-Fenster (API-Limit 365 Tage), gekappt auf created_at.
  const yearAgo = new Date(now); yearAgo.setDate(yearAgo.getDate() - 364);
  const created = new Date(lead.created_at);
  const totalStart = fmt(created > yearAgo ? created : yearAgo);
  const monthStart = `${today.slice(0, 7)}-01`;

  const totalCall = await callQodiaUsage(apiKey, lead.email, totalStart, today, logPrefix);
  if (!totalCall.ok) {
    await admin.from("leads").update({ qodia_usage_error: totalCall.code }).eq("id", lead.id);
    console.log(`${logPrefix} ${lead.hfx_customer_number ?? lead.id} → ${totalCall.code}: ${totalCall.message}`);
    return { ...base, error: totalCall.message, error_code: totalCall.code, usage: null, count_total: null, count_month: null, last_usage_at: lead.qodia_last_usage_at };
  }

  const monthCall = await callQodiaUsage(apiKey, lead.email, monthStart, today, logPrefix);
  if (!monthCall.ok) {
    await admin.from("leads").update({ qodia_usage_error: monthCall.code }).eq("id", lead.id);
    return { ...base, error: monthCall.message, error_code: monthCall.code, usage: null, count_total: null, count_month: null, last_usage_at: lead.qodia_last_usage_at };
  }

  const countTotal = sumUsage(totalCall.usage);
  const countMonth = sumUsage(monthCall.usage);
  const stored = lead.qodia_invoice_count_total;

  let lastUsageAt = lead.qodia_last_usage_at;
  if (stored === null) {
    // Erstbefüllung: nur echte Aktivität im laufenden Monat datieren.
    if (countMonth > 0) lastUsageAt = now.toISOString();
  } else if (countTotal > stored) {
    lastUsageAt = now.toISOString();
  }

  const { error: upErr } = await admin
    .from("leads")
    .update({
      qodia_invoice_count_total: countTotal,
      qodia_invoice_count_month: countMonth,
      qodia_last_usage_at: lastUsageAt,
      qodia_usage_synced_at: now.toISOString(),
      qodia_usage_error: null,
    })
    .eq("id", lead.id);

  if (upErr) {
    console.error(`${logPrefix} Rückschreiben fehlgeschlagen für ${lead.id}:`, upErr.message);
    return { ...base, error: `DB-Fehler: ${upErr.message}`, error_code: "api_error", usage: monthCall.usage, count_total: countTotal, count_month: countMonth, last_usage_at: lastUsageAt };
  }

  console.log(`${logPrefix} ${lead.hfx_customer_number ?? lead.id} → total=${countTotal} (vorher ${stored ?? "NULL"}), month=${countMonth}`);
  return { ...base, error: null, error_code: null, usage: monthCall.usage, count_total: countTotal, count_month: countMonth, last_usage_at: lastUsageAt };
}
