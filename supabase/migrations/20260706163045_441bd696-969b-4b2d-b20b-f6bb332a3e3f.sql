
CREATE OR REPLACE FUNCTION public.guard_contract_sales_partner_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sales_partner_id IS DISTINCT FROM OLD.sales_partner_id THEN
    IF NOT (public.has_role(auth.uid(),'admin'::app_role)
            OR public.has_role(auth.uid(),'sales_lead'::app_role)) THEN
      RAISE EXCEPTION 'sales_partner_id darf nur von Admin oder Vertriebsleitung geändert werden (Umbuchung über die vorgesehene Aktion).';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER guard_contract_sales_partner_change
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_sales_partner_change();

CREATE OR REPLACE FUNCTION public.reassign_contract_ad(
  p_contract_id uuid, p_new_ad uuid, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_name text;
  v_old_ad uuid;
  v_old_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert' USING ERRCODE='28000';
  END IF;
  IF NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'sales_lead'::app_role)) THEN
    RAISE EXCEPTION 'Nur Admin oder Vertriebsleitung dürfen den zuständigen AD ändern' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_new_ad AND role='tippgeber'::app_role) THEN
    RAISE EXCEPTION 'Tippgeber dürfen nicht als zuständiger AD eingetragen werden';
  END IF;
  SELECT full_name INTO v_new_name FROM public.profiles WHERE user_id = p_new_ad;
  IF v_new_name IS NULL THEN
    RAISE EXCEPTION 'Ziel-AD nicht gefunden';
  END IF;
  SELECT sales_partner_id, sales_partner_name INTO v_old_ad, v_old_name FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vertrag nicht gefunden';
  END IF;

  UPDATE public.contracts
     SET sales_partner_id = p_new_ad, sales_partner_name = v_new_name
   WHERE id = p_contract_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, resource_path, user_role, success, details)
  VALUES (v_uid,
    (SELECT email FROM auth.users WHERE id = v_uid),
    'CONTRACT_REASSIGN', '/contracts/'||p_contract_id::text,
    (SELECT role::text FROM public.user_roles WHERE user_id = v_uid LIMIT 1),
    true,
    jsonb_build_object('contract_id',p_contract_id,'old_ad',v_old_ad,'old_ad_name',v_old_name,
                       'new_ad',p_new_ad,'new_ad_name',v_new_name,'reason',p_reason)::text);
END; $$;

GRANT EXECUTE ON FUNCTION public.reassign_contract_ad(uuid,uuid,text) TO authenticated;
