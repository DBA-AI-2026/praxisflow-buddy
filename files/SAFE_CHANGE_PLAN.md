# SAFE_CHANGE_PLAN.md

> **Zweck dieser Datei:**
> Eine **konkrete, nach Risiko sortierte** Liste möglicher Änderungen am HFX / PraxisFlow-Projekt.
> Sie ergänzt `AI_GUARDRAILS.md` um eine handlungsorientierte Sicht: "Was kann ich jetzt sicher tun, was später, was nie ohne Vorbereitung?"
>
> **Status:** Dies ist ein **Plan**, kein Änderungs-Log. Es wurde noch nichts umgesetzt.
> **Letzte Analyse:** 2026-04-27
> **Verbindlichkeit:** Vor jeder Umsetzung gilt zusätzlich `AI_GUARDRAILS.md`.

---

## Verwendung dieser Datei

Jede Änderungs-Anfrage sollte zuerst gegen diese Liste geprüft werden:

- **Kategorie 1 (🟢 Sicher / sofort möglich)** → kann ohne weitere Vorbereitung umgesetzt werden
- **Kategorie 2 (🟡 Vorsichtig / nur mit Review)** → erfordert Review durch Projekt-Owner, vorhanden Tests, Branch + PR
- **Kategorie 3 (🔴 Tabu ohne Backup und Testplan)** → erfordert DB-Backup, Smoke-Test-Pflicht, `[REVIEW REQUIRED]`-PR, dokumentierten Rollback-Pfad

Wenn eine Änderung in keiner Kategorie auftaucht → in Kategorie 2 oder 3 einordnen, im Zweifel höher.

---

## 🟢 Kategorie 1 — Sicher / sofort möglich

Diese Änderungen berühren **weder** Edge Functions, **noch** Webhooks, **noch** Supabase-Schema, **noch** Auth, **noch** Cron-Jobs.

### 1.1 `.env` zu `.gitignore` hinzufügen
**Was:** Eintrag `.env` und `.env.local` in `.gitignore` ergänzen.
**Warum:** Aktuell enthält die `.env` nur die ohnehin öffentlichen `VITE_*`-Variablen (kein akutes Problem), aber die Datei ist nicht ignoriert. Falls später jemand versehentlich Secrets dort einträgt, würden die im Repo landen.
**Risiko:** Kein Risiko. Reine Vorsichtsmaßnahme.
**Vorgehen:**
1. Branch `chore/gitignore-env` anlegen
2. In `.gitignore` ergänzen:
   ```
   # Local environment files
   .env
   .env.local
   .env.*.local
   ```
3. PR erstellen, kein Review-Required

### 1.2 README aktualisieren
**Was:** Den Lovable-Boilerplate (`URL: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID`) durch projektspezifischen Inhalt ersetzen.
**Warum:** Der Platzhalter ist nie ausgefüllt worden. Neue Entwickler / KI-Sitzungen verstehen das Projekt schneller mit echtem Kontext.
**Risiko:** Kein Risiko. Reine Dokumentation.
**Vorgehen:**
1. Branch `docs/readme-update`
2. README ersetzen mit:
   - Projektname + kurze Beschreibung (HFX Sales Portal)
   - Link auf `docs/system/README.md` als Source-of-Truth
   - Verweis auf `AI_GUARDRAILS.md` und `SAFE_CHANGE_PLAN.md`
   - Tech-Stack-Block bleibt
   - Dev-Setup bleibt (`npm i`, `npm run dev`)
3. PR erstellen

### 1.3 Unit-Tests für `src/lib/validateIban.ts`
**Was:** Vitest-Tests für reine Utility-Funktion ohne Supabase-Anbindung.
**Warum:** Erste echte Test-Coverage aufbauen. Aktuell gibt es nur einen Dummy-Test (`expect(true).toBe(true)`).
**Risiko:** Kein Risiko. Test-Setup existiert bereits (`vitest.config.ts`, `src/test/setup.ts`).
**Vorgehen:**
1. Branch `test/validate-iban`
2. Datei `src/lib/validateIban.test.ts` erstellen
3. Test-Cases:
   - Gültige deutsche IBAN
   - Ungültige Prüfziffer
   - Leere Eingabe
   - Whitespace-Handling
   - Falsches Land-Format
4. `npm run test` muss grün sein
5. PR erstellen

### 1.4 Unit-Tests für `src/lib/validateBic.ts`
**Was:** Analog zu 1.3 für BIC-Validierung.
**Risiko:** Kein Risiko.
**Vorgehen:** wie 1.3, in eigener Datei `src/lib/validateBic.test.ts`.

