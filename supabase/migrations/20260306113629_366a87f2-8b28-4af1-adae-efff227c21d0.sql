
-- Allow sales_lead and regional_lead to view all profiles
-- (needed for PLZ mapping page: RL names in table column and Gebietsleiter dropdown)
CREATE POLICY "Sales leads can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'regional_lead'::app_role)
  );
