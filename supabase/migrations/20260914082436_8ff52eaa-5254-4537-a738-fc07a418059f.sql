ALTER TABLE public.contracts
  ADD COLUMN plan_upgraded_at timestamptz,
  ADD COLUMN plan_upgrade_status text,
  ADD COLUMN plan_upgrade_error text,
  ADD COLUMN plan_upgrade_attempted_at timestamptz;