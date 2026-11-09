# API-Referenz — Edge Functions

Stand: 03.11.2026. Reine Bestandsaufnahme aus dem Quellcode (`supabase/functions/`), keine Funktion wurde dafür aufgerufen. Zeilenangaben beziehen sich auf diesen Stand.

Basis-URL aller Functions: `https://<backend>/functions/v1/<name>`

---

## capture-lead

> **Geändert am 03.11.2026 (Auftrag 3).** Diese Punkte gehen den Abschnitten unten vor. Felder, Antworten (200 / 200 duplicate / 400 / 500) und CORS sind unverändert.
> - **Reihenfolge:** Zuerst kommt der Qodia-Sign-up (15 s Zeitlimit), danach die Zugangsmail. Scheitert Qodia, geht **keine** Mail an den Interessenten. Der Lead bekommt dann `qodia_synced=false`, `qodia_signup_error` und bei 409 `qodia_conflict=true`. Dazu kommt das Ereignis `QODIA_SIGNUP_FAILED`. Die AD-Mail erhält einen Warnkasten, der Betreff endet auf „– Zugang nicht angelegt". Die Eingangsbestätigung an den Interessenten verschickt in diesem Fall HubSpot.
> - **Erstmail** enthält **kein Passwort** mehr (seit 09.11.2026). Der Lead vergibt sein Passwort selbst über „Passwort vergessen?“ (Code 5 Minuten gültig). Betreff unverändert, Subheadline „Ihr Zugang zu HFX.GOÄ“.
> - **Erneuter Versand** bei bekannter E-Mail: höchstens einmal in 24 Stunden (`credentials_sent_at`), **ohne Passwort**, nur mit dem Weg über „Passwort vergessen". Betreff: „Ihr Zugang zu HFX.GOÄ – HFX Honorarfuchs". Die Antwort bleibt gleich, auch wenn nichts verschickt wird.
> - **`source: "manual"`** gilt nur für angemeldete Aufrufe mit aktiver Rolle, von außen gilt immer `homepage`. Auch bei manueller Anlage gibt es **keinen** zweiten Lead mit derselben E-Mail, sondern `200 duplicate` mit der vorhandenen HFX-Nummer, ohne Mail.
> - **IP-Grenze** (nur öffentliche Aufrufe): 5 je Stunde und 20 je Tag. Darüber kommt still 200 `{"success": true, "message": "Ihre Anfrage wurde erfolgreich übermittelt."}` ohne Wirkung. Die Zählung läuft in `capture_lead_rate`, nur über einen SHA-256-Hash der IP. Einträge älter als 2 Tage werden gelöscht. Ist die Zählung nicht möglich, wird der Aufruf zugelassen.
> - **Protokoll:** Kein Request, keine E-Mail und keine Namen mehr. Je Aufruf steht dort eine JSON-Zeile mit `result`, `lead_id` und dem Ergebnis von Qodia, Mail und Salesforce.
> - **Erledigt (09.11.2026):** Einladungslink — Qodia bietet keinen Einladungslink an, wir nutzen „Passwort vergessen?“. capture-lead und sync-lead-qodia übergeben beim Sign-up ein zufälliges Passwort, das nirgends gespeichert oder verschickt wird.
> - **`lead_credentials`:** wird von keiner Function und keiner Seite mehr gelesen oder beschrieben; alle Passwörter auf NULL gesetzt, Zeilen bleiben. Keine Spalte wird mehr gebraucht (`credentials_sent_at` für die 24-Stunden-Sperre liegt in `leads`). **Tabelle kann später entfernt werden.**

Nimmt Interessenten-Anmeldungen entgegen — von der WordPress-Homepage (Contact Form 7) und aus der internen Lead-Anlage im Portal. Legt den Lead an, erzeugt Zugangsdaten, verschickt Mails und meldet den Lead an Salesforce und Qodia.

Datei: `supabase/functions/capture-lead/index.ts` (Ablauf), `assignmentPolicy.ts` (Zuordnungsregeln)

### Aufruf

| | |
|---|---|
| Methode | `POST` (jede andere Methode außer `OPTIONS` wird genauso verarbeitet wie POST; es gibt keine Methodenprüfung) |
| Content-Type | `application/json`. Der Body wird mit `req.json()` gelesen (:274); der Header selbst wird nicht geprüft. Formular-kodierte Daten (`application/x-www-form-urlencoded`) oder ungültiges JSON führen zu **500**. |
| Authentifizierung | keine Pflicht (`verify_jwt = false` in `supabase/config.toml:22–23`). Ein optionaler `Authorization: Bearer <JWT>` wird ausgewertet, siehe „Zuordnung". |

