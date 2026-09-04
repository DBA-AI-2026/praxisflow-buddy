DROP POLICY IF EXISTS "Regional leads update team customers" ON public.customers;
CREATE POLICY "Regional leads update team customers"
ON public.customers FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND id IN (
    SELECT co.customer_id FROM public.contracts co
    WHERE co.customer_id IS NOT NULL
      AND (
        co.sales_partner_id = auth.uid()
        OR co.created_by = auth.uid()
        OR is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
        OR is_in_regional_lead_team(auth.uid(), co.created_by)
      )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND id IN (
    SELECT co.customer_id FROM public.contracts co
    WHERE co.customer_id IS NOT NULL
      AND (
        co.sales_partner_id = auth.uid()
        OR co.created_by = auth.uid()
        OR is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
        OR is_in_regional_lead_team(auth.uid(), co.created_by)
      )
  )
);

-- Verifikation im Muster von 20260708085126
DO $$
DECLARE v_qual text;
BEGIN
  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname='public' AND tablename='customers'
     AND policyname='Regional leads update team customers';
  IF v_qual NOT ILIKE '%sales_partner_id = auth.uid()%' THEN
    RAISE EXCEPTION 'Selbst-Klausel fehlt in der customers-UPDATE-Policy';
  END IF;
END $$;