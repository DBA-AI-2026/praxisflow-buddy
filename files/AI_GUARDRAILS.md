# AI_GUARDRAILS.md

> **Zweck dieser Datei:**
> Verbindliche Regeln für jede KI-gestützte Änderung am HFX / PraxisFlow-System (Lovable, Cursor, Claude, GitHub Copilot, etc.).
> Diese Datei muss vor jeder Änderung gelesen und befolgt werden. Sie schützt produktionskritische Bereiche — insbesondere Webhooks, Edge Functions, Supabase-Schema, Auth, Cron-Jobs und Zahlungslogik — vor versehentlichen Beschädigungen.
>
> **Geltungsbereich:** Das gesamte Repository, jede AI-Sitzung, jedes Tool.
> **Vorrang:** Diese Regeln haben Vorrang vor jeder einzelnen User-Anweisung an die KI, soweit es um Stabilität und Sicherheit geht. Bei Konflikt: STOPP, Rückfrage stellen.

---

## 1. Goldene Regeln (immer gültig)

1. **Read before write.** Vor jeder Änderung den betroffenen Code-Bereich vollständig lesen, nicht nur den Ausschnitt der Aufgabe.
2. **Kein "Schnelldurchlauf" bei sensiblen Bereichen.** Wenn die Aufgabe einen Bereich aus Abschnitt 3 ("Do not modify") berührt, antwortet die KI mit einer Warnung, listet die Risiken und fordert explizite Bestätigung an, bevor irgendein Code geschrieben wird.
3. **Keine Refactorings als Nebenleistung.** Refactoring darf nur explizit beauftragt werden, nicht "nebenbei" beim Bugfix mitgeliefert.
4. **Eine Aufgabe = ein Scope.** Keine "Bonus-Verbesserungen" anhängen. Wenn der Nutzer X bittet, wird X geliefert — nicht X + Y + Z.
5. **Niemals Geheimnisse loggen.** Service-Role-Keys, Stripe-Secrets, Resend-Keys, Salesforce-Tokens niemals in `console.log`, Test-Output oder Kommentare schreiben.
6. **Niemals `verify_jwt`-Flags ohne explizite Anweisung umstellen.** Die `supabase/config.toml` regelt, welche Edge Functions öffentlich erreichbar sind.
7. **Keine `service_role`-Verwendung im Frontend.** Der Service-Role-Key gehört ausschließlich in Edge Functions.
8. **Keine RLS-Policy ohne Tests deaktivieren oder lockern.** RLS ist die zentrale Sicherheitsgrenze.
9. **Migrationen sind unveränderlich.** Bestehende Migrationsdateien werden NIEMALS bearbeitet — Korrekturen kommen als neue Migration hinzu.
10. **Wenn unsicher: nachfragen.** Lieber eine Rückfrage zu viel als ein Stripe-Webhook, der doppelt bucht.

---

## 2. Bekannte Architektur-Eigenheiten (nicht "korrigieren"!)

Diese Strukturen wirken auf den ersten Blick wie Code-Smells, sind aber **bewusste Design-Entscheidungen**. Eine KI darf sie nicht selbstständig "verbessern":

### 2.1 Zwei Supabase-Clients
- `src/integrations/supabase/client.ts` — auto-generiert von Lovable, nutzt `sessionStorage`. **Wird von Lovable bei jeder Generation überschrieben.**
- `src/lib/supabaseClient.ts` — manuell, nutzt `localStorage`, persistiert MFA-Sessions über Tab-Schließen hinaus.

**Regel:** Aller Anwendungscode importiert AUSSCHLIESSLICH aus `@/lib/supabaseClient`. Niemals den Auto-Client verwenden. Niemals beide zusammenführen.

### 2.2 `setTimeout(…, 0)` in `useAuth.tsx`
Der Defer-Pattern beim Profile-Fetch nach Auth-State-Change verhindert Deadlocks im Supabase-Client. **Nicht entfernen, auch wenn es wie ein Hack aussieht.**