**Feldnamen.** Der Body darf direkt die internen Namen tragen oder in `data` bzw. `fields` verschachtelt sein. Gängige CF7-Varianten werden umgeschlüsselt (`mapCf7Fields`, :16–40). Sind `praxis_name`, `vorname` und `nachname` direkt vorhanden, wird nichts umgeschlüsselt.

| Feld | Pflicht | Akzeptierte Alternativnamen | Verarbeitung |
|---|---|---|---|
| `praxis_name` | ja | `praxis-name`, `your-praxis`, `praxisname`, `company`, `firma` | gekürzt auf 200 Zeichen |
| `vorname` | ja | `your-vorname`, `first-name`, `firstname`, `first_name` | 100 Zeichen |
| `nachname` | ja | `your-nachname`, `last-name`, `lastname`, `last_name`, `your-name` | 100 Zeichen |
| `email` | ja | `your-email`, `mail` | Format `x@y.z` (:307), kleingeschrieben, 255 Zeichen |
| `plz` | ja | `your-plz`, `postleitzahl`, `zip`, `postal_code` | 10 Zeichen; Format wird nicht geprüft |
| `abrechnungszentrum` | ja* | `your-abrechnungszentrum`, `abrechnung` | *bei direkt benannten Feldern (`praxis_name`/`vorname`/`nachname` vorhanden) → fehlt es: 400; bei CF7-Namen wird es beim Umschlüsseln still auf `"nein"` gesetzt |
| `mobilnummer` | nein | `your-mobilnummer`, `telefon`, `phone`, `tel`, `your-tel`, `mobile` | 30 Zeichen; leer → `"nicht angegeben"` |
| `mp_nummer` | nein | `your-mp-nummer`, `mp_nr`, `mpnummer` | 50 Zeichen; nicht 5-stellig → nur Log-Hinweis, kein Abweisen (:326) |
| `nachricht` | nein | `your-message`, `message` | 2000 Zeichen |
| `adresse` | nein | `your-adresse`, `strasse`, `street`, `address` | 300 Zeichen |
| `ort` | nein | `your-ort`, `city`, `stadt` | 100 Zeichen |
| `interested_products` | nein | — | Array, ungeprüft übernommen |
| `source` | nein | — | nur `"manual"` wird erkannt, alles andere = `"homepage"` (:277) |
| `assigned_to`, `vermittler_id`, `tippgeber_id` | nein | — | nur mit gültigem JWT und passender Rolle wirksam, siehe „Zuordnung" |

**Erlaubte Werte für `abrechnungszentrum`.** Bekannte Werte (:318): `nein`, `keins`, `CareCapital`, `privadis`, `anderes`, `ZAB`, `PVS`, `DZR`, `ARZ`, `Sonstiges`. **Jeder andere nicht-leere Text wird ebenfalls angenommen** und unverändert gespeichert (nur Log-Hinweis, :321). Groß-/Kleinschreibung zählt beim Abgleich. Bei `CareCapital`/`privadis` ohne `mp_nummer` erfolgt nur ein Log-Hinweis.

### Antworten

Alle Antworten sind JSON mit den CORS-Headern.

| Fall | Status | Body |
|---|---|---|
| Neuer Lead angelegt | 200 | `{"success": true, "hfx_customer_number": "HFX-I…", "message": "Ihre Anfrage wurde erfolgreich übermittelt."}` |
| E-Mail existiert bereits (nur `source` ≠ `manual`) | 200 | `{"success": true, "duplicate": true, "hfx_customer_number": "<bestehende Nummer>", "message": "Ein Konto mit dieser E-Mail-Adresse existiert bereits. Ihre Zugangsdaten wurden erneut zugesendet."}` |
| Pflichtfeld fehlt | 400 | `{"error": "Fehlende Pflichtfelder", "details": {"praxis_name": bool, "vorname": bool, "nachname": bool, "email": bool, "plz": bool, "abrechnungszentrum": bool}}` (`true` = vorhanden) |
| E-Mail-Format ungültig | 400 | `{"error": "Ungültige E-Mail-Adresse"}` |
| Lead konnte nicht gespeichert werden | 500 | `{"error": "Fehler beim Speichern"}` |
| Sonstiger Fehler (z. B. kein gültiges JSON) | 500 | `{"error": "<rohe Fehlermeldung>"}` (:846) |
| `OPTIONS` | 200 | leerer Body |

