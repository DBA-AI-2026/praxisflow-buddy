DROP POLICY IF EXISTS "Sales roles can view leads" ON public.leads;
CREATE POLICY "Sales roles can view leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND (
      assigned_to = auth.uid()
      OR (assigned_to IS NOT NULL AND is_in_regional_lead_team(auth.uid(), assigned_to))
    )
  )
);