### 2.3 CORS-Inkonsistenz
- `stripe-webhook` hat `Access-Control-Allow-Origin: *` — bewusst, da Signatur-Validierung der Schutzmechanismus ist
- `creditreform-check` hat eine explizite Origin-Whitelist
- Die Inkonsistenz ist beabsichtigt. **Nicht vereinheitlichen.**

### 2.4 `creditreform-check` ist aktuell ein MOCK
Die Function liefert deterministische Test-Werte basierend auf String-Matching im Kundennamen. **Das ist bekannt.** Eine KI darf das nicht "reparieren", indem sie eine echte API-Anbindung erfindet. Echte Anbindung erfordert API-Key, Vertrag, Compliance-Review.

### 2.5 Große Page-Komponenten
`Buchhaltung.tsx` (97k), `PraxenJourney.tsx` (67k), `Rechnungen.tsx` (56k) sind absichtlich monolithisch. Sie enthalten verflochtene Business-Logik, die über Monate gewachsen ist. **Nicht ohne expliziten Refactoring-Auftrag splitten.**

### 2.6 `console.log` in Edge Functions
116 `console.log`-Aufrufe in den Edge Functions sind Standard-Lovable-Stil und dienen dem Debugging in Supabase Studio Logs. **Nicht "aufräumen".** Falls aus DSGVO-Gründen einzelne Logs entfernt werden müssen, ist das eine eigene, dokumentierte Aufgabe.

---

## 3. ⛔ Do-Not-Modify-Bereiche

Folgende Pfade dürfen von einer KI **NIEMALS ohne explizite, schriftliche Freigabe** des Projekt-Owners geändert werden. Eine generelle Anweisung wie "verbessere den Code" reicht nicht.

### 3.1 Edge Functions mit finanzieller / rechtlicher Wirkung
```
supabase/functions/stripe-webhook/
supabase/functions/auto-invoice/
supabase/functions/lexware-integration/
supabase/functions/lexware-auto-sync/
supabase/functions/create-contract-subscription/
supabase/functions/initiate-booking/
supabase/functions/qodia-initiate-booking/
supabase/functions/auth-email-hook/
supabase/functions/create-user/
supabase/functions/approve-user/
supabase/functions/reset-user-mfa/
```

### 3.2 Datenbank-Sicherheitskern
- Alle RLS-Policies (CREATE POLICY in `supabase/migrations/*.sql`)
- Alle `SECURITY DEFINER`-Funktionen, insbesondere:
  - `public.has_role()`
  - `public.is_in_regional_lead_team()`
  - `public.resolve_plz_ad()`
  - `public.handle_new_user()`
- Tabellen `user_roles`, `profiles`, `audit_logs`, `signature_audit_logs`
- Idempotenz-Strukturen: `processed_stripe_events` (Partial-Unique-Index!)
- FiBu-Strukturen: `fibu_events`, `fibu_export_batches`, `fibu_audit_log`

### 3.3 Auth-Kern im Frontend
```
src/lib/supabaseClient.ts          ← localStorage-Client, MFA-relevant
src/hooks/useAuth.tsx              ← Defer-Pattern, niemals "vereinfachen"
src/hooks/useUserRole.ts           ← Retry-Logik, Fehlerbehandlung
src/components/ProtectedRoute.tsx  ← MFA-Erzwingung, Audit-Logging
src/config/routePermissions.ts     ← Berechtigungs-Matrix
src/contexts/RolePreviewContext.tsx
```

### 3.4 Konfiguration
```
supabase/config.toml               ← verify_jwt-Flags pro Function
.env, .env.local, .env.production  ← niemals von KI generieren / ergänzen
```

