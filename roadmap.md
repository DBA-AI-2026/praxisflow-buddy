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

- [x] create-contract-subscription: Rolle + Zuständigkeit, feste Rücksprungadresse, 400/401/403/404.
- [x] reset-user-mfa, salesforce-disconnect: requireActiveRole(["admin"]).
- [x] api-referenz.md: offene Punkte Link-Ablauf, Kampagnen-Code nach Einlösung.
- [x] Nur lesen: letzte Nutzung initiate-booking/salesforce-disconnect, Verlinkung alte Buchung.
- [x] Lokale Tests, Deploy, Publish.

# initiate-booking abschalten

- [x] Verweise geprüft (keine), Code nach docs/vorlagen, Deployment löschen, Referenz.

# Auftrag 3: capture-lead

- [x] Plan nach SAFE_CHANGE_PLAN (nur Plan).
- [x] Texte (erneuter Versand, AD-Hinweis Qodia-Fehlschlag) zur Freigabe vorlegen.
- [x] Nach Text-Freigabe bauen: Qodia zuerst, 24h-Sperre, IP-Grenze still 200, schlankes Protokoll, Dubletten, Migration.
- [x] api-referenz.md: Qodia-Einladungslink (Weg c) anfragen, dann Passwort aus Erstmail entfernen.

# Login-E-Mail ändern — Schritt 2

- [x] Neue Function: aktive Rollen, JWT/RLS vor Kundendaten mit Service-Zugang, exakte HFX-Prüfungen, Anbieterwechsel und Rückabwicklung, customer_events.
- [x] Gemeinsamer Dialog an drei freigegebenen E-Mail-Feldern; Sperren und Rechnungs-E-Mail unverändert.
- [ ] Lokale Regressionstests und Browserprüfung.
- [ ] Abnahme am Testcluster: Hauptnummer und -02 hin/zurück, 4b/4c, SQL + Anbieter-Konten; blockiert: Hauptnummer und -01 teilen ursprüngliche Adresse, Regel 4b verhindert Rückstellung. Kein Live-Wechsel ausgeführt. Vorschau-Anmeldung fehlt ebenfalls.
- [ ] Danach Publish anfordern; GitHub-Sync-Status nicht durch Agent einsehbar.
