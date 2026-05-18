-- Fix recursive RLS policy on public.customers
-- Old policy used `id IN (SELECT cu.id FROM public.customers cu JOIN contracts co ...)`
-- which self-references customers and can trigger infinite recursion.
-- New version uses the same pattern as "Users view own customers":
--   id IN (SELECT customer_id FROM contracts WHERE ...)

DROP POLICY IF EXISTS "Regional leads view team customers" ON public.customers;

CREATE POLICY "Regional leads view team customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND id IN (
    SELECT co.customer_id
    FROM public.contracts co
    WHERE co.customer_id IS NOT NULL
      AND (
        public.is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
        OR public.is_in_regional_lead_team(auth.uid(), co.created_by)
      )
  )
);