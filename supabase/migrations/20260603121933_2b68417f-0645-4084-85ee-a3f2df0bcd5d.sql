-- Restore-Sicherung: salesforce-auto-sync-12h (Repo-Drift-Schliessung)
-- Verbatim nach cron.job jobid 1. Anon-Key identisch zu bestehenden Qodia-Cron-Migrationen.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'salesforce-auto-sync-12h') THEN
    PERFORM cron.unschedule('salesforce-auto-sync-12h');
  END IF;
END $$;

SELECT cron.schedule(
  'salesforce-auto-sync-12h',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/salesforce-auto-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $$
);