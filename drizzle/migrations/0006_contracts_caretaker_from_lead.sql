-- Rollback: DROP TRIGGER IF EXISTS trg_assign_contract_caretaker_from_lead ON public.contracts;
--           DROP FUNCTION IF EXISTS public.assign_contract_caretaker_from_lead();
-- INSERT only: no existing contracts are backfilled; explicit caretakers are preserved.
CREATE OR REPLACE FUNCTION public.assign_contract_caretaker_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ad_id uuid;
  v_ad_name text;
  v_main_hfx text;
BEGIN
  IF NEW.sales_partner_id IS NOT NULL OR NEW.hfx_customer_number IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.hfx_customer_number ~ '^HFX-I-?[0-9]{5}-[0-9]{2}$' THEN
    v_main_hfx := regexp_replace(NEW.hfx_customer_number, '-[0-9]{2}$', '');
  END IF;

  -- Exact lead takes precedence; main lead is only a fallback for regular -NN sites.
  SELECT l.assigned_to INTO v_ad_id
  FROM public.leads l
  WHERE l.hfx_customer_number = NEW.hfx_customer_number
     OR (v_main_hfx IS NOT NULL AND l.hfx_customer_number = v_main_hfx)
  ORDER BY (l.hfx_customer_number = NEW.hfx_customer_number) DESC
  LIMIT 1;

  IF v_ad_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = v_ad_id AND r.is_active = true
      AND r.role IN ('user', 'regional_lead', 'sales_lead')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name INTO v_ad_name
  FROM public.profiles p WHERE p.user_id = v_ad_id;

  IF v_ad_name IS NOT NULL THEN
    NEW.sales_partner_id := v_ad_id;
    NEW.sales_partner_name := v_ad_name;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_contract_caretaker_from_lead() FROM PUBLIC, anon, authenticated;

-- PostgreSQL orders BEFORE INSERT triggers alphabetically: check_no_tippgeber_as_sales_partner runs first.
DROP TRIGGER IF EXISTS trg_assign_contract_caretaker_from_lead ON public.contracts;
CREATE TRIGGER trg_assign_contract_caretaker_from_lead
BEFORE INSERT ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.assign_contract_caretaker_from_lead();