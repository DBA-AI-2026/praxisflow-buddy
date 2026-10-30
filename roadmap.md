# Security phase 1

- [x] A: Revoke direct usage RPC execution; verify privileges and trigger.
- [x] B: Change only Salesforce cron headers; verify definition and schedule.
- [x] C: Add nullable notification claim timestamp; verify schema and unchanged policies.
- [x] D: Guard six approved functions; preserve excluded files and frontend callers.
- [x] Run offline security tests and checks, deploy only six functions without live invocations, report evidence.

# Betreut durch

- [ ] Apply approved idempotent BEFORE INSERT trigger; no backfill.
- [ ] Change only three internal contract labels.
- [ ] Verify trigger order, offline rule tests and read-only SQL simulation; record label lines.
- [ ] Request publish and report automatic sync verification limits.