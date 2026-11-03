# Plan: capture-lead härten (Auftrag 3)

Einordnung nach SAFE_CHANGE_PLAN: **Kategorie 3**. Das ist ein öffentlicher Eingang mit Zugangsdaten, Qodia und Salesforce. Nötig sind ein Rollback-Pfad, Offline-Tests und ein Test an einer Testadresse, nie an echten Interessenten. Bis zur Freigabe ändere ich nichts.

Unverändert bleiben: die öffentliche Erreichbarkeit, die Felder, die Antworten (200 Erfolg, 200 `duplicate`, 400, 500) und CORS.

## Bestand (nur gelesen)

- **Klartext-Passwort:**
  - Das Passwort wird erzeugt (`index.ts:418`) und in `lead_credentials` gespeichert (:569).
  - Es steht in der Willkommensmail (:121, :236). Bei einer bekannten E-Mail wird es erneut verschickt (:363–383).
  - Es ist das Passwort für das **Qodia-Konto** (die HFX-GOÄ-Anwendung), nicht für unser Portal.
- **Reihenfolge:** Die Mail geht zuerst raus (:600–630), Qodia kommt erst danach (:787–835). Scheitert Qodia, hat der Interessent bereits Zugangsdaten. Markiert wird der Lead nur bei Status 409 (`qodia_conflict`).
- **Erneuter Versand:** Bei jeder Absendung mit bekannter E-Mail geht eine Mail raus, ohne Zeitsperre. Gezählt wird nur `registration_attempts`, bisher höchstens 3.
- **Protokoll:** Der vollständige Request landet im Protokoll (:281), dazu die E-Mail-Adresse in weiteren Zeilen (:354, :413, :561, :620).
- **Dubletten:** Bei `source: "manual"` legt die Funktion **bewusst** einen neuen Lead an, auch wenn die E-Mail schon existiert (:351, :412). Heute gibt es 3 doppelte E-Mails.
  - **Wichtiger Fund:** `source` kommt ungeprüft aus dem Request. Jeder kann von außen `"manual"` senden und so die Dublettenprüfung umgehen.
- **Begrenzung:** keine.
- **Nutzung:** 23 Leads in 30 Tagen, höchstens 4 Homepage-Leads an einem Tag.

## Vorschlag

1. **Kein Klartext-Passwort, sondern ein Link.** Das ist der Knackpunkt: Das Passwort gehört zu Qodia, und eine Qodia-Schnittstelle zum Setzen eines Passworts ist im Code nicht bekannt. Bekannt sind nur sign-up, update-plan, usage und users. Drei Wege:
   - **(a)** Das Qodia-Konto bekommt ein zufälliges Passwort, das niemand erfährt. Die Mail enthält einen Link zur Anwendung und die Anleitung „Passwort vergessen → 6-stelliger Code". Den zeitlich begrenzten Code verschickt Qodia selbst. Diese Anleitung steht heute schon in der Mail (:134). Das ist ohne Qodia-Abstimmung machbar, aber es ist ein Code, kein eigener Link.
   - **(b)** Es gibt einen eigenen Link `…/zugang-setzen?token=…`, 72 Stunden gültig und nur einmal nutzbar. Gespeichert wird nur ein Hash des Codes. Die Seite setzt das Passwort über eine Qodia-Schnittstelle. Dafür **brauchen wir diese Schnittstelle von Qodia**, das ist ein externer Blocker.
   - **(c)** Qodia liefert beim sign-up einen Einladungslink, den wir weiterreichen. Auch das braucht Qodia.

   Empfehlung: jetzt (a), später (b) oder (c), wenn Qodia liefert. `lead_credentials` wird von capture-lead dann nicht mehr beschrieben, und der Bestand bleibt.
2. **Qodia zuerst, Mail danach.**
   - Klappt der sign-up, geht die Zugangsmail raus.
   - Scheitert er (Fehler, Zeitüberschreitung, 409), geht **keine Zugangsmail** raus. Der Lead wird markiert: `qodia_synced=false`, bei 409 zusätzlich `qodia_conflict=true`, neu kommt das Feld `qodia_signup_error` (Fehlertext gekürzt, ohne Daten). Dazu gibt es ein Ereignis `QODIA_SIGNUP_FAILED` im Verlauf.
   - Die Antwort an das Formular bleibt 200 wie heute. Die Mail an den AD geht weiter raus und erwähnt den Fehlschlag.
3. **Erneuter Versand höchstens einmal in 24 Stunden.**
   - Bei einer bekannten E-Mail wird nur verschickt, wenn `credentials_sent_at` älter als 24 Stunden ist. Danach wird das Feld neu gesetzt.
   - Die Antwort bleibt unverändert `200 duplicate`, auch wenn nichts verschickt wird.
   - Die erneute Mail enthält kein Passwort mehr, sondern die Anleitung aus Punkt 1.
