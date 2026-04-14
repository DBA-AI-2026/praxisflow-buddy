
-- Remove old cron job
SELECT cron.unschedule('qodia-auto-usage-sync-daily');

-- Re-create with x-cron-secret header from vault
SELECT cron.schedule(
  'qodia-auto-usage-sync-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/qodia-auto-usage-sync',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
