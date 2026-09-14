ALTER TABLE public.contract_provider_status
  ADD COLUMN IF NOT EXISTS plan_upgraded_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_upgrade_status text,
  ADD COLUMN IF NOT EXISTS plan_upgrade_error text,
  ADD COLUMN IF NOT EXISTS plan_upgrade_attempted_at timestamptz;