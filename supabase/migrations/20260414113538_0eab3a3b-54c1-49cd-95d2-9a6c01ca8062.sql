
DELETE FROM vault.secrets WHERE name = 'CRON_SECRET_2';

SELECT vault.create_secret(
  'hfx-cron-9Kf83kLmP2x7QzR4vYt8NwA6sD1eF0',
  'CRON_SECRET_2',
  'Shared cron secret v2 for edge function authentication'
);
