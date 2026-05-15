-- Tipp-Leads: Zugriff für 'user' (nur eigene zugeordnete Tippgeber) + UPDATE für regional_lead

-- 1) SELECT-Policy für 'user': sieht Tipps seiner zugeordneten Tippgeber
CREATE POLICY "Users view tips from assigned tippgeber"
  ON public.tipp_leads FOR SELECT
  USING (
    has_role(auth.uid(), 'user'::app_role)
    AND created_by IN (
      SELECT tippgeber_user_id
      FROM public.tippgeber_partner_assignments
      WHERE partner_user_id = auth.uid()
        AND is_active = true
    )
  );

-- 2) Bestehende UPDATE-Policy ersetzen, um regional_lead aufzunehmen
DROP POLICY IF EXISTS "Admins can update tips" ON public.tipp_leads;
CREATE POLICY "Admins sales_lead regional_lead update tips"
  ON public.tipp_leads FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'regional_lead'::app_role)
  );

-- 3) UPDATE-Policy für 'user' (nur zugeordnete Tipps)
CREATE POLICY "Users update tips from assigned tippgeber"
  ON public.tipp_leads FOR UPDATE
  USING (
    has_role(auth.uid(), 'user'::app_role)
    AND created_by IN (
      SELECT tippgeber_user_id
      FROM public.tippgeber_partner_assignments
      WHERE partner_user_id = auth.uid()
        AND is_active = true
    )
  );