### 1.5 Unit-Tests für `src/lib/lookupBic.ts`
**Was:** Tests für BIC-Lookup-Funktion.
**Hinweis:** Falls die Funktion externe API-Calls macht, mocken (z.B. mit `vi.fn()`). KEINE echten Calls in Tests.
**Risiko:** Kein Risiko bei korrektem Mocking.

### 1.6 UI-Texte verbessern (rein kosmetisch)
**Was:** Kleine Wording-Korrekturen, Tippfehler, klarere Button-Labels in **statischen** Pages:
- `src/pages/NotFound.tsx`
- Onboarding-Texte in `src/components/ProtectedRoute.tsx` (NUR die JSX-Strings, nicht die Logik!)
- Statische Hilfetexte in `src/pages/MeinKonto.tsx`, `src/pages/Sicherheit.tsx`
- Toast-Messages bei reinen UI-Aktionen

**Risiko:** Gering, solange:
- Keine Domänenbegriffe geändert werden (HFX, FiBu, Tippgeber, Provision, Praxis, Vertrieb, Gebietsleiter)
- Keine Logik berührt wird
- Keine Übersetzungs-Keys umbenannt werden

**Vorgehen:**
1. Branch `chore/ui-text-polish`
2. Pro PR maximal eine Page bearbeiten
3. Visuelle Prüfung auf der laufenden App vor Merge

### 1.7 Lucide-Icons konsistenter verwenden
**Was:** Inkonsistente Icon-Wahl angleichen (z.B. überall `<Trash2>` statt mal `<X>` mal `<Trash>` für Lösch-Buttons).
**Risiko:** Gering, solange semantisch eins-zu-eins ersetzt wird.
**Vorgehen:** Pro PR eine Icon-Familie.

### 1.8 JSDoc-Kommentare in Utility-Files ergänzen
**Was:** Funktionsköpfe in `src/lib/utils.ts`, `validateIban.ts`, etc. mit JSDoc-Header versehen.
**Risiko:** Kein Risiko (reine Kommentare).

### 1.9 `npm run lint` in CI ausführen lassen
**Was:** Falls noch keine CI-Action existiert: GitHub Action ergänzen, die `npm run lint` und `npm run test` bei jedem Push laufen lässt.
**Risiko:** Kein Risiko, ändert keine produktive Logik.
**Hinweis:** Nicht automatisch fehlschlagen lassen, falls bestehender Code Lint-Warnungen hat — erst mal nur **reporten**.

### 1.10 Diese beiden Dateien (`AI_GUARDRAILS.md`, `SAFE_CHANGE_PLAN.md`) committen
**Was:** Die im Rahmen dieser Analyse erstellten Dokumente ins Repo einchecken.
**Risiko:** Kein Risiko.

---

## 🟡 Kategorie 2 — Vorsichtig / nur mit Review

Diese Änderungen sind grundsätzlich machbar, brauchen aber Domänen-Verständnis, Tests, und einen Reviewer.

### 2.1 Große Page-Komponenten refactoren
**Betroffen:** `Buchhaltung.tsx` (97k), `PraxenJourney.tsx` (67k), `Rechnungen.tsx` (56k), `Praxen.tsx` (38k), `Interessenten.tsx` (35k).

**Warum vorsichtig:**
- Viel impliziter State zwischen Sub-Sections
- Komplexe Datenfetches mit React Query
- Reihenfolge der Hooks ist relevant
- Manche Effects haben spezielle Timing-Anforderungen

**Vorgehen (wenn überhaupt):**
1. **Erst Tests schreiben** für das aktuelle Verhalten (E2E mit Playwright o.ä.)
2. **Schrittweise extrahieren** — pro PR nur EINE Sub-Komponente herauslösen
3. **Sub-Komponenten zunächst in eine `*.parts.tsx`-Datei legen**, nicht eigene Folder
4. **Visuelle Regression-Tests** vor jedem Merge
5. Niemals "großes Refactoring im einen Wurf"

**Reviewer:** Jemand mit Kenntnis des Buchhaltungs- bzw. Pipeline-Flows.

### 2.2 Console.logs in Edge Functions prüfen (DSGVO)
**Was:** Die 116 `console.log`-Aufrufe in `supabase/functions/` durchgehen und prüfen, ob personenbezogene Daten geloggt werden.

**Warum vorsichtig:**
- Manche Logs sind essentielles Debugging
- DSGVO erfordert Datensparsamkeit, aber nicht völlige Stille
- Falsches Entfernen erschwert Incident-Response

