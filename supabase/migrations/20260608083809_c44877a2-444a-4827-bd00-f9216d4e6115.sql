-- ⚠ SCHEDULE-RESTORE
-- Diese Migration stellt vier produktiv-kritische pg_cron-Schedules wieder her.
-- Quelle: Cron-Inventar Stand 2026-06-02, verifiziert gegen cron.job am 2026-06-08.
-- Bei Schedule-Änderungen via Supabase Dashboard MUSS diese Migration
-- nachgezogen werden, sonst gibt es Drift nach DB-Restore.
--
-- Bewusst NICHT enthalten:
--   * salesforce-auto-sync-12h (Salesforce-Integration tot seit 03/2026;
--     bereits separat in 20260603121933 restauriert)
--   * demo-reminder-daily (Cron inaktiv seit 05/2026)
-- Beide werden in separaten Vorhaben geklärt.
--
-- Pattern-Hinweis: Die Inkonsistenz zwischen `public.get_cron_secret()` (direkt)
-- und `(SELECT public.get_cron_secret())` (Subquery) sowie das Fehlen des
-- Authorization-Headers bei qodia-status-sync sind 1:1 aus dem Live-Stand
-- übernommen. Vereinheitlichung ist ein separater Auftrag.

-- 1) auto-invoice-monthly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-invoice-monthly') THEN
    PERFORM cron.unschedule('auto-invoice-monthly');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-invoice-monthly',
  '0 6 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/auto-invoice',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := concat('{"trigger":"cron","time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 2) qodia-auto-usage-sync-daily (Vormonat, Body leer = previous)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qodia-auto-usage-sync-daily') THEN
    PERFORM cron.unschedule('qodia-auto-usage-sync-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'qodia-auto-usage-sync-daily',
  '0 4 * * *',
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

-- 3) qodia-status-sync-daily (kein Authorization-Header — 1:1 wie live)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qodia-status-sync-daily') THEN
    PERFORM cron.unschedule('qodia-status-sync-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'qodia-status-sync-daily',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/qodia-status-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4) qodia-auto-usage-sync-current-daily (laufender Monat)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qodia-auto-usage-sync-current-daily') THEN
    PERFORM cron.unschedule('qodia-auto-usage-sync-current-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'qodia-auto-usage-sync-current-daily',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url:='https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/qodia-auto-usage-sync',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hlbnRiYnp1eWFucWJxdmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODUyNDIsImV4cCI6MjA4NDA2MTI0Mn0.-StWFfcj5G1OVwY-Jrwta5uOx-njtnsI_Ecalu5vrs4',
      'x-cron-secret', (SELECT public.get_cron_secret())
    ),
    body:='{"period":"current"}'::jsonb
  ) AS request_id;
  $$
);