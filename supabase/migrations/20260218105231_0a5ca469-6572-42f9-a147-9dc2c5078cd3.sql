-- Allow vertragsabteilung to view contracts
DROP POLICY IF EXISTS "Sales roles and admins can view contracts" ON public.contracts;
CREATE POLICY "Sales roles and admins can view contracts"
ON public.contracts
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- Allow vertragsabteilung to update contracts (for approval)
DROP POLICY IF EXISTS "Users can update own contracts or admin all" ON public.contracts;
CREATE POLICY "Users can update own contracts or admin all"
ON public.contracts
FOR UPDATE
USING (
  (auth.uid() = created_by)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);