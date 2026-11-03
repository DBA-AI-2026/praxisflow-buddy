-- Phase 3.2: INSERT-Absicherung customer_events / plz_assignment_log (idempotent)
-- ROLLBACK:
--   DROP POLICY IF EXISTS "Responsible roles insert customer_events" ON public.customer_events;
--   CREATE POLICY "Authenticated can insert customer_events" ON public.customer_events FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
--   DROP POLICY IF EXISTS "Admin and sales_lead insert assignment log" ON public.plz_assignment_log;
--   CREATE POLICY "Authenticated insert assignment log" ON public.plz_assignment_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
--   GRANT UPDATE, DELETE ON public.customer_events, public.plz_assignment_log TO authenticated, anon;
--   DROP FUNCTION IF EXISTS public.can_write_customer_event(uuid, uuid);

CREATE OR REPLACE FUNCTION public.can_write_customer_event(p_lead_id uuid, p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_rl boolean;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'sales_lead'::app_role) THEN
    RETURN true;
  END IF;
  v_is_rl := public.has_role(v_uid, 'regional_lead'::app_role);
  IF NOT (v_is_rl OR public.has_role(v_uid, 'user'::app_role)) THEN
    RETURN false;
  END IF;
  IF p_lead_id IS NULL AND p_contract_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = p_lead_id
        AND (l.assigned_to = v_uid
             OR (v_is_rl AND l.assigned_to IS NOT NULL
                 AND public.is_in_regional_lead_team(v_uid, l.assigned_to)))
    ) INTO v_ok;
    IF NOT v_ok THEN RETURN false; END IF;
  END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = p_contract_id
        AND (c.created_by = v_uid OR c.sales_partner_id = v_uid
             OR (v_is_rl AND (
                  (c.created_by IS NOT NULL AND public.is_in_regional_lead_team(v_uid, c.created_by))
               OR (c.sales_partner_id IS NOT NULL AND public.is_in_regional_lead_team(v_uid, c.sales_partner_id)))))
    ) INTO v_ok;
    IF NOT v_ok THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_customer_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_customer_event(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can insert customer_events" ON public.customer_events;
DROP POLICY IF EXISTS "Responsible roles insert customer_events" ON public.customer_events;
CREATE POLICY "Responsible roles insert customer_events" ON public.customer_events
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_write_customer_event(lead_id, contract_id));

DROP POLICY IF EXISTS "Authenticated insert assignment log" ON public.plz_assignment_log;
DROP POLICY IF EXISTS "Admin and sales_lead insert assignment log" ON public.plz_assignment_log;
CREATE POLICY "Admin and sales_lead insert assignment log" ON public.plz_assignment_log
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales_lead'::app_role)));

REVOKE UPDATE, DELETE ON public.customer_events FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.plz_assignment_log FROM authenticated, anon;