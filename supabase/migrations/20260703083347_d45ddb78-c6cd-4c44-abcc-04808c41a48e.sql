
-- 1) contracts
DROP POLICY IF EXISTS "Gebietsleiter can view own contracts" ON public.contracts;
CREATE POLICY "Gebietsleiter can view own contracts"
ON public.contracts FOR SELECT
USING (
  (has_role(auth.uid(), 'user'::app_role) AND (sales_partner_id = auth.uid() OR created_by = auth.uid()))
  OR
  (has_role(auth.uid(), 'regional_lead'::app_role) AND (
    sales_partner_id = auth.uid()
    OR created_by = auth.uid()
    OR is_in_regional_lead_team(auth.uid(), sales_partner_id)
    OR is_in_regional_lead_team(auth.uid(), created_by)
  ))
);

-- 2) customers
DROP POLICY IF EXISTS "Regional leads view team customers" ON public.customers;
CREATE POLICY "Regional leads view team customers"
ON public.customers FOR SELECT
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
);

-- 3) praxen
DROP POLICY IF EXISTS "Gebietsleiter can view own praxen" ON public.praxen;
CREATE POLICY "Gebietsleiter can view own praxen"
ON public.praxen FOR SELECT
USING (
  (has_role(auth.uid(), 'user'::app_role) AND (id IN (
    SELECT contracts.customer_id FROM public.contracts
    WHERE ((contracts.sales_partner_id = auth.uid()) OR (contracts.created_by = auth.uid()))
      AND contracts.customer_id IS NOT NULL
  )))
  OR (has_role(auth.uid(), 'regional_lead'::app_role) AND (id IN (
    SELECT c.customer_id FROM public.contracts c
    WHERE (
      c.sales_partner_id = auth.uid()
      OR c.created_by = auth.uid()
      OR is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
      OR is_in_regional_lead_team(auth.uid(), c.created_by)
    )
      AND c.customer_id IS NOT NULL
  )))
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- 4) customer_events
DROP POLICY IF EXISTS "Regional leads view team customer_events" ON public.customer_events;
CREATE POLICY "Regional leads view team customer_events"
ON public.customer_events FOR SELECT
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    ((contract_id IS NOT NULL) AND (contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.sales_partner_id = auth.uid()
         OR c.created_by = auth.uid()
         OR is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
         OR is_in_regional_lead_team(auth.uid(), c.created_by)
    )))
    OR
    ((lead_id IS NOT NULL) AND (lead_id IN (
      SELECT l.id FROM public.leads l
      WHERE l.assigned_to = auth.uid()
         OR ((l.assigned_to IS NOT NULL) AND is_in_regional_lead_team(auth.uid(), l.assigned_to))
    )))
  )
);
