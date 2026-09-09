-- Verwaisten pg_cron-Job "process-email-queue" (jobid 21, "5 seconds") entfernen.
-- Backing-Infrastruktur (public.email_send_state, pgmq.q_auth_emails,
-- pgmq.q_transactional_emails) existiert nicht -> Job scheitert seit ~2026-09-02
-- bei jedem Lauf. Kein Code/Trigger schreibt in diese Queues; Auth-Mails laufen
-- ueber auth-email-hook (Direktversand), App-Mails ueber Resend.
-- Restore-sicher: nur unschedulen, wenn der Job existiert.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule('process-email-queue');
  END IF;
END $$;