# Plan: Bezahlseite, Admin-Funktionen, öffentliche Links

Einordnung nach SAFE_CHANGE_PLAN: Teil 1 und 2 sind **Kategorie 2** (Functions mit Review, Tests offline). Teil 3, die Begrenzung, ist **Kategorie 3**, weil Kundenstrecken mit Geldbezug betroffen sind. Bis zur Freigabe ändere ich nichts.

## 1. create-contract-subscription (Bezahlseite für einen Vertrag)

**Bestand:** Die Function prüft nur, ob jemand angemeldet ist (`index.ts:59–63`). Danach lädt sie **jeden** Vertrag mit Service-Zugang (:73–80) und erzeugt eine Stripe-Bezahlseite. Bei Fehlern kommt immer 500 mit Fehlertext, nie 401/403/404. Aufrufer ist nur `src/pages/vertrieb/Vertraege.tsx:2104`.

**Vorschlag (wie Häppchen 2):**
- `requireActiveRole(req, ["admin","sales_lead","regional_lead","user"])`. sales_partner, tippgeber und vertragsabteilung bekommen 403.
- Zuständigkeit über `_shared/contractAccess.ts`:
  - admin und sales_lead dürfen alle Verträge.
  - user: Ersteller oder Betreuer.
  - regional_lead: zusätzlich das eigene Team.
  - Bei einem fremden Vertrag gibt es 403.
- Fehlende `contract_id` ergibt 400, ein unbekannter Vertrag 404.
- Unverändert bleiben die Stripe-Positionen, die Rücksprungadressen und die Wiederverwendung offener Sessions.
- Benannt, nicht im Umfang: Die Rücksprungadresse wird aus dem `origin`-Header gebaut (:143). Außerdem ist `esm.sh`/`serve` nicht prüfbar, weil der Import oben nicht gelesen wurde.

## 2. reset-user-mfa und salesforce-disconnect

**Bestand:** Beide prüfen den Admin richtig, nämlich die aktive Rolle (`reset-user-mfa/index.ts:30–60`, `salesforce-disconnect/index.ts:20–50`), aber jeweils mit eigenem Code. reset-user-mfa wird von `admin/Users.tsx:363` aufgerufen. Für salesforce-disconnect gibt es **keinen Aufrufer** im Portal.

**Vorschlag:**
- Beide bekommen `requireActiveRole(req, ["admin"], corsHeaders)`, der eigene Prüfcode entfällt.
- Fachlich ändert sich nichts. Die Rückmeldungen für Nicht-Admins kommen dann vom Guard (401/403 mit dessen Text). Die deutsche Meldung „Nur Administratoren können MFA zurücksetzen." entfällt. Bitte entscheiden, ob das so bleiben darf.

## 3. Öffentliche Links: erratbar?

| Link | Erkennungsmerkmal | Erratbar? |
|---|---|---|
| Buchen-Knopf (buchen-submit) | Vertrags-ID (UUID, `gen_random_uuid()`), nur Status `eingegangen` | nein, 122 Zufallsbits |
| Ältere Buchung (initiate-booking) | dieselbe Vertrags-ID, nur `eingegangen` | nein |
| Mandats-Link (mandate-link) | Vertrags-ID, Status `eingegangen`, `wartend_auf_mandat` oder `aktiv` | nein |
| Kampagnen-Link (campaign-start) | Code `hfxc_` + 32 Zufallsbytes (`_shared/campaign.ts:52–55`) | nein |

Die IDs lassen sich nicht erraten. Das echte Risiko ist ein **weitergegebener oder mitgelesener Link**: Er läuft nie ab und ist mehrfach nutzbar.
- Mit einem bekannten Link kann man Stammdaten und AGB-Zustimmung beliebig oft überschreiben. Heute gibt es bis zu 4 AGB-Einträge je Vertrag.
- Man kann wiederholt Mandats-Mails und Stripe-Sitzungen auslösen.
- Beim Mandats-Link lässt sich auch an aktiven Verträgen eine neue Sitzung erzeugen, die in Gate 6 aber abgefangen wird.

Bestand heute: 6 Verträge im Status `eingegangen`, 1 Kampagnen-Code, 0 eingelöst.

**Begrenzung, Vorschlag.** Wichtig: Der Server hat **keine fertige Bremse für Aufrufe**, das wäre eine Eigenlösung. Ich schlage deshalb eine Zählung in der Datenbank vor, je Vertrag bzw. Code und nicht je IP-Adresse, weil sie dauerhaft gilt:
- buchen-submit und initiate-booking: höchstens **5 Absendungen je Vertrag und Stunde**, darüber 429.
- mandate-link: höchstens **10 neue Stripe-Sitzungen je Vertrag und Tag**. Darüber leitet der Link auf die bestehende Info-Seite um, wie heute bei Fehlern.
- campaign-start: höchstens **10 Aufrufe je Code und Tag**, darüber geht es auf die Info-Seite.
- Gezählt wird über `customer_events`, das schreiben buchen-submit und campaign-start schon. Alternativ kommt eine kleine neue Zähltabelle hinzu, nur für den Server. Das braucht eine Migration.

Echte Nutzung ist 1–4 Absendungen je Vertrag insgesamt, deshalb stören diese Werte normale Kunden nicht.

**Nicht im Vorschlag (benannt):** Ablaufdatum der Links, Code nach Einlösung ungültig machen, ältere Buchungsstrecke abschalten (wird sie noch gebraucht?).

## Was brechen könnte

- Bezahlseite: Wer einen fremden Vertrag öffnet, bekommt 403 statt einer Bezahlseite. Das betrifft auch vertragsabteilung, falls diese Rolle den Knopf nutzt. Bitte entscheiden, ob vertragsabteilung dazugehört.
- MFA-Reset: Die Meldungstexte ändern sich, sonst nichts.
- Begrenzung: Ein Kunde, der sehr oft neu lädt oder neu absendet, sieht eine Hinweis-Seite. Kampagnen-Massenaufrufe sind nicht betroffen, weil sie über campaign-mint-runner laufen, nicht über campaign-start.

## Abnahme

- Lokale Tests mit nachgebauter Datenbank, keine Live-Aufrufe:
  - Bezahlseite: je Rolle eigener, fremder und Betreuer-Vertrag; sales_partner 403; ohne Anmeldung 401.
  - MFA und Salesforce: Admin erlaubt, alle anderen 403.
  - Begrenzung: der jeweils erste Aufruf über dem Limit wird abgewiesen.
- Datei:Zeile der Prüfungen, danach Publish und Sync.

## Offene Entscheidungen

1. vertragsabteilung bei der Bezahlseite: ja oder nein?
2. Deutsche Meldung beim MFA-Reset behalten (eigene Antwort nach dem Guard) oder Guard-Standard?
3. Begrenzung bauen (Eigenlösung, Kategorie 3) oder erst einmal nur Teil 1 und 2?
4. Zähler über `customer_events` oder eigene Zähltabelle?