Wichtig: **200 bedeutet nur, dass der Lead gespeichert ist.** Fehlschläge bei Bestätigungsmail, AD-Mail, Salesforce oder Qodia ändern die Antwort nicht; sie stehen nur im Function-Log bzw. in Statusfeldern am Lead.

Bei `source: "manual"` gibt es keine Dublettenprüfung: ein weiterer Lead mit derselben E-Mail wird angelegt (:413).

### CORS

- `OPTIONS` wird beantwortet (:267), ohne Prüfung, Status 200.
- Gesetzt werden nur zwei Header (:7–10), auf allen Antworten:
  - `Access-Control-Allow-Origin: *` — **alle Origins erlaubt**
  - `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version`
- Kein `Access-Control-Allow-Methods`, kein `Max-Age`.

### Absicherung

| Prüfung | vorhanden |
|---|---|
| API-Key / gemeinsames Geheimnis | nein |
| Origin- oder Referer-Prüfung | nein |
| Rate-Limit / Captcha | nein |
| Rollenprüfung | nur für die Zuordnungsfelder, nicht für den Aufruf selbst |

Folgen aus dem Bestand: Jeder kann die Function von überall aufrufen und Leads anlegen. Mit einer bekannten, bereits registrierten E-Mail kann jeder beliebig oft die Mail „Ihre bestehenden Zugangsdaten" an diese Adresse auslösen (enthält das gespeicherte Passwort, falls noch vorhanden) und den Zähler `registration_attempts` hochtreiben. Der vollständige Request-Body wird ins Log geschrieben (:281).

**Zuordnung** (`assignmentPolicy.ts`). Die Identität kommt ausschließlich aus dem JWT, Rollen aus `user_roles` mit `is_active = true`:

- `assigned_to` aus dem Body: nur wirksam, wenn der Aufrufer eine interne Rolle hat (user, regional_lead, sales_lead, admin) und das Ziel aktiv user/regional_lead/sales_lead ist. Sonst PLZ-Automatik über `resolve_plz_ad`.
- Manuelle Anlage durch interne Rolle ohne PLZ-Treffer: Aufrufer wird `assigned_to`.
- `vermittler_id`: externer Partner (sales_partner ohne interne Rolle) → immer die eigene ID; admin/sales_lead → gültiger aktiver sales_partner aus dem Body; sonst leer.
- `tippgeber_id`: nur admin/sales_lead mit gültigem aktivem Tippgeber.

### Folgen eines erfolgreichen Aufrufs (neuer Lead)

Reihenfolge im Code:

1. **Lead** in `leads` (Service-Rolle), HFX-Nummer wird von der Datenbank vergeben.
2. **Passwort** (12 Zeichen, zufällig) nur für den Qodia-Sign-up; wird nicht gespeichert und nicht verschickt.
3. **PLZ-Protokoll** in `plz_assignment_log` (nicht abgewartet).
4. **Mail mit Zugangsdaten** an den Interessenten über Resend, Absender `noreply@hfx-honorarfuchs.de`, Betreff „Danke für Ihr Interesse am HFX Honorarfuchs!". Inhalt: Anmelde-E-Mail, HFX-Nummer, Weg über „Passwort vergessen?“ (kein Passwort, seit 09.11.2026), Download-Links Mac/Windows, übermittelte Daten. Erfolg → `confirmation_email_sent = true`. Immer, auch bei `source: "manual"` (:279).
5. **Mail an zuständigen AD** (wenn zugewiesen, Einstellung `new_lead_ad_notification` nicht aus, Profil hat E-Mail), Betreff „🔔 Neuer Lead: <Praxis> (<PLZ>)".
6. **Salesforce**: wenn `salesforce_connections` (id `default`) verbunden ist, wird ein Salesforce-Lead angelegt (`Company`, `FirstName`, `LastName`, `Email`, `PostalCode`, `MobilePhone`, `Description`, `LeadSource = "Website"`, `MPID__c`). Erfolg → `salesforce_synced = true`, `salesforce_id`. Kein Token-Refresh an dieser Stelle.
7. **Qodia-Konto**: `POST https://auth.qodia.de/api/external/sign-up` mit `x-api-key` (falls gesetzt), Body `email`, `password` (dasselbe wie in der Mail), `name = HFX-Nummer`. Erfolg → `qodia_synced = true` und — außer bei Standort-Nummern (-NN) — einmalig 200 Freikontingent (`free_quota_grants`, `trial`). Status 409 → `qodia_conflict = true`.