4. **Begrenzung je IP-Adresse.** Hinweis: Der Server hat **keine fertige Bremse**, das wäre eine Eigenlösung.
   - Vorschlag: eine kleine Zähltabelle in der Datenbank (IP nur als Hash, Einträge nach 2 Tagen gelöscht).
   - Grenze: **5 Absendungen je IP und Stunde, 20 je Tag**. Das ist weit über der echten Nutzung von höchstens 4 am Tag insgesamt.
   - Angemeldete interne Aufrufe aus dem Portal sind ausgenommen.
   - Die IP kommt aus `x-forwarded-for`, das funktioniert auch beim HubSpot-Formular im Browser.
   - **Entscheidung:** Über der Grenze entweder **(i) 429** (neuer Statuscode, das widerspricht „Antworten unverändert") oder **(ii) still 200 ohne Wirkung**, ohne Lead und ohne Mail.
5. **Protokoll schlank.** Der Request wird nicht mehr protokolliert, und E-Mail-Adressen fallen aus allen Zeilen. Es bleiben je Aufruf eine Zeile `lead_id` (bzw. „duplicate"/„rejected") und das Ergebnis, zusätzlich Qodia, Mail und Salesforce jeweils als ok/fehlgeschlagen.
6. **Dublette bei manueller Anlage verhindern.**
   - `source: "manual"` gilt nur noch bei angemeldetem Aufruf mit interner Rolle (user, regional_lead, sales_lead, admin). Sonst wird der Aufruf als `homepage` behandelt, und die Umgehung von außen ist geschlossen.
   - Auch bei manueller Anlage mit bekannter E-Mail antwortet die Funktion `200 duplicate` mit der vorhandenen HFX-Nummer und legt **keinen** neuen Lead an. Mails werden dabei nicht verschickt.
   - Der Dialog zur Lead-Anlage zeigt diese Meldung schon heute an (`CreateLeadDialog.tsx:339`). Im Portal ändert sich also nichts.
   - Den Bestand von 3 doppelten E-Mails fasse ich nicht an, ich benenne ihn nur.

## Was brechen könnte

- Interessenten bekommen kein Passwort mehr in der Mail. Ohne den Weg „Passwort vergessen" in der Anwendung kommen sie nicht hinein. Ob das in der Qodia-Anwendung für neue Konten funktioniert, prüfen wir an einer Testadresse.
- `sync-lead-qodia` liest weiter Passwörter aus `lead_credentials` und erzeugt neue (:99–122). Für neue Leads gibt es dort keins mehr, dann wird eins erzeugt. Das ist nicht im Umfang, ich benenne es nur.
- Bei Qodia-Ausfällen bekommen Interessenten keine Mail. Der AD muss nachfassen, und für den erneuten Abgleich gibt es schon den Abgleich im Lead.
- Absichtliche zweite Leads mit derselben E-Mail, z. B. eine zweite Praxis derselben Ärztin, sind nicht mehr möglich. Bitte bestätigen.
- Bei 429 (Variante 4i) könnte das HubSpot-Formular eine Fehlermeldung zeigen.

## Abnahme

- Offline-Tests mit dem echten Ablauf, Datenbank, Qodia, Mail und Salesforce nachgebaut:
  - Reihenfolge: Qodia ok → Mail; Qodia-Fehler → keine Mail, Lead markiert.
  - Kein Passwort in der Mail.
  - Duplicate innerhalb von 24 Stunden → keine Mail, nach 24 Stunden → Mail.
  - IP-Grenze.
  - `manual` ohne Anmeldung → wie homepage.
  - `manual` mit bekannter E-Mail → duplicate ohne neuen Lead.
  - Protokoll ohne E-Mail und ohne Request.
  - Antwortformate unverändert, verglichen mit dem heutigen Stand.
- Danach ein Durchlauf an einer Testadresse, erst nach deiner Freigabe.

## Offene Entscheidungen

1. Passwort: Weg (a) jetzt, (b) oder (c) mit Qodia klären?
2. IP-Grenze: 429 oder still 200?
3. Zweite Leads mit derselben E-Mail wirklich nie mehr, auch nicht durch Admins?
4. Neues Feld `qodia_signup_error` am Lead (Migration) in Ordnung?

## Technische Details

- Migration: `leads.qodia_signup_error text NULL`. Neue Tabelle `capture_lead_rate (ip_hash text, created_at timestamptz)` mit RLS ohne Policies, nur für den Service-Zugang, Index auf `(ip_hash, created_at)`. Bei jedem Aufruf werden Einträge älter als 2 Tage gelöscht.
- Die Willkommensmail (`buildConfirmationEmail`) bekommt kein `generated_password` mehr, das Feld wird entfernt.
- Tests: `src/test/capture-lead-hardening.test.ts`, gleiches Muster wie die Phase-2-Tests.