**Vorgehen:**
1. Pro Edge Function einzeln durchgehen, nicht als Sammel-PR
2. Nur Logs reduzieren, die:
   - Vollständige E-Mails (nicht nur Maskierung) loggen
   - Klartext-Namen mit Adressdaten kombinieren
   - Stripe-Customer-IDs in Klartext + E-Mail
3. Ersatz: Maskierte Form (`user@***.de`), oder nur ID-basiertes Logging
4. **Niemals** Logs entfernen, die einen Fehler-Pfad markieren — die werden bei Incidents gebraucht

**Reviewer:** Jemand mit DSGVO-Kontext.

### 2.3 CORS-Konfiguration prüfen (NICHT vereinheitlichen!)
**Was:** Die CORS-Headers pro Edge Function prüfen, ob sie zur Aufrufer-Situation passen.

**Bekannter Stand:**
- `stripe-webhook` → `*` (bewusst, Signatur ist Schutz)
- `creditreform-check` → Whitelist (richtig)
- `capture-lead` → `*` (CF7 ruft von vielen WordPress-Origins auf)

**Was zu prüfen ist:**
- Sind alle Origins in `creditreform-check`-Whitelist noch aktuell?
- Gibt es Edge Functions mit `*`, die eigentlich auf einen festen Origin beschränkt werden könnten (z.B. interne Admin-Tools)?

**Was NICHT zu tun ist:**
- Alle CORS-Configs vereinheitlichen
- `stripe-webhook` von `*` einschränken
- Whitelist ohne Test einer echten WordPress-Form-Submission ändern

**Reviewer:** Pflicht.

### 2.4 Test-Coverage für Hooks
**Was:** Tests für `useAuth`, `useUserRole`, `useCustomerContracts` mit gemockter Supabase-Anbindung.

**Vorsichtig, weil:**
- Auth-Hooks haben subtiles Timing (Defer-Pattern in `useAuth.tsx`!)
- Mocks müssen das Realverhalten genau abbilden, sonst sind Tests nutzlos

**Vorgehen:**
1. Erst eine Stunde lesen, dann erst schreiben
2. `@testing-library/react` `renderHook` verwenden
3. Nicht den Defer-Pattern "wegmocken" — testen, dass er greift

### 2.5 Deprecated Imports konsolidieren
**Was:** Manche Files importieren `AppRole` aus `@/hooks/useUserRole`, andere aus `@/config/routePermissions`. Auf eine Quelle vereinheitlichen.

**Vorsichtig, weil:**
- Build muss nach jedem Schritt grün sein
- Pro PR maximal 5–10 Files anfassen
- Niemals den Type selbst umdefinieren

### 2.6 ESLint-Warnings reduzieren
**Was:** Aktuelle Lint-Warnungen pro Kategorie durchgehen.

**Vorsichtig, weil:**
- Manche Warnungen markieren echte Bugs (z.B. `react-hooks/exhaustive-deps`) — diese NICHT mit `// eslint-disable` unterdrücken, sondern verstehen
- `useEffect`-Dependencies können nicht "blind" ergänzt werden — Endlosschleifen drohen

**Vorgehen:** Eine Regel pro PR, kleine Schritte.

### 2.7 Tailwind-Design-Tokens konsolidieren
**Was:** Falls `index.css` und `tailwind.config.ts` inkonsistente Tokens haben (z.B. mal `hsl(var(--primary))`, mal Hex-Code), vereinheitlichen.

**Vorsichtig, weil:**
- Visual Regression möglich
- Dark-Mode-Support kann brechen (`next-themes` ist eingebunden)

**Vorgehen:**
1. Vorher Screenshots aller Hauptseiten in beiden Themes
2. Nachher visueller Diff

### 2.8 PDF-Generierung optimieren
**Betroffen:** `src/lib/generateContractPdf.ts`, `generateInvoicePdf.ts`, `generateInvoicePdfV2.ts`.

**Vorsichtig, weil:**
- Verträge sind rechtsverbindlich (Signatur, Audit)
- PDF-Layout-Bugs werden oft erst beim Drucken sichtbar
- `pdf-lib` und `pdfjs-dist` haben subtile Versionsunterschiede

**Vorgehen:** Nur mit Test-Suite, die generierte PDFs byte-vergleicht oder visuell rendert.

---

## 🔴 Kategorie 3 — Tabu ohne Backup und Testplan

Diese Bereiche werden NIEMALS ohne **alle** folgenden Voraussetzungen geändert:

