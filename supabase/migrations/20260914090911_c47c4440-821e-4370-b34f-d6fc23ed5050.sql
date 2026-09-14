ALTER TABLE public.contracts
  DROP COLUMN IF EXISTS plan_upgraded_at,
  DROP COLUMN IF EXISTS plan_upgrade_status,
  DROP COLUMN IF EXISTS plan_upgrade_error,
  DROP COLUMN IF EXISTS plan_upgrade_attempted_at;