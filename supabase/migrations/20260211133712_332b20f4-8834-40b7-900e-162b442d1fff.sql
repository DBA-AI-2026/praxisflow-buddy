
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view praxen" ON public.praxen;

-- Replace with role-restricted SELECT policies
CREATE POLICY "Sales roles can view praxen"
ON public.praxen
FOR SELECT
USING (
  public.has_role(auth.uid(), 'sales_partner') OR
  public.has_role(auth.uid(), 'sales_lead')
);
