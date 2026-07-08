CREATE OR REPLACE FUNCTION public.guard_contract_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- System (Service-Role, kein JWT) und Admin dürfen alles
    IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
      RETURN NEW;
    END IF;
    -- Geschützte Zielstatus: nur Admin/System
    IF NEW.status IN ('aktiv','gekuendigt','beendet','gesperrt') THEN
      RAISE EXCEPTION 'Statuswechsel zu "%" ist nur durch Admin oder System zulässig.', NEW.status;
    END IF;
    -- Kein Zurückdrehen aus aktiv (Admin/System bereits oben durchgelassen)
    IF OLD.status = 'aktiv' THEN
      RAISE EXCEPTION 'Ein aktiver Vertrag kann nicht manuell zurückgesetzt werden.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_contract_status_transition ON public.contracts;
CREATE TRIGGER guard_contract_status_transition
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_status_transition();