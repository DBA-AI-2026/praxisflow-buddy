-- Fix: Trigger enforce_tippgeber_partner_assignment must also fire on UPDATE (role change to tippgeber)
DROP TRIGGER IF EXISTS check_tippgeber_has_partner ON public.user_roles;

CREATE TRIGGER check_tippgeber_has_partner
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tippgeber_partner_assignment();