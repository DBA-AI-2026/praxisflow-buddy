/**
 * Zentrales Glossar für Status- und Phasen-Beschreibungen.
 * Wird in Tooltips, Hilfe-Texten und Anleitungen verwendet.
 *
 * Vorratsarbeit: Manche Einträge werden erst nach geplantem
 * Pipeline-/Dashboard-Umbau in der UI angezeigt.
 */

export const LEAD_STATUS_TOOLTIPS: Record<string, string> = {
  neu: "Neuer Lead — wurde noch nicht kontaktiert.",
  in_kontakt: "Lead wurde kontaktiert, Gespräch läuft.",
  termin_vereinbart: "Demo-/Beratungstermin ist gebucht.",
  demo_durchgefuehrt: "Demo wurde gehalten, Entscheidung steht aus.",
  angebot_versendet: "Angebot/Vertragsentwurf wurde an den Lead geschickt.",
  verhandlung: "Konditionen werden noch verhandelt.",
  gewonnen: "Lead hat zugesagt — wird zum Vertrag konvertiert.",
  verloren: "Lead hat abgesagt oder reagiert nicht mehr.",
  on_hold: "Lead pausiert auf Wunsch des Interessenten.",
};

export const CONTRACT_STATUS_TOOLTIPS: Record<string, string> = {
  entwurf: "Vertrag wurde angelegt, aber noch nicht final ausgefüllt.",
  bereit_zur_unterschrift: "Vertrag ist vollständig und kann unterschrieben werden.",
  unterschrieben: "Vertrag ist digital unterschrieben — Zahlung/Mandat steht aus.",
  warte_auf_mandat: "SEPA-Mandat-Mail versendet, Kunde muss Bankverbindung hinterlegen.",
  warte_auf_zahlung: "Erste Zahlung/Setup ausstehend.",
  aktiv: "Vertrag läuft, Kunde wird abgerechnet.",
  pausiert: "Vertrag temporär pausiert (z. B. Praxisurlaub).",
  gekuendigt: "Vertrag wurde gekündigt, läuft bis Vertragsende.",
  beendet: "Vertrag ist abgelaufen oder vollständig beendet.",
  storniert: "Vertrag wurde vor Aktivierung storniert.",
};

export const PHASE_TOOLTIPS: Record<string, string> = {
  sepa_mandat:
    "SEPA-Mandat: Stripe-Link wurde an den Kunden versendet. Der Kunde muss diesen Link öffnen und seine Bankverbindung hinterlegen.",
  vertragsunterlagen:
    "Vertragsunterlagen: Vertrags-PDF und AGB wurden per E-Mail an den Kunden versendet.",
  mandat_erteilt:
    "Mandat erteilt: Der Kunde hat seine SEPA-Bankverbindung erfolgreich hinterlegt — Vertrag kann aktiviert werden.",
};
