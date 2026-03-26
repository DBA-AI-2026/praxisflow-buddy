
-- Sicherheits-Fix: commission_payouts Auditierbarkeits-Constraints
-- commission_rule_version und commission_base_amount sind Pflichtfelder für Audit-Nachvollziehbarkeit.
-- Dies verhindert, dass Provisionen ohne klare Regelreferenz eingetragen werden können.

COMMENT ON TABLE public.commission_payouts IS 
  'Provisionstabelle. INSERTs nur via service_role (auto-invoice Edge Function) oder admin-Rolle erlaubt. '
  'Alle Berechnungen erfolgen serverseitig. commission_rule_version und commission_base_amount sind Pflicht.';

ALTER TABLE public.commission_payouts
  ADD CONSTRAINT commission_payouts_rule_version_required
  CHECK (commission_rule_version IS NOT NULL AND length(trim(commission_rule_version)) > 0);

ALTER TABLE public.commission_payouts
  ADD CONSTRAINT commission_payouts_base_amount_required
  CHECK (commission_base_amount IS NOT NULL AND commission_base_amount >= 0);
