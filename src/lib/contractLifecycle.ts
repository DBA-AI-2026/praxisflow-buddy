/**
 * Zentrale Lifecycle-Helper für Verträge.
 *
 * isWaitingForMandate: Vertrag hängt zwischen "SEPA-Mandat-Mail raus"
 * und "Kunde hat Bankverbindung hinterlegt". Gilt für beide Wege:
 *   - Pfad A (eingegangen): Mail 1 versendet, wartet auf Mandat
 *   - Pfad B (gezeichnet):  Kunde hat über /buchen gebucht, wartet
 *                           noch auf Stripe-SEPA-Bestätigung
 *
 * Voraussetzung: status ∈ {eingegangen, gezeichnet}, mandate_email_sent_at
 * gesetzt, customer_confirmed_at noch NULL.
 */
export function isWaitingForMandate(c: {
  status?: string | null;
  mandate_email_sent_at?: string | null;
  customer_confirmed_at?: string | null;
}): boolean {
  return (
    (c.status === "eingegangen" || c.status === "gezeichnet") &&
    !!c.mandate_email_sent_at &&
    !c.customer_confirmed_at
  );
}

/**
 * Ermittelt die Kündigungsfrist (in Monaten) für eine Vertragserzeugung
 * anhand der ausgewählten Produkte.
 *
 * - Matcht `selectedNames` gegen `products.name` und sammelt deren
 *   `cancellation_period_months`.
 * - Genau ein Treffer → dessen Wert.
 * - Mehrere Treffer → MAX (kein Produkt darf unter-fristet werden).
 * - Kein Treffer / leere Auswahl → Fallback 6 Monate.
 *   Der Fallback entspricht dem bisherigen hartkodierten UI-De-facto-Wert.
 *   Absichtlich NICHT der DB-Default 3 und NICHT 0 (nur GOÄ ist heute 0).
 *
 * Keine hartkodierten Produktnamen — die Zuordnung geschieht ausschließlich
 * über die `products`-Tabelle.
 */
export function getCancellationPeriodForProducts(
  selectedNames: string[],
  products: { name: string; cancellation_period_months: number | null }[],
): number {
  const FALLBACK = 6;
  if (!selectedNames?.length || !products?.length) return FALLBACK;

  const matched = selectedNames
    .map((n) => products.find((p) => p.name === n))
    .filter((p): p is { name: string; cancellation_period_months: number | null } => !!p)
    .map((p) => p.cancellation_period_months)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (matched.length === 0) return FALLBACK;
  return Math.max(...matched);
}

/** Heutiges Datum als ISO-Kalendertag "YYYY-MM-DD" (lokale Kalenderwerte). */
function todayIso(): string {
  const d = new Date();
  return toIsoDay(d.getFullYear(), d.getMonth(), d.getDate());
}

function toIsoDay(y: number, mZeroBased: number, day: number): string {
  const mm = String(mZeroBased + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Berechnet das effektive Vertragsende aus Kündigungsdatum und Kündigungsfrist.
 *
 * N = cancellationPeriodMonths ?? 0. Ergebnis ist der LETZTE Kalendertag des
 * Monats (cancellationDate + N Monate), als ISO-Date "YYYY-MM-DD".
 *
 * Rechnung bewusst auf Kalendertag-Ebene (lokale Jahr/Monat/Tag-Werte,
 * `new Date(y, m + N + 1, 0)`), NICHT über toISOString() auf einem UTC-Date —
 * das würde je nach Zeitzone einen Off-by-one-Tag erzeugen.
 *
 * Beispiele:
 *   (2026-03-12, 0) -> "2026-03-31"
 *   (2026-03-31, 0) -> "2026-03-31"
 *   (2026-03-20, 1) -> "2026-04-30"
 */
export function computeEffectiveEndDate(
  cancellationDate: string | Date,
  cancellationPeriodMonths: number | null,
): string {
  const n = cancellationPeriodMonths ?? 0;

  let y: number;
  let m: number;
  if (cancellationDate instanceof Date) {
    y = cancellationDate.getFullYear();
    m = cancellationDate.getMonth();
  } else {
    const [ys, ms] = cancellationDate.split("-");
    y = Number(ys);
    m = Number(ms) - 1;
  }

  // Tag 0 des Folgemonats = letzter Tag des Zielmonats
  const last = new Date(y, m + n + 1, 0);
  return toIsoDay(last.getFullYear(), last.getMonth(), last.getDate());
}

/**
 * Abgeleiteter Zustand "gekündigt, läuft aus" (Modell A):
 * Vertrag ist noch aktiv, hat aber ein effektives Enddatum in der Zukunft
 * (bzw. heute — der Vertrag läuft bis einschließlich Enddatum).
 *
 * Reiner Lesehelfer, seiteneffektfrei.
 */
export function isCancelledRunningOut(c: {
  status?: string | null;
  effective_end_date?: string | null;
  cancellation_date?: string | null;
}): boolean {
  if (c.status !== "aktiv") return false;
  if (!c.effective_end_date) return false;
  return c.effective_end_date >= todayIso();
}

/**
 * true, wenn das effektive Enddatum gesetzt und bereits vergangen ist
 * (Tagesebene, exklusiv: am Enddatum selbst läuft der Vertrag noch).
 *
 * Reiner Lesehelfer — kippt/ändert nichts. Ein späterer Cron kann dieselbe
 * Bedingung nutzen, um Verträge auf "beendet" zu setzen.
 */
export function isCancellationEffective(c: {
  effective_end_date?: string | null;
}): boolean {
  if (!c.effective_end_date) return false;
  return c.effective_end_date < todayIso();
}
