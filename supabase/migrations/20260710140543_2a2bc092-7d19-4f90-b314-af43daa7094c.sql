ALTER TABLE public.commission_payouts
  ADD CONSTRAINT commission_payouts_uniq_invoice_role_trigger
  UNIQUE NULLS NOT DISTINCT (invoice_id, commission_role, payout_trigger);