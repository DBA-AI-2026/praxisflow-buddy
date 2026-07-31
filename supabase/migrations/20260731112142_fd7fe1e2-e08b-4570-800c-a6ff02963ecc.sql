-- #20 P1 NACHTRAG
-- 1. Prozentsätze auf Ganzzahl-Prozent umstellen.
-- Begründung: Der Motor rechnet mit Prozent als Ganzzahl (10) und stempelt
-- commission_rate = 10. Die Config MUSS dieselbe Einheit führen, damit
-- zwischen Config, Motor, Auszahlung und Anzeige keine Umrechnung nötig ist.
ALTER TABLE public.goae_commission_config RENAME COLUMN ad_usage_rate TO ad_usage_percent;
ALTER TABLE public.goae_commission_config RENAME COLUMN partner_usage_rate TO partner_usage_percent;

UPDATE public.goae_commission_config
   SET ad_usage_percent = 10, partner_usage_percent = 10
 WHERE version = 1;

-- 2. Sprint-Block (nullable -> UPDATE -> NOT NULL)
ALTER TABLE public.goae_commission_config
  ADD COLUMN ad_signup_sprint_amount    numeric,
  ADD COLUMN ad_signup_sprint_threshold integer,
  ADD COLUMN ad_signup_sprint_end       date;

UPDATE public.goae_commission_config
   SET ad_signup_sprint_amount    = 250,
       ad_signup_sprint_threshold = 25,
       ad_signup_sprint_end       = '2026-12-31'
 WHERE version = 1;

ALTER TABLE public.goae_commission_config
  ALTER COLUMN ad_signup_sprint_amount    SET NOT NULL,
  ALTER COLUMN ad_signup_sprint_threshold SET NOT NULL,
  ALTER COLUMN ad_signup_sprint_end       SET NOT NULL;

-- 3. CHECK-Constraints
ALTER TABLE public.goae_commission_config
  ADD CONSTRAINT goae_cc_ad_signup_bonus_nonneg            CHECK (ad_signup_bonus >= 0),
  ADD CONSTRAINT goae_cc_ad_signup_sprint_amount_nonneg    CHECK (ad_signup_sprint_amount >= 0),
  ADD CONSTRAINT goae_cc_ad_signup_sprint_threshold_nonneg CHECK (ad_signup_sprint_threshold >= 0),
  ADD CONSTRAINT goae_cc_ad_usage_months_nonneg            CHECK (ad_usage_months >= 0),
  ADD CONSTRAINT goae_cc_tippgeber_bonus_nonneg            CHECK (tippgeber_bonus >= 0),
  ADD CONSTRAINT goae_cc_tippgeber_threshold_nonneg        CHECK (tippgeber_revenue_threshold >= 0),
  ADD CONSTRAINT goae_cc_ad_usage_percent_range            CHECK (ad_usage_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT goae_cc_partner_usage_percent_range       CHECK (partner_usage_percent BETWEEN 0 AND 100);

-- 4. RPC neu aufsetzen — alte Signatur zwingend vorher droppen (keine Überladung!)
DROP FUNCTION IF EXISTS public.create_goae_commission_config(
  numeric, numeric, integer, numeric, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.create_goae_commission_config(
  p_ad_signup_bonus             numeric,
  p_ad_signup_sprint_amount     numeric,
  p_ad_signup_sprint_threshold  integer,
  p_ad_signup_sprint_end        date,
  p_ad_usage_percent            numeric,
  p_ad_usage_months             integer,
  p_partner_usage_percent       numeric,
  p_tippgeber_bonus             numeric,
  p_tippgeber_revenue_threshold numeric,
  p_note                        text DEFAULT NULL
)
RETURNS public.goae_commission_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    (version, ad_signup_bonus, ad_signup_sprint_amount, ad_signup_sprint_threshold,
     ad_signup_sprint_end, ad_usage_percent, ad_usage_months,
     partner_usage_percent, tippgeber_bonus, tippgeber_revenue_threshold,
     is_current, note, created_by)
  VALUES
    (v_next, p_ad_signup_bonus, p_ad_signup_sprint_amount, p_ad_signup_sprint_threshold,
     p_ad_signup_sprint_end, p_ad_usage_percent, p_ad_usage_months,
     p_partner_usage_percent, p_tippgeber_bonus, p_tippgeber_revenue_threshold,
     true, p_note, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_goae_commission_config(
  numeric, numeric, integer, date, numeric, integer, numeric, numeric, numeric, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_goae_commission_config(
  numeric, numeric, integer, date, numeric, integer, numeric, numeric, numeric, text)
  TO authenticated;

-- 5. GRANTs (nach den RENAMEs)
GRANT SELECT ON public.goae_commission_config TO authenticated;
GRANT ALL    ON public.goae_commission_config TO service_role;