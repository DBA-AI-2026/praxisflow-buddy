
-- 1) Audit-Spalten für manuelle Markierung
ALTER TABLE public.contract_provider_status
  ADD COLUMN IF NOT EXISTS manual_set_by uuid,
  ADD COLUMN IF NOT EXISTS manual_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_overridden_at timestamptz;

-- 2) app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read app_settings"
  ON public.app_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage app_settings"
  ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value)
  VALUES ('activity_thresholds', '{"yellow_days": 30, "red_days": 60}'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- 3) HFX EBM provider flag (honorarplus)
UPDATE public.products
   SET provider_flags = jsonb_set(
         coalesce(provider_flags, '{}'::jsonb),
         '{honorarplus}',
         'true'::jsonb,
         true
       )
 WHERE name = 'HFX EBM';
