-- ROLLBACK:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_quota_grants TO authenticated;
--   GRANT SELECT ON public.free_quota_grants TO anon;   -- nur falls zuvor vorhanden
--   DROP FUNCTION IF EXISTS public.admin_create_free_quota_grant(text, text, integer, text);
--   DROP FUNCTION IF EXISTS public.admin_get_free_quota_overview(text);

-- (1) REVOKE der weiten Tabellen-GRANTs. service_role behaelt alles.
REVOKE ALL ON public.free_quota_grants FROM anon;
REVOKE ALL ON public.free_quota_grants FROM authenticated;
GRANT ALL ON public.free_quota_grants TO service_role;

-- (2) Schreib-RPC
CREATE OR REPLACE FUNCTION public.admin_create_free_quota_grant(
  p_hfx_customer_number text,
  p_grant_type text,
  p_menge integer,
  p_quelle text
)
RETURNS public.free_quota_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_row public.free_quota_grants;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_menge IS NULL OR p_menge <= 0 THEN
    RAISE EXCEPTION 'menge muss groesser als 0 sein';
  END IF;

  -- 'trial' ist hier bewusst AUSGESCHLOSSEN (Kollision mit
  -- free_quota_grants_one_auto_trial_per_hfx). Automatische Schreiber
  -- (capture-lead, sync-lead-qodia) laufen ueber service_role an dieser
  -- RPC vorbei und duerfen 'trial' weiter vergeben.
  IF p_grant_type IS NULL OR p_grant_type NOT IN ('bonus','sales_commitment','kulanz','standort') THEN
    RAISE EXCEPTION 'grant_type ungueltig: erlaubt sind bonus, sales_commitment, kulanz, standort';
  END IF;

  IF p_quelle IS NULL OR btrim(p_quelle) = '' THEN
    RAISE EXCEPTION 'quelle darf nicht leer sein';
  END IF;

  IF p_hfx_customer_number IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.hfx_customer_number = p_hfx_customer_number
  ) THEN
    RAISE EXCEPTION 'hfx_customer_number % existiert in contracts nicht', p_hfx_customer_number;
  END IF;

  INSERT INTO public.free_quota_grants (hfx_customer_number, grant_type, menge, quelle, created_by)
  VALUES (p_hfx_customer_number, p_grant_type, p_menge, btrim(p_quelle), auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- (3) Lese-RPC (Lebenssaldo)
CREATE OR REPLACE FUNCTION public.admin_get_free_quota_overview(
  p_hfx_customer_number text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grants_total numeric := 0;
  v_usage_invoiced numeric := 0;
  v_pending_offen numeric := 0;
  v_historie jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(SUM(g.menge), 0) INTO v_grants_total
  FROM public.free_quota_grants g
  WHERE g.hfx_customer_number = p_hfx_customer_number;

  SELECT COALESCE(SUM(uc.quantity), 0) INTO v_usage_invoiced
  FROM public.usage_charges uc
  WHERE uc.hfx_customer_number = p_hfx_customer_number
    AND uc.status = 'invoiced';

  SELECT COALESCE(SUM(uc.quantity), 0) INTO v_pending_offen
  FROM public.usage_charges uc
  WHERE uc.hfx_customer_number = p_hfx_customer_number
    AND uc.status = 'pending';

  SELECT COALESCE(jsonb_agg(h ORDER BY h.created_at DESC), '[]'::jsonb) INTO v_historie
  FROM (
    SELECT g.menge, g.grant_type, g.quelle, g.created_at, g.created_by
    FROM public.free_quota_grants g
    WHERE g.hfx_customer_number = p_hfx_customer_number
  ) h;

  -- SYNCHRONIZE mit _shared/freeQuota.ts (computeEffectiveUsageNet):
  -- Die Saldo-Formel max(0, grantsTotal - usageInvoicedPrior) existiert
  -- hier ein zweites Mal in SQL. Aendert sich die Formel im Motor,
  -- MUSS sie hier mitgeaendert werden, sonst zeigt die UI eine andere
  -- Zahl als die naechste Rechnung.
  -- Wichtiger Unterschied: Der Motor filtert usageInvoicedPrior zusaetzlich
  -- auf period_from < periodStart (Periodenbezug). Diese RPC zeigt den
  -- LEBENSSALDO ohne Periodenfilter - Absicht: sie beantwortet
  -- "wie viel ist insgesamt frei", nicht "was passiert auf der naechsten Rechnung".
  -- pending_offen wird getrennt ausgewiesen und NICHT in den Saldo gerechnet.
  RETURN jsonb_build_object(
    'grants_total', v_grants_total,
    'usage_invoiced', v_usage_invoiced,
    'saldo', GREATEST(0, v_grants_total - v_usage_invoiced),
    'pending_offen', v_pending_offen,
    'historie', v_historie
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_free_quota_grant(text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_free_quota_overview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_free_quota_grant(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_free_quota_overview(text) TO authenticated;