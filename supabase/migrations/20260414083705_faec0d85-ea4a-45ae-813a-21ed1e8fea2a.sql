
-- Store a shared CRON_SECRET in vault so the cron job can read it
SELECT vault.create_secret(
  gen_random_uuid()::text,
  'CRON_SECRET',
  'Shared secret for cron-to-edge-function authentication'
);
