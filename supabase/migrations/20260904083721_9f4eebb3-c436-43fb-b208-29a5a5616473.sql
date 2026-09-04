-- Seed-Korrektur: lead_activity_thresholds auf yellow_days/red_days angleichen (Werte behalten)
UPDATE public.app_settings
SET value = jsonb_build_object(
      'yellow_days', COALESCE((value->>'yellow_days')::int, (value->>'yellow')::int, 7),
      'red_days',    COALESCE((value->>'red_days')::int,    (value->>'red')::int,    14)
    ),
    updated_at = now()
WHERE key = 'lead_activity_thresholds'
  AND (value ? 'yellow' OR value ? 'red' OR NOT (value ? 'yellow_days') OR NOT (value ? 'red_days'));

-- Falls der Seed fehlt: anlegen
INSERT INTO public.app_settings (key, value)
SELECT 'lead_activity_thresholds', '{"yellow_days": 7, "red_days": 14}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'lead_activity_thresholds');