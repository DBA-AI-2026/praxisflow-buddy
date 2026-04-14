
-- 1. Helper function to read CRON_SECRET from Supabase Vault
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
$$;

-- 2. Remove current (broken) cron job
SELECT cron.unschedule('qodia-auto-usage-sync-daily');

-- 3. Re-create cron job with x-cron-secret from vault
SELECT cron.schedule(
  'qodia-auto-usage-sync-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/qodia-auto-usage-sync',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4',
      'x-cron-secret', (SELECT public.get_cron_secret())
    ),
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
