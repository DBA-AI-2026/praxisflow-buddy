DROP POLICY IF EXISTS "Sales roles and admins can create contracts" ON public.contracts;

CREATE POLICY "Sales roles and admins can create contracts"
  ON public.contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'sales_partner'::app_role)
     OR public.has_role(auth.uid(), 'sales_lead'::app_role)
     OR public.has_role(auth.uid(), 'regional_lead'::app_role)
     OR public.has_role(auth.uid(), 'user'::app_role))
    AND auth.uid() = created_by
  );