Hinweis: Die Mail mit den Zugangsdaten geht **vor** der Qodia-Anlage raus. Scheitert Qodia, hat der Interessent Zugangsdaten, die (noch) nicht funktionieren.

Bei einer bereits vorhandenen E-Mail (Homepage): kein neuer Lead, kein neues Passwort, kein Salesforce- oder Qodia-Aufruf, keine AD-Mail — nur erneuter Versand der gespeicherten Zugangsdaten und `registration_attempts + 1`.

---

<!-- Weitere Functions folgen nach Freigabe des Eintrags capture-lead. -->

---

# Übrige Functions (Kurzform)

Je Eintrag: Zweck · Aufrufberechtigung · Eingaben · Ergebnis · Auslöser. „Rolle" heißt: `requireActiveRole` aus `_shared/auth.ts` (nur aktive Rolle zählt, sonst 401/403). „JWT aus" heißt: `verify_jwt = false` in `supabase/config.toml` — die Function prüft dann selbst oder gar nicht.

## Öffentliche Eingänge (ohne Anmeldung)

| Function | Zweck | Absicherung | Eingaben | Ergebnis / Auslöser |
|---|---|---|---|---|
| zugang-anfrage | Zugangsanfrage aus /zugang, nur Mail an info@hfx-honorarfuchs.de | Origin-Whitelist, Honeypot (stumm 200), 5 Anfragen/10 Min je IP (im Speicher) | Formularfelder | Mail; kein Lead, kein Konto. Auslöser: Seite /zugang |
| notify-new-request | Mail über neue Registrierungsanfrage an Admin | Origin-Whitelist; atomarer Claim in DB vor Versand (nur einmal) | Anfrage-ID | 200/4xx/500. Auslöser: Registrierungsformular |
| buchen-submit | Buchen-Knopf auf /buchen: speichert Fachrichtung/Rechtsform/BSNR/LANR, AGB-Zustimmung, ruft send-mandate-setup | keine (JWT aus); nur POST (405) | contract_id, Stammdaten, AGB | 200 mit `setup_url`; 400/404/500/502. Auslöser: Kundenseite |
| mandate-link | Stabiler Link aus Mail 1 → frische Stripe-Setup-Session, Weiterleitung | keine; nur GET; kein Rate-Limit (Code-Kommentar :43) | `?contract_id=` | 302 zu Stripe. Auslöser: Kundenmail |
| campaign-start | Kampagnen-Klick-Link: prüft Token, legt ggf. Vertrag via qodia-initiate-booking an | Token im Link; nur GET; kein Rate-Limit/keine Token-Härtung (:26) | `?token=hfxc_…` | Weiterleitung. Auslöser: Seite /kampagne |
| salesforce-callback | OAuth-Rückkehr von Salesforce, speichert Tokens | Origin-Whitelist; OAuth-State | `code`, `state` | Weiterleitung ins Portal |
| check-subscription, create-checkout | Alte Stripe-Welt, abgeschaltet 08.05.2026 | — | — | immer **410** |

## Externe Systeme (Schlüssel im Header)

| Function | Gegenstelle | Absicherung | Eingaben | Ergebnis |
|---|---|---|---|---|
| stripe-webhook | Stripe | Pflicht `stripe-signature` (:201–210), sonst 400/401; Idempotenz `processed_stripe_events` | Stripe-Ereignis | Vertragsaktivierung, Mandat, Rechnungsstatus, Mails; ruft auto-invoice mit `x-cron-secret` |
| receive-usage | Qodia | `x-api-key` = `QODIA_API_KEY`, sonst 401 | hfx_customer_number, contract_id/product_name, Menge | Eintrag `usage_charges`; 400/404/500 |
| qodia-initiate-booking | Qodia / intern | `x-api-key` = `QODIA_API_KEY` (:33), sonst 401; nur POST | hfx_customer_number, product_name, skip_mail | Vertrag angelegt 200; 409 bei aktivem Vertrag; 400/404/500 |
| demo-import | Qodia | `x-api-key` = `DEMO_IMPORT_API_KEY` | Demo-Daten | Demo-Datensatz |
| notify-demo-limit | Qodia | `x-api-key` = `DEMO_IMPORT_API_KEY` | hfx_customer_number, invoice_count | Status `limit_reached`, Mail |
| auth-email-hook | Anmelde-Dienst | `Authorization: Bearer <Hook-Schlüssel>` (:95), sonst 401 | Auth-Mail-Ereignis | versendet gebrandete Auth-Mails |

