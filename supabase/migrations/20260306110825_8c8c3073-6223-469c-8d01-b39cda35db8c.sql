
-- Drop the overly broad "authenticated" policy
DROP POLICY IF EXISTS "Authenticated can view PLZ mappings" ON public.plz_gebietsleiter_mapping;

-- Admins and sales_lead (LAD) see all
CREATE POLICY "Admins and LAD can view all PLZ mappings"
  ON public.plz_gebietsleiter_mapping
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
  );

-- Regionalleiter see their own entries + entries of their assigned Gebietsleiter
CREATE POLICY "Regional lead can view own and team PLZ mappings"
  ON public.plz_gebietsleiter_mapping
  FOR SELECT
  USING (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND (
      gebietsleiter_id = auth.uid()
      OR gebietsleiter_id IN (
        SELECT user_id
        FROM public.user_regional_assignments
        WHERE regional_lead_id = auth.uid()
      )
    )
  );

-- Gebietsleiter (user) see their own entries only
CREATE POLICY "Gebietsleiter can view own PLZ mappings"
  ON public.plz_gebietsleiter_mapping
  FOR SELECT
  USING (
    has_role(auth.uid(), 'user'::app_role)
    AND gebietsleiter_id = auth.uid()
  );
