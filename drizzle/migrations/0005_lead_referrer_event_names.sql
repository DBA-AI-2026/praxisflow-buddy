-- set_lead_referrer: Ereignis zusätzlich mit Klarnamen (Alt/Neu/Bearbeiter) für den Verlauf.
CREATE OR REPLACE FUNCTION public.set_lead_referrer(p_lead_id uuid, p_vermittler_id uuid, p_tippgeber_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_name_of CONSTANT text := 'x';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'sales_lead'::app_role)) THEN
    RAISE EXCEPTION 'Nur Admin oder Vertriebsleitung dürfen Vermittler/Tippgeber zuordnen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interessent nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF p_vermittler_id IS NOT NULL AND NOT public.has_role(p_vermittler_id, 'sales_partner'::app_role) THEN
    RAISE EXCEPTION 'Vermittler muss ein aktiver Vertriebspartner sein' USING ERRCODE = '22023';
  END IF;
  IF p_tippgeber_id IS NOT NULL AND NOT public.has_role(p_tippgeber_id, 'tippgeber'::app_role) THEN
    RAISE EXCEPTION 'Tippgeber muss ein aktiver Tippgeber sein' USING ERRCODE = '22023';
  END IF;

  IF v_lead.hfx_customer_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.hfx_customer_number = v_lead.hfx_customer_number
  ) THEN
    RAISE EXCEPTION 'Zuordnung nach Vertragsanlage nicht mehr änderbar' USING ERRCODE = 'P0001';
  END IF;

  IF v_lead.vermittler_id IS NOT DISTINCT FROM p_vermittler_id
     AND v_lead.tippgeber_id IS NOT DISTINCT FROM p_tippgeber_id THEN
    RETURN;
  END IF;

  PERFORM set_config('hfx.lead_referrer_rpc', 'on', true);
  UPDATE public.leads
     SET vermittler_id = p_vermittler_id,
         tippgeber_id  = p_tippgeber_id
   WHERE id = p_lead_id;
  PERFORM set_config('hfx.lead_referrer_rpc', 'off', true);

  INSERT INTO public.customer_events (event_type, entity_type, entity_id, hfx_customer_number, lead_id, event_data, created_by)
  VALUES ('LEAD_REFERRER_CHANGED', 'lead', p_lead_id, v_lead.hfx_customer_number, p_lead_id,
    jsonb_build_object(
      'old_vermittler_id',   v_lead.vermittler_id,
      'old_vermittler_name', (SELECT full_name FROM public.profiles WHERE user_id = v_lead.vermittler_id),
      'new_vermittler_id',   p_vermittler_id,
      'new_vermittler_name', (SELECT full_name FROM public.profiles WHERE user_id = p_vermittler_id),
      'old_tippgeber_id',    v_lead.tippgeber_id,
      'old_tippgeber_name',  (SELECT full_name FROM public.profiles WHERE user_id = v_lead.tippgeber_id),
      'new_tippgeber_id',    p_tippgeber_id,
      'new_tippgeber_name',  (SELECT full_name FROM public.profiles WHERE user_id = p_tippgeber_id),
      'changed_by_name',     (SELECT full_name FROM public.profiles WHERE user_id = v_uid)
    ),
    v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.set_lead_referrer(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_lead_referrer(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_lead_referrer(uuid, uuid, uuid) TO authenticated;