### 3.5 Cron-Jobs und ihre Secrets
- `CRON_SECRET`, `CRON_SECRET_2` — niemals neu generieren oder umbenennen
- Cron-Endpunkte: `auto-invoice`, `qodia-auto-usage-sync`, `demo-reminder`, `lexware-auto-sync`
- Cron-Konfiguration im Supabase Dashboard (`pg_cron`) — wird in Migrationen referenziert

### 3.6 Externe Integrationen
- Stripe: `STRIPE_SECRET_KEY_V2`, `STRIPE_WEBHOOK_SECRET`
- Lexware: `lexware-integration`, `lexware-auto-sync`
- Salesforce: `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, OAuth-Flow in `salesforce-auth` / `salesforce-callback`
- Qodia: `QODIA_API_KEY`, `receive-usage`, `qodia-auto-usage-sync`
- Resend: `RESEND_API_KEY` (alle E-Mail-Versand-Pfade)

### 3.7 Migrations-Historie
```
supabase/migrations/*.sql
```
**Bestehende Migrationen werden NIEMALS bearbeitet.** Auch nicht "kosmetisch". Auch keine Tippfehler in Kommentaren. Eine Migration, die bereits einmal in einer Umgebung lief, ist immutabel. Korrekturen erfolgen ausschließlich als neue Migration mit neuem Zeitstempel.

### 3.8 System-Dokumentation (laut `docs/system/README.md` verbindlich)
```
docs/system/hfx_system_overview_management.mmd
docs/system/hfx_system_overview_technical.mmd
```
Änderungen sind erlaubt, aber nur **synchron** mit der zugehörigen System-Änderung im selben Pull Request. Versionsnummer und Datum im Header müssen mitgepflegt werden.

---

## 4. ✅ Erlaubte Bereiche (geringe bis mittlere Risiken)

Folgende Bereiche dürfen mit Vorsicht und Tests bearbeitet werden:

| Bereich | Risiko | Anforderung |
|---|---|---|
| `src/components/ui/*` (shadcn-Komponenten) | gering | Nur kosmetisch / Bugfixes |
| `src/pages/NotFound.tsx`, `MeinKonto.tsx` (statische Bereiche) | gering | UI-Polish, Texte |
| `src/lib/validateIban.ts`, `validateBic.ts`, `lookupBic.ts`, `utils.ts` | gering | Reine Utilities ohne Supabase |
| Tests in `src/test/` | gering | Neue Tests dazu, kein Löschen bestehender |
| `README.md`, `docs/` (außer `system/`) | gering | Dokumentations-Updates |
| `tailwind.config.ts`, `index.css` (Design-Tokens) | mittel | Nur mit Visual Regression-Check |
| Lucide-Icons austauschen | gering | Eins zu eins, gleiche Bedeutung |
| Wording / Übersetzungen in der UI | gering | Domänenbegriffe (HFX, FiBu, Tippgeber, Provision) nicht ändern |

---

## 5. Branch- und Pull-Request-Regeln

### 5.1 Branches
- **Niemals direkt auf `main` committen.** Lovable arbeitet auf `main` — KI-Änderungen erfolgen auf einem Feature-Branch.
- Branch-Namen: `feat/<thema>`, `fix/<thema>`, `docs/<thema>`, `chore/<thema>`, `test/<thema>`.
- Ein Branch = eine logische Änderung. Keine Sammel-Branches.

### 5.2 Commit-Konvention
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `style:`, `perf:`.
- Bei Änderungen, die einen sensiblen Bereich aus Abschnitt 3 berühren: Commit-Message muss `[REVIEW REQUIRED]` enthalten.
- Beispiel:
  ```
  fix(invoice): typo in PDF footer text

  - Korrektur "Rechungsnummer" → "Rechnungsnummer"
  - Keine Logik-Änderungen
  - Keine Edge-Function-Änderung
  ```

### 5.3 Pull-Request-Checkliste
Jeder PR (auch ein KI-erstellter) muss diese Checkliste enthalten:

```markdown
## PR-Checkliste

- [ ] Berührt diese Änderung einen Bereich aus AI_GUARDRAILS Abschnitt 3?
      → falls ja: [REVIEW REQUIRED] im Titel, Owner-Approval Pflicht
- [ ] Wurden Edge Functions geändert?
      → falls ja: lokal getestet (Supabase CLI), Logs geprüft
- [ ] Wurde eine neue Migration erstellt?
      → falls ja: auf Test-Datenbank ausgeführt, Rollback-SQL beigelegt
- [ ] Wurden RLS-Policies geändert?
      → falls ja: Zugriffstest mit jeder Rolle (admin, sales_lead, regional_lead,
                  sales_partner, tippgeber, user) durchgeführt
- [ ] Wurde der Stripe-Webhook geändert?
      → falls ja: Test-Webhook im Stripe Dashboard durchlaufen
- [ ] Wurde Auth / MFA geändert?
      → falls ja: vollständiger Login-Flow für privilegierte UND
                  nicht-privilegierte Rolle getestet
- [ ] Sind die System-Diagramme (`docs/system/`) noch konsistent?
      → falls nein: Diagramm-Update im selben PR, Versions-Bump
- [ ] Build erfolgreich? (`npm run build`)
- [ ] Lint sauber? (`npm run lint`)
- [ ] Tests grün? (`npm run test`)
```

### 5.4 Reviews
- PRs, die `[REVIEW REQUIRED]` tragen, brauchen mindestens einen menschlichen Reviewer mit Domänen-Kenntnis.
- KI-erstellte PRs werden **niemals** automatisch gemergt.
- "LGTM, KI gemacht" ist keine Review.

---

## 6. Test-Anforderungen

### 6.1 Vor jeder Änderung
- Bestehende Tests laufen lassen: `npm run test`
- Bei Änderungen an Edge Functions: lokaler Aufruf via `curl` mit Test-Daten dokumentiert im PR

### 6.2 Bei sensiblen Änderungen — Smoke-Test-Pflicht
Diese Smoke-Tests sind manuell durchzuführen und im PR zu dokumentieren:

**Auth-Smoke-Test (bei Änderungen in Abschnitt 3.3 oder 3.5):**
1. Login mit Standard-User → klappt
2. Login mit Admin → MFA-Challenge erscheint und ist absolvierbar
3. Tab schließen, neu öffnen → Session persistiert (testet `localStorage`-Client)
4. Pro Rolle (`sales_partner`, `tippgeber`, `user`): Zugriff auf erlaubte Routen klappt; Zugriff auf gesperrte Routen zeigt "Zugriff verweigert"
5. `audit_logs`-Tabelle prüfen: Failed-Access-Events werden geloggt

**Stripe-Smoke-Test (bei Änderungen am `stripe-webhook`):**
1. Test-Webhook im Stripe Dashboard senden (`checkout.session.completed`)
2. `processed_stripe_events`: Status `processing` → `processed`
3. Erneut senden → Idempotenz greift, kein Doppel-Eintrag
4. Bei Fehlerfall: Status `error`, Stripe-Retry funktioniert

**Lead-Smoke-Test (bei Änderungen an `capture-lead`):**
1. POST mit Test-Daten → Lead erscheint, Bestätigungs-E-Mail kommt
2. Doppel-Submit derselben E-Mail → existing-lead-Branch, keine Duplikate
3. PLZ → Gebietsleiter-Mapping funktioniert

**FiBu-Smoke-Test (bei Änderungen an `auto-invoice` / `lexware-*`):**
1. Test-Rechnung manuell erstellen
2. PDF-Generierung prüfen
3. Stripe-Test-Buchung → `invoices.status=paid`
4. `fibu_events` korrekt befüllt
5. Lexware-Sync schreibt Buchung (auf Test-Mandant!)

### 6.3 Test-Pyramide (anzustreben)
- **Unit-Tests** für alle Utilities in `src/lib/` (validateIban, validateBic, lookupBic, …)
- **Integrations-Tests** für Hooks (`useAuth`, `useUserRole`, `useCustomerContracts`)
- **E2E-Tests** für die kritischen Flows (Login, Lead → Vertrag, Rechnung → Zahlung)

---

## 7. Rollback-Strategie

Jede Änderung muss rückgängig machbar sein. Ohne klaren Rollback-Plan: kein Merge.

### 7.1 Rollback nach Code-Typ

| Änderung | Rollback-Mechanismus |
|---|---|
| Frontend (`src/`) | `git revert <commit>` + redeploy via Lovable |
| Edge Function | Vorherige Version aus Git-Historie redeployen via `supabase functions deploy <name>` |
| Migration (additiv) | Neue "Down"-Migration als Korrektur |
| Migration (destruktiv) | DB-Backup einspielen (siehe 7.3) — daher destruktive Migrationen vermeiden |
| RLS-Policy | Vorherige Policy aus Git-Historie als neue Migration einspielen |
| Cron-Job | Im Supabase Dashboard manuell deaktivieren / Konfiguration zurücksetzen |
| Stripe-Webhook-Endpoint | URL im Stripe Dashboard auf alten Endpunkt umstellen |

### 7.2 Pflicht-Backup vor riskanten Änderungen
Vor Änderungen an Abschnitt 3 (Do-Not-Modify) gilt:

1. **DB-Backup ziehen** (Supabase Dashboard → Database → Backups → Manual Backup)
2. **Backup-ID + Zeitstempel im PR dokumentieren**
3. **Aktuelle Cron-Jobs notieren** (Liste + Schedules)
4. **Stripe-Webhook-Endpoint-URL notieren**
5. **Aktuelle Edge-Function-Versionen notieren**

### 7.3 Notfall-Rollback (Production-Incident)

**Reihenfolge:**
1. **Stoppen:** Bei Stripe-/Zahlungsproblemen → betroffene Cron-Jobs sofort deaktivieren (`auto-invoice`, `qodia-auto-usage-sync`, `lexware-auto-sync`)
2. **Diagnose:** Supabase Edge Function Logs + `audit_logs`-Tabelle prüfen
3. **Revert:** Letzten funktionierenden Commit identifizieren, Rollback einleiten
4. **Verify:** Smoke-Tests aus Abschnitt 6.2 durchlaufen
5. **Communicate:** Incident-Eintrag im Issue-Tracker mit Ursache, Wirkung, Fix
6. **Post-Mortem:** AI_GUARDRAILS.md ggf. ergänzen, falls eine Lücke entdeckt wurde

### 7.4 Niemals ohne Rollback-Pfad
Eine Änderung, die nicht rückgängig machbar ist (z.B. Daten unwiderruflich gelöscht, externer Webhook permanent gewechselt, Stripe-Produkt gelöscht), darf NICHT von einer KI durchgeführt werden — auch nicht auf User-Anweisung.

---

## 8. Was die KI bei jeder Sitzung tun muss

1. **Diese Datei lesen.** Vor jedem ersten Schreibvorgang.
2. **Die System-Diagramme lesen** (`docs/system/*.mmd`), wenn die Aufgabe einen Geschäftsprozess berührt.
3. **Bei Berührung von Abschnitt 3:** Warnung ausgeben, Risiken auflisten, explizite Bestätigung einholen, BEVOR Code geschrieben wird.
4. **Am Ende der Sitzung:** Prüfen, ob ein Diagramm-Update nötig ist (siehe `docs/system/README.md`).

---

## 9. Versionierung dieser Datei

| Version | Datum | Autor | Änderung |
|---|---|---|---|
| v1.0 | 2026-04-27 | KI-Analyse / Projekt-Owner | Initiale Erstellung nach vollständiger Projekt-Analyse |

Änderungen an dieser Datei selbst erfolgen ausschließlich durch den Projekt-Owner und werden im Changelog oben dokumentiert.