✅ DB-Backup gezogen (Backup-ID dokumentiert)
✅ `[REVIEW REQUIRED]` im PR-Titel
✅ Vollständiger Smoke-Test-Plan beigelegt (siehe `AI_GUARDRAILS.md` Abschnitt 6.2)
✅ Rollback-Pfad explizit dokumentiert
✅ Reviewer mit Domänen-Kenntnis hat zugestimmt
✅ Cron-Jobs vor Deploy ggf. pausiert
✅ Stripe-Webhook ggf. auf Test-Endpoint umgeleitet
✅ Außerhalb der Hauptlast-Zeiten deployen (z.B. Wochenende, abends)

### 3.1 ⛔ `supabase/functions/stripe-webhook/`
**Risiko:** Doppelbuchungen, verlorene Zahlungen, fehlerhafte FiBu-Einträge, falsche Provisionen, falsche Rechnungs-Status.

**Kritische Mechanismen, die intakt bleiben müssen:**
- Idempotenz-Logik mit `claimEvent()` (Status-Modell `processing` / `processed` / `error`)
- Partial-Unique-Index auf `processed_stripe_events`
- Race-Condition-Behandlung (`23505`-Code)
- Signatur-Validierung mit `STRIPE_WEBHOOK_SECRET`
- Audit-Logging bei Fehlern

**Pflicht-Tests vor Merge:**
- Manuelles Resend desselben Events → Idempotenz greift
- Test mit ungültiger Signatur → 400
- Test mit allen behandelten Event-Typen (`checkout.session.completed`, `customer.subscription.created/updated`, `invoice.paid`)
- Race-Condition-Test (zwei parallele Aufrufe)

### 3.2 ⛔ Andere Edge Functions in der Do-Not-Modify-Liste
Siehe `AI_GUARDRAILS.md` Abschnitt 3.1. Insbesondere:
- `auto-invoice` (monatlicher Cron, erzeugt echte Rechnungen)
- `lexware-integration` / `lexware-auto-sync` (externer Buchungssystem-Export)
- `create-contract-subscription` (Stripe-Abo-Anlage mit SEPA)
- `auth-email-hook` (alle Auth-E-Mails laufen hier durch)
- `create-user`, `approve-user`, `reset-user-mfa` (Rollen- und Zugangsverwaltung)

### 3.3 ⛔ RLS-Policies
**Risiko:** Datenleck (alle Leads / Verträge / Provisionen / FiBu-Daten für jede eingeloggte Person sichtbar).

**Pflicht-Tests vor Merge:**
- Login als JEDE Rolle (admin, sales_lead, regional_lead, sales_partner, tippgeber, user) — jeweils mit Test-Account
- Pro Rolle: Versuch, fremde Daten zu sehen (z.B. anderer Vertrieb-Partner) → muss scheitern
- Versuch ohne Login → muss scheitern
- Insbesondere `user_roles`, `profiles`, `audit_logs`, `signature_audit_logs` testen

**Niemals:** RLS deaktivieren (`DISABLE ROW LEVEL SECURITY`), auch nicht "kurz zum Testen".

### 3.4 ⛔ Auth / MFA
**Betroffen:**
- `src/lib/supabaseClient.ts` (localStorage-Pattern)
- `src/hooks/useAuth.tsx` (Defer-Pattern!)
- `src/components/ProtectedRoute.tsx` (MFA-Erzwingung)
- `src/pages/MfaChallenge.tsx`, `src/pages/MfaSetup.tsx`
- Alle Functions, die `supabase.auth.mfa.*` aufrufen

**Pflicht-Tests vor Merge:**
- Vollständiger Login-Flow für admin / sales_lead (privilegierte Rollen mit MFA-Pflicht)
- Vollständiger Login-Flow für user / sales_partner (ohne MFA-Pflicht)
- Tab-Schließen-Test (Session muss persistieren)
- MFA-Reset-Flow funktioniert
- Privilegien-Eskalation: nicht-privilegierter User kann KEINE admin-Routen aufrufen, weder via UI noch direkt

### 3.5 ⛔ Cron-Jobs
**Betroffen:**
- `auto-invoice` (monatlich, erzeugt Rechnungen)
- `qodia-auto-usage-sync` (täglich, holt Verbrauchsdaten)
- `demo-reminder`
- `lexware-auto-sync`

**Risiken:**
- Doppelte Ausführung → doppelte Rechnungen
- Fehlende Ausführung → keine Rechnung in einem Monat
- Falscher Zeitpunkt → Verbrauchsdaten unvollständig

