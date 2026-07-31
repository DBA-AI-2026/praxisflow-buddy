CREATE TABLE public.goae_commission_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  ad_signup_bonus numeric NOT NULL,
  ad_usage_rate numeric NOT NULL,
  ad_usage_months integer NOT NULL,
  partner_usage_rate numeric NOT NULL,
  tippgeber_bonus numeric NOT NULL,
  tippgeber_revenue_threshold numeric NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX goae_commission_config_version_key
  ON public.goae_commission_config (version);

CREATE UNIQUE INDEX goae_commission_config_one_current
  ON public.goae_commission_config (is_current)
  WHERE is_current;

GRANT SELECT ON public.goae_commission_config TO authenticated;
GRANT ALL ON public.goae_commission_config TO service_role;

ALTER TABLE public.goae_commission_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active roles can view goae commission config"
  ON public.goae_commission_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.is_active
    )
  );

CREATE TRIGGER update_goae_commission_config_updated_at
  BEFORE UPDATE ON public.goae_commission_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.goae_commission_config
  (version, ad_signup_bonus, ad_usage_rate, ad_usage_months,
   partner_usage_rate, tippgeber_bonus, tippgeber_revenue_threshold,
   is_current, note)
VALUES
  (1, 100, 0.10, 24, 0.10, 200, 500, true, 'Seed: bestehende Konditionen HFX GOÄ (unverändert)');

CREATE OR REPLACE FUNCTION public.create_goae_commission_config(
  p_ad_signup_bonus numeric,
  p_ad_usage_rate numeric,
  p_ad_usage_months integer,
  p_partner_usage_rate numeric,
  p_tippgeber_bonus numeric,
  p_tippgeber_revenue_threshold numeric,
  p_note text DEFAULT NULL
)
RETURNS public.goae_commission_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_row public.goae_commission_config;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next FROM public.goae_commission_config;

  UPDATE public.goae_commission_config
     SET is_current = false
   WHERE is_current;

  INSERT INTO public.goae_commission_config
    (version, ad_signup_bonus, ad_usage_rate, ad_usage_months,
     partner_usage_rate, tippgeber_bonus, tippgeber_revenue_threshold,
     is_current, note, created_by)
  VALUES
    (v_next, p_ad_signup_bonus, p_ad_usage_rate, p_ad_usage_months,
     p_partner_usage_rate, p_tippgeber_bonus, p_tippgeber_revenue_threshold,
     true, p_note, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_goae_commission_config(numeric, numeric, integer, numeric, numeric, numeric, text) TO authenticated;