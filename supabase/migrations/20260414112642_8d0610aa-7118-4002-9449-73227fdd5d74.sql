
DELETE FROM vault.secrets WHERE name = 'CRON_SECRET_2';

SELECT vault.create_secret(
  'hfx-cron-sync-2026-04-14',
  'CRON_SECRET_2',
  'Shared cron secret v2 for edge function authentication'
);
