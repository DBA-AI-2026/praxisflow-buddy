# API-Referenz — Edge Functions

Stand: 03.11.2026. Reine Bestandsaufnahme aus dem Quellcode (`supabase/functions/`), keine Funktion wurde dafür aufgerufen. Zeilenangaben beziehen sich auf diesen Stand.

Basis-URL aller Functions: `https://<backend>/functions/v1/<name>`

---

## capture-lead

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
| `abrechnungszentrum` | ja* | `your-abrechnungszentrum`, `abrechnung` | *fehlt es, wird beim Umschlüsseln `"nein"` gesetzt — die Pflichtprüfung greift daher praktisch nur bei leerem String im direkt benannten Feld |
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
| Lead oder Zugangsdaten konnten nicht gespeichert werden | 500 | `{"error": "Fehler beim Speichern"}` |
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
2. **Passwort** (12 Zeichen, zufällig) in `lead_credentials`. Fehler → 500, der Lead bleibt aber bestehen.
3. **PLZ-Protokoll** in `plz_assignment_log` (nicht abgewartet).
4. **Mail mit Zugangsdaten** an den Interessenten über Resend, Absender `noreply@hfx-honorarfuchs.de`, Betreff „Danke für Ihr Interesse am HFX Honorarfuchs!". Inhalt: E-Mail, Passwort im Klartext, HFX-Nummer, Download-Links Mac/Windows, übermittelte Daten. Erfolg → `confirmation_email_sent = true`. Immer, auch bei `source: "manual"` (:279).
5. **Mail an zuständigen AD** (wenn zugewiesen, Einstellung `new_lead_ad_notification` nicht aus, Profil hat E-Mail), Betreff „🔔 Neuer Lead: <Praxis> (<PLZ>)".
6. **Salesforce**: wenn `salesforce_connections` (id `default`) verbunden ist, wird ein Salesforce-Lead angelegt (`Company`, `FirstName`, `LastName`, `Email`, `PostalCode`, `MobilePhone`, `Description`, `LeadSource = "Website"`, `MPID__c`). Erfolg → `salesforce_synced = true`, `salesforce_id`. Kein Token-Refresh an dieser Stelle.
7. **Qodia-Konto**: `POST https://auth.qodia.de/api/external/sign-up` mit `x-api-key` (falls gesetzt), Body `email`, `password` (dasselbe wie in der Mail), `name = HFX-Nummer`. Erfolg → `qodia_synced = true` und — außer bei Standort-Nummern (-NN) — einmalig 200 Freikontingent (`free_quota_grants`, `trial`). Status 409 → `qodia_conflict = true`.

Hinweis: Die Mail mit den Zugangsdaten geht **vor** der Qodia-Anlage raus. Scheitert Qodia, hat der Interessent Zugangsdaten, die (noch) nicht funktionieren.

Bei einer bereits vorhandenen E-Mail (Homepage): kein neuer Lead, kein neues Passwort, kein Salesforce- oder Qodia-Aufruf, keine AD-Mail — nur erneuter Versand der gespeicherten Zugangsdaten und `registration_attempts + 1`.

---

<!-- Weitere Functions folgen nach Freigabe des Eintrags capture-lead. -->
