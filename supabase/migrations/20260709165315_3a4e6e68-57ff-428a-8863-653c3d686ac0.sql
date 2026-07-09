CREATE OR REPLACE FUNCTION public.enforce_regional_lead_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.regional_lead_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.regional_lead_id
        AND role = 'regional_lead'
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'regional_lead_id (%) besitzt nicht die aktive Rolle regional_lead.', NEW.regional_lead_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_regional_lead_has_role
BEFORE INSERT OR UPDATE ON public.user_regional_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_regional_lead_role();