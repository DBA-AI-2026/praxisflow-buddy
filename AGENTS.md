# Architecture rules

- Security phase 1 keeps role authorization in the existing shared guard and cron-secret comparisons local to each scheduled function, to preserve excluded shared code and caller status codes.
- Public access-request notification authorization is an atomic conditional database update before mail, with no claim reset, to prevent repeated or concurrent delivery attempts.
- Security regression tests execute real function handlers with mocked database, auth and mail dependencies; they must never invoke deployed functions or external delivery services.