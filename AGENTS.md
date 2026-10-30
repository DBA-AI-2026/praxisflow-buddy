# Architecture rules

- Security phase 1 keeps role authorization in the existing shared guard and cron-secret comparisons local to each scheduled function, to preserve excluded shared code and caller status codes.
- Public access-request notification authorization is an atomic conditional database update before mail, with no claim reset, to prevent repeated or concurrent delivery attempts.
- Security regression tests execute real function handlers with mocked database, auth and mail dependencies; they must never invoke deployed functions or external delivery services.
- Contract caretaker fallback belongs exclusively in the BEFORE INSERT database trigger; preserve explicit selections and validate lead-assigned internal roles so all creation paths share the rule without backfill. Regression tests execute the migration in isolated PGlite, never inserting live contracts.- User-path contract actions in edge functions check responsibility via `_shared/contractAccess.ts` after `requireActiveRole`; service-key paths bypass both, so internal callers keep working unchanged.