## Zeitgesteuert (nur `x-cron-secret`)

| Function | Zweck | Zusätzlich erlaubt |
|---|---|---|
| auto-invoice | Monatsrechnung am 1., Stripe-Einzug, Rechnungsmail, Mandats-Recovery | aktiver admin (manueller Lauf) |
| demo-reminder | Erinnerungsmails Demo-Ende | — |
| qodia-auto-usage-sync | Verbrauch von Qodia abholen | — |
| qodia-lead-usage-sync | Aktivität von Interessenten in Testphase (05:30 UTC), schreibt nur qodia_*-Spalten | — |
| qodia-status-sync | Qodia-Kontostatus (04:30 UTC); ohne CORS-Handler | aktiver admin |
| lexware-auto-sync | Belege an Lexware | aktiver admin |
| salesforce-auto-sync | Abgleich mit Salesforce | aktiver admin |

## Portal — Vertrieb

| Function | Rolle | Eingaben | Ergebnis / Besonderheit |
|---|---|---|---|
| sync-lead-qodia | admin, sales_lead, regional_lead, user + Zuständigkeit aus DB | leadId | Qodia-Konto zum Lead; 403 bei fremdem Lead |
| notify-lead-assignment | admin, sales_lead, regional_lead, user | leadId | Mail an zugewiesenen AD |
| send-contract-email | admin, sales_lead, regional_lead, user + `_shared/contractAccess.ts` | contractId (Pflicht), PDF-Daten | Vertragskopie an Betreuer, sonst Ersteller; Empfänger aus Request ignoriert |
| send-mandate-setup | Service-Key **oder** obige Rollen + Zuständigkeit | contract_id, force | Stripe-Setup-Session + Mail 1 |
| send-contract-confirmation | Service-Key **oder** obige Rollen + Zuständigkeit | contract_id, force | Bestätigungsmail mit Dokumenten |
| send-zugang-info | admin, sales_lead, regional_lead, user, vertragsabteilung | mode, HFX-Nummer(n) | Mail „Zugang einrichten"; Nicht-Admins nur `send` mit genau einer Nummer, sonst 403; 412/502 |
| commission-forecast | admin, sales_lead, regional_lead, user, sales_partner | — | Provisions-Vorschau, nur lesend |
| create-contract-subscription | admin, sales_lead, regional_lead, user + `_shared/contractAccess.ts` | contract_id (Pflicht), success_path/cancel_path (nur relative Pfade) | Stripe-Checkout-URL; Rücksprung fest auf https://sales.hfx-honorarfuchs.de; 400/401/403/404 |
| salesforce-sync-price | admin, sales_lead | mpNr, preis | Preis in Salesforce |
| campaign-token-issue | admin, sales_lead | Lead | Kampagnen-Link (idempotent) |
| qodia-usage-query | admin, sales_lead | startDate, endDate, hfx_customer_number, source | Verbrauchsdaten von Qodia |
| notify-tipp-status | admin, sales_lead | tippLeadId, newStatus | Statusmail an Tippgeber |
| submit-tipp-lead | tippgeber, nur eigener Tipp (created_by) | tippLeadId | PLZ-Zuordnung, Mails, Salesforce; fremd 403 |

## Portal — nur Admin

