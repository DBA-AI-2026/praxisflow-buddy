-- PRAXEN: sales_partner aus der breiten Policy nehmen, Eigensicht via contracts-Subselect.
DROP POLICY IF EXISTS "Sales roles can view praxen" ON public.praxen;
CREATE POLICY "Sales roles can view praxen"
ON public.praxen FOR SELECT
USING (
  has_role(auth.uid(), 'sales_lead'::app_role)
);

DROP POLICY IF EXISTS "Sales partners view own praxen" ON public.praxen;
CREATE POLICY "Sales partners view own praxen"
ON public.praxen FOR SELECT
USING (
  has_role(auth.uid(), 'sales_partner'::app_role)
  AND id IN (
    SELECT c.customer_id FROM public.contracts c
    WHERE (c.sales_partner_id = auth.uid() OR c.created_by = auth.uid())
      AND c.customer_id IS NOT NULL
  )
);