-- SECURITY-PHASE-1-NACHZUG (Restore-Pfad), bildet den Live-Stand vom 28.10.2026 ab.
-- A und C sind idempotent. B legt salesforce-auto-sync-12h nur an, wenn der Job fehlt
-- oder Zeitplan/Kommando (inkl. Ziel, Header, Body) vom Soll abweichen; sonst No-Op (jobid bleibt).
-- Soll-Kommando wörtlich aus cron.job.command vom 28.10.2026 (md5 53a8a2d6d3b154e8d1f10b726c47014f).

-- A
REVOKE EXECUTE ON FUNCTION public.recompute_contract_provider_usage(uuid, text) FROM PUBLIC, anon, authenticated;

-- C
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz NULL;

-- B
DO $do$
DECLARE
  soll_schedule text := '0 */12 * * *';
  soll_command text := $soll$
  SELECT net.http_post(
    url := 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/salesforce-auto-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $soll$;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'salesforce-auto-sync-12h'
      AND schedule = soll_schedule
      AND command = soll_command
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'salesforce-auto-sync-12h') THEN
      PERFORM cron.unschedule('salesforce-auto-sync-12h');
    END IF;
    PERFORM cron.schedule('salesforce-auto-sync-12h', soll_schedule, soll_command);
  END IF;
END
$do$;