| Function | Zweck | Eingaben |
|---|---|---|
| approve-user | Zugangsanfrage freigeben/ablehnen, Rolle Pflicht (ohne tippgeber), atomar, audit_logs | requestId, action, role |
| create-user | Konto anlegen/Rolle ändern, audit_logs | E-Mail, Name, role |
| admin-delete-auth-user | Auth-Konto löschen | user_id |
| reset-user-mfa | MFA eines Kontos zurücksetzen (gemeinsamer Guard, nur admin) | targetUserId |
| ban-ghost-users | nie genutzte Konten ohne Rolle sperren | Modus |
| register-standort-qodia | Qodia-Konto für Standort (-NN) | contractId |
| send-standort-credentials | Zugangsdaten an Standort-Mail | contractId |
| qodia-update-plan | Qodia-Plan auf Partner-Standard heben (auch Service-Key) | contract |
| manual-interim-invoice | Zwischenrechnung mit Stripe-Einzug (geldwirksam); 409 bei Doppellauf | contract_id |
| send-invoice-email | Rechnungsmail mit PDF | invoiceId, pdfBase64 |
| lexware-integration | connect / disconnect / get-settings / update-settings / export, an eigene Integration gebunden | action, Daten |
| salesforce-auth, salesforce-disconnect | Salesforce verbinden/trennen (beide gemeinsamer Guard, nur admin) | — |
| campaign-mail-send, campaign-mint-runner | Kampagnenversand / Vertragsanlage, Modi dry_run/canary/batch | Modus, Liste |
| edit-email-template | Mail-Vorlage per KI umschreiben (429/402 bei Limit/Guthaben) | html, instruction |
| contract-merge-diagnose | Zusammenführungsplan, nur lesend | HFX-Nummer |
| commission-testrun, seed-test-usage | Testwerkzeuge, nur Testverträge | Testdaten |
| backfill-sepa-iban, repair-carrier-customers | einmalige Datenreparaturen | Modus |

## Auffällig (nur benannt, nichts geändert)
- `buchen-submit`, `mandate-link`, `campaign-start`: öffentlich, nur per Vertrags-ID (UUID) bzw. Kampagnen-Code (32 Zufallsbytes) — nicht erratbar, aber ohne Rate-Limit (bewusst nicht gebaut, 03.11.2026).
- **Offen:** Links haben kein Ablaufdatum (gültig, solange der Vertragsstatus passt).
- **Offen:** Kampagnen-Code bleibt nach Einlösung gültig.
- Öffentliche Functions mit `Access-Control-Allow-Origin: *`; Origin-Whitelist nur bei zugang-anfrage, notify-new-request, salesforce-callback.

## creditreform-check — abgeschaltet (03.11.2026)

Die Function ist entfernt und nicht mehr bereitgestellt; die alte Adresse liefert 404. Sie war eine Attrappe (kein echter Creditreform-Abruf, Score aus dem Namen gewürfelt), öffentlich ohne Prüfung erreichbar und von keiner eingebundenen Seite aufgerufen (einziger Aufrufer `src/components/dashboard/PendingContractApprovals.tsx`, selbst nirgends eingebunden, bleibt vorerst unverändert).

Vorlage: `docs/vorlagen/creditreform-check/index.ts.txt` (bewusst außerhalb von `supabase/functions/`, damit sie nicht wieder bereitgestellt wird).

**Anforderungen für die echte Creditreform-Anbindung** (neu planen, Rollen dann entscheiden):
- Anmeldung Pflicht über die gemeinsame Rollenprüfung `requireActiveRole`; Rollen festlegen (Vorschlag damals: admin, sales_lead; offen: vertragsabteilung).
- Kundenname und Vertragsdaten liest die Function selbst aus der Datenbank; nur die Vertrags-ID kommt vom Aufrufer; unbekannter Vertrag → 404.
- Begrenzung je Nutzer und Tag (Vorschlag 20) und je Vertrag und Tag (Vorschlag 1), gezählt dauerhaft in der Datenbank, nicht im Speicher; über dem Limit 429.
- Protokoll in `audit_logs`: wer, wann, welcher Vertrag/HFX-Nummer, Erfolg ja/nein — ohne Score/Rating; abgelehnte Aufrufe mit `success=false`.
- Score/Rating speichert die Function selbst am Vertrag, nicht der Browser.

## initiate-booking — abgeschaltet (03.11.2026)

Ältere Buchungsstrecke, entfernt und nicht mehr bereitgestellt. Vor der Abschaltung geprüft: kein Aufrufer im Portal, kein Verweis in Mail-Vorlagen, `customer_events`, `audit_logs` oder `integration_sync_logs`. Der Buchen-Knopf (/buchen) nutzt `buchen-submit`. Vorlage: `docs/vorlagen/initiate-booking/index.ts.txt`.
