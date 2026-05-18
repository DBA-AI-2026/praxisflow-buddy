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
