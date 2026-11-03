# Security phase 1

- [x] A: Revoke direct usage RPC execution; verify privileges and trigger.
- [x] B: Change only Salesforce cron headers; verify definition and schedule.
- [x] C: Add nullable notification claim timestamp; verify schema and unchanged policies.
- [x] D: Guard six approved functions; preserve excluded files and frontend callers.
- [x] Run offline security tests and checks, deploy only six functions without live invocations, report evidence.

# Betreut durch

- [x] Apply approved idempotent BEFORE INSERT trigger; no backfill.
- [x] Change only three internal contract labels.
- [x] Verify trigger order, offline rule tests and read-only SQL simulation; record label lines.
- [x] Prepare publish request and report automatic sync verification limits (repository status is not exposed).

# creditreform-check abschalten

- [x] Function aus supabase/functions entfernen, Code als Vorlage unter docs/vorlagen behalten.
- [x] Deployment löschen.
- [x] api-referenz.md: Hinweis + Anforderungen für echte Anbindung.

# Auftrag 2: Bezahlseite und Admin-Functions

- [ ] create-contract-subscription: Rolle + Zuständigkeit, feste Rücksprungadresse, 400/401/403/404.
- [ ] reset-user-mfa, salesforce-disconnect: requireActiveRole(["admin"]).
- [ ] api-referenz.md: offene Punkte Link-Ablauf, Kampagnen-Code nach Einlösung.
- [ ] Nur lesen: letzte Nutzung initiate-booking/salesforce-disconnect, Verlinkung alte Buchung.
- [ ] Lokale Tests, Deploy, Publish.
