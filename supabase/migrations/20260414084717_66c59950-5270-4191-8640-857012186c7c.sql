
-- 1. Create vault entry for CRON_SECRET_2
SELECT vault.create_secret(
  gen_random_uuid()::text,
  'CRON_SECRET_2',
  'Shared cron secret v2 for edge function authentication'
);

-- 2. Update helper function to read CRON_SECRET_2
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET_2' LIMIT 1;
$$;
