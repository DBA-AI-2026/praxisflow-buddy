# Login-E-Mail ändern — Abnahme 09.11.2026

## Implementierung
- `supabase/functions/change-login-email/index.ts:45`: gemeinsame Prüfung der vier aktiven Rollen.
- `:58–59`: Datensätze zuerst mit Aufrufer-JWT/RLS lesen; bei Fehler oder keinem sichtbaren Datensatz 403.
- **Prüfung 4a: `:88–90`**: alle vorhandenen Zeilen der exakten HFX-Nummer, einschließlich leerer/NULL-Adressen, müssen dieselbe gespeicherte Adresse haben.
- `:91–97`: andere exakte HFX-Nummer (auch Standort desselben Kunden) verhindert Dublette; gleiche Adresse verhindert Anbieteraufruf.
- `:73–86`: Ereignisse inklusive Abbrüchen; `qodia_result=not_called` für Prüfungsabbrüche.
- `:100–111`: Anbieter zuerst, RPC danach; RPC-Fehler führt genau einmal zur Rückabwicklung.
- UI-Anbindungen: `src/pages/Kunden.tsx:277,342`, `src/components/kunden/StammdatenTab.tsx:343`, `src/pages/vertrieb/Vertraege.tsx:3156–3161`.
- E-Mail-Sperren, Neuanlage, Rechnungs-E-Mail, ensureCarrierCustomer, stripe-webhook, bestehende Anbieterfunktionen und DB-Funktion unverändert.

## Texte, wörtlich
In `src/components/kunden/ChangeLoginEmail.tsx`:
- `:56,61,71`: „Login-E-Mail ändern"
- `:62`: „Die neue Adresse wird zuerst im Login-Konto des Kunden umgestellt und erst danach hier übernommen. Die Rechnungs-E-Mail bleibt unverändert."
- `:65`: „Neue E-Mail"
- `:66`: „Neue E-Mail wiederholen"
- `:49`: „Login-E-Mail geändert. Der Kunde meldet sich ab sofort mit der neuen Adresse an."
- `:43` und Function `:8`: „Änderung fehlgeschlagen: Das Login-Konto des Kunden konnte nicht umgestellt werden. Es wurde nichts geändert."
In `supabase/functions/change-login-email/index.ts`:
- `:90`: „Die gespeicherten E-Mails dieses Kunden weichen voneinander ab. Bitte Admin informieren."
- `:95`: „Diese E-Mail ist bereits einem anderen Kunden zugeordnet."
- `:104`: „Für diesen Datensatz besteht kein Login-Konto. Es wurde nichts geändert."
- `:9`: „Änderung fehlgeschlagen. Bitte Admin informieren."
- `:97`: „Die neue E-Mail entspricht der bisherigen E-Mail. Es wurde nichts geändert."

## Live-Test: nur HFX-I01070-02
Ausgeführt in angemeldeter Vorschau über denselben Knopf, als Daniela Barth.

| UTC | Vorgang | Antwort | Protokoll |
|---|---|---|---|
| 09:00:23 | barth@mototok.com → gleiche Adresse | 400 | unchanged_email / not_called |
| 09:00:25 | → exhibition@mototok.com (-01/Hauptnummer) | 409 | duplicate_email / not_called |
| 09:00:27 | → dbarth+logintest-s02@carecapital.de | 200 | success / success |
| 09:00:29 | → barth@mototok.com | 200 | success / success |

Alle vier LOGIN_EMAIL_CHANGED-Ereignisse sind dem Vertrag -02 zugeordnet (lead_id NULL), mit alt/neu, Nutzer und Zeitpunkt. Keine Ereignisse für Hauptnummer oder -01. Frühere Versuche mit falschem UI-Client erhielten 401 und änderten nichts; der neue Dialog verwendet nun denselben persistenten Client wie das Portal.

**SQL-Endzustand:** leads, contracts und customers der Hauptnummer unverändert `exhibition@mototok.com`; Vertrag -01 unverändert `exhibition@mototok.com`; Vertrag -02 wieder `barth@mototok.com`. Keine Lead-/Kundenzeilen für -02 vorhanden.

**Anbieter /external/users, nur gelesen:** Vorher `barth@mototok.com`, während Wechsel `dbarth+logintest-s02@carecapital.de`, nach Rückstellung wieder `barth@mototok.com`, derselbe Name und Anlagezeitpunkt. Die Testadresse ist im Endzustand nicht mehr vorhanden. Die abschließende Abfrage wurde nach einer 429-Antwort später erfolgreich wiederholt.

**-01-Konflikt:** In der vollständigen Anbieter-Liste gibt es für `exhibition@mototok.com` einen Eintrag mit Name `HFX-I01070`, angelegt am 27.03.2026. Kein separat identifizierbares -01-Konto gefunden. Die Liste gibt keine HFX-Zuordnung aus; eine eigene -01-Zuordnung ist damit nicht belegbar. Nichts bereinigt.

## Tests und offene Abnahme
- 69/69 lokale Tests bestanden: 26 neue Handler-Tests plus 43 bestehende Vertragsrechte-Tests, ohne externe Aufrufe.
- Angemeldeter Desktop-Flow: beide Abbrüche, Erfolg und Rückstellung sichtbar geprüft; kleiner Bildschirm separat geprüft.
- SQL-Zwischenzustand während der neuen Adresse wurde nicht separat abgefragt; Anbieter-Zwischenzustand und Ereignisse wurden gelesen. Exakte Standort-Isolation zusätzlich lokal getestet.
- Hauptnummer-Abnahme bleibt wie vereinbart offen: ursprüngliche Adresse ist bereits mit -01 geteilt, Regel 4b würde Rückstellung verhindern.
- Veröffentlichung wird angefordert; GitHub synchronisiert bei bestehender Verbindung automatisch, Status kann der Agent nicht einsehen.