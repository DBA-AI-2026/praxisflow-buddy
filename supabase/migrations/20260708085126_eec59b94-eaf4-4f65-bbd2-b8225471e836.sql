DROP POLICY IF EXISTS "Regional leads update team leads" ON public.leads;
CREATE POLICY "Regional leads update team leads"
ON public.leads FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    assigned_to = auth.uid()
    OR (assigned_to IS NOT NULL AND is_in_regional_lead_team(auth.uid(), assigned_to))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    assigned_to = auth.uid()
    OR (assigned_to IS NOT NULL AND is_in_regional_lead_team(auth.uid(), assigned_to))
  )
);

DO $$
DECLARE v_qual text;
BEGIN
  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname='public' AND tablename='leads'
     AND policyname='Regional leads update team leads';
  RAISE NOTICE 'AFTER update-policy USING = %', v_qual;
  IF v_qual NOT ILIKE '%assigned_to = auth.uid()%' THEN
    RAISE EXCEPTION 'Selbst-Klausel fehlt in der UPDATE-Policy';
  END IF;
END $$;