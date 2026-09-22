CREATE OR REPLACE FUNCTION public.get_my_referred_leads()
RETURNS TABLE(
  praxis_name text,
  ort text,
  lead_status text,
  erfasst_am timestamp with time zone,
  vertrag_entstanden boolean,
  provisionshinweis text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rollenpruefung innerhalb der Funktion (Vorlage: admin_get_free_quota_overview)
  IF NOT public.has_role(auth.uid(), 'sales_partner'::app_role) THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  RETURN QUERY
  SELECT
    l.praxis_name,
    l.ort,
    l.status,
    l.created_at,
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.hfx_customer_number = l.hfx_customer_number
        AND c.status <> 'entwurf'
    ),
    'noch nicht freigeschaltet'::text
  FROM public.leads l
  WHERE l.vermittler_id = auth.uid()
  ORDER BY l.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referred_leads() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_referred_leads() FROM anon;