**Pflicht vor Änderung:**
- Aktuelle Cron-Schedules dokumentieren
- Testlauf manuell auf Test-Daten
- Während des Deploys: Cron pausieren

### 3.6 ⛔ `CRON_SECRET_2` (und `CRON_SECRET`)
**Was:** Niemals neu generieren, umbenennen, oder durch andere Auth-Mechanismen ersetzen, ohne **gleichzeitig** alle Cron-Konfigurationen im Supabase-Dashboard und ggf. extern angebundene Aufrufer mitzuändern.

**Risiko:** Cron-Aufrufe werden mit 401 abgelehnt → keine Rechnungen, keine Usage-Sync.

**Falls doch nötig (z.B. Secret kompromittiert):**
1. Neues Secret generieren
2. Beide Secrets PARALLEL in der Function akzeptieren (Übergangsphase)
3. Cron-Schedules auf neues Secret umstellen
4. Nach 24h Beobachtungszeit: altes Secret entfernen

### 3.7 ⛔ Lexware-Integration
**Betroffen:** `lexware-integration`, `lexware-auto-sync`, `fibu_events`, `fibu_export_batches`, `fibu_audit_log`.

**Risiko:** Falsche Buchungen im echten Buchungssystem → Steuerlich relevante Konsequenzen, Reverse-Engineering von Korrekturen aufwändig.

**Tests:** Nur gegen Lexware-Test-Mandant. Niemals direkt gegen Produktiv-Mandant.

### 3.8 ⛔ Salesforce-Integration
**Betroffen:** `salesforce-auth`, `salesforce-callback`, `salesforce-sync-price`, `salesforce_connections`-Tabelle.

**Risiko:** OAuth-Flow ist sensibel — falsche Redirect-URLs sperren den gesamten Sync.

**Tests:** OAuth-Flow vollständig durchlaufen, Token-Speicherung in `salesforce_connections` prüfen.

### 3.9 ⛔ Qodia-Integration
**Betroffen:** `receive-usage`, `qodia-auto-usage-sync`, `qodia-status-sync`, `qodia-usage-query`, `qodia-initiate-booking`, `usage_charges`-Tabelle.

**Risiko:** Verbrauchsdaten sind die Basis der Abrechnung. Fehler hier → falsche Rechnungen.

**Tests:** Mit Qodia-Test-API-Key auf Test-Daten. `x-api-key`-Header darf nicht aus Versehen entfernt werden.

### 3.10 ⛔ Migrations-Historie
**Betroffen:** Alle Dateien in `supabase/migrations/`.

**Bestehende Migrationen werden NIEMALS bearbeitet.** Auch keine Kommentare. Auch keine Whitespace-Änderungen.

Korrekturen erfolgen ausschließlich als **neue** Migration mit neuem Zeitstempel. Auch das ist Kategorie 3.

---

## Empfohlener Fahrplan

Wenn der Wunsch besteht, das Projekt schrittweise zu härten, ohne Risiko:

### Sprint 1 (sofort, alles Kategorie 1)
1. ✅ Diese Datei + `AI_GUARDRAILS.md` ins Repo committen
2. ✅ `.env` zu `.gitignore` hinzufügen
3. ✅ README aktualisieren (Verweis auf Guardrails + System-Docs)
4. ✅ Tests für `validateIban`, `validateBic`, `lookupBic` schreiben
5. ✅ Lint in CI als Reporter aktivieren

### Sprint 2 (mit Reviewer)
1. UI-Text-Polishing in statischen Pages
2. JSDoc-Header in Utilities ergänzen
3. Type-Imports konsolidieren (`AppRole` aus einer Quelle)
4. ESLint-Warnungen pro Regel reduzieren

### Sprint 3 (Vorbereitung für sensible Bereiche)
1. Tests für `useAuth`, `useUserRole` (gemockt)
2. E2E-Test-Setup mit Playwright für die kritischen Flows
3. CORS-Whitelist-Audit (nur lesend, keine Änderung)
4. Console.log-Audit (nur dokumentieren, was zu tun wäre)

### Sprint 4+ (nur bei konkretem Bedarf, mit allen Vorkehrungen)
- Refactoring großer Pages — und auch dann pro PR nur eine Sub-Sektion
- Änderungen an Edge Functions / RLS / Auth — nur mit Backup, Reviewer, Smoke-Tests

---

## Versionierung

| Version | Datum | Autor | Änderung |
|---|---|---|---|
| v1.0 | 2026-04-27 | KI-Analyse / Projekt-Owner | Initiale Erstellung auf Basis der vollständigen Projekt-Analyse |
