-- Schedule-Restore: qodia-lead-usage-sync-daily
-- Stellt den Cron-Job für das Aktivitäts-Monitoring von Interessenten in der
-- Testphase wieder her. Bei Änderungen am Schedule MUSS diese Migration
-- nachgezogen werden, sonst entsteht Restore-Drift.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qodia-lead-usage-sync-daily') THEN
    PERFORM cron.unschedule('qodia-lead-usage-sync-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'qodia-lead-usage-sync-daily',
  '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/qodia-lead-usage-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := concat('{"trigger":"cron","time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
