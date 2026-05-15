/**
 * Zentrales Glossar für Status- und Phasen-Beschreibungen.
 * Wird in Tooltips, Hilfe-Texten und Anleitungen verwendet.
 *
 * Vorratsarbeit: Manche Einträge werden erst nach geplantem
 * Pipeline-/Dashboard-Umbau in der UI angezeigt.
 */

export const LEAD_STATUS_TOOLTIPS: Record<string, string> = {
  neu: "Lead ist frisch eingegangen. Vertriebler hat noch nicht reagiert.",
  kontaktiert: "Erster Kontakt erfolgt, Vertriebler bleibt dran.",
  qualifiziert:
    "Vertriebler hat den Lead geprüft und für ernsthaft befunden. Bereit für Vertragsanlage.",
  vertrag:
    "Vertrag ist in Erstellung. Der zugehörige Vertrag erscheint im Abschlussphase-Tab.",
  kein_abschluss: "Lead ist abgesprungen oder hat keinen Vertrag abgeschlossen.",
  abgelehnt: "Lead wurde vom Vertrieb als ungeeignet abgelehnt.",
  kunde: "Lead wurde zu einem aktiven Vertrag konvertiert.",
};

export const CONTRACT_STATUS_TOOLTIPS: Record<string, string> = {
  entwurf:
    "Vertrag ist angelegt, aber noch nicht aktiviert. Daten können noch ergänzt werden.",
  eingegangen:
    "Vertrag ist aktiviert und die SEPA-Mandat-Mail ist versendet. Wartet auf Mandat-Erteilung durch den Kunden.",
  aktiv: "Vertrag läuft. SEPA-Mandat erteilt, Abrechnung läuft.",
  gekuendigt:
    "Vertrag wurde gekündigt. Endedatum gesetzt, läuft bis dahin weiter.",
  beendet: "Vertrag hat das Endedatum erreicht oder wurde sofort beendet.",
};

export const PHASE_TOOLTIPS: Record<string, string> = {
  sepa_mandat:
    "SEPA-Mandat: Stripe-Link wurde an den Kunden versendet. Der Kunde muss diesen Link öffnen und seine Bankverbindung hinterlegen.",
  vertragsunterlagen:
    "Vertragsunterlagen: Vertrags-PDF und AGB wurden per E-Mail an den Kunden versendet.",
  mandat_erteilt:
    "Mandat erteilt: Der Kunde hat seine SEPA-Bankverbindung erfolgreich hinterlegt — Vertrag kann aktiviert werden.",
};
