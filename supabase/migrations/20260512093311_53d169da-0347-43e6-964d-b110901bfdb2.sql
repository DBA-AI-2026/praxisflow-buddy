-- Erweitert Schreibrechte auf contract_provider_status für Vertriebsrollen.
-- Vorhandene Policies bleiben unverändert. Admin-Schreibrecht über
-- "Admins manage cps" (FOR ALL) bleibt bestehen.

-- 1) View-Policy für Gebietsleiter (user) — eigene Verträge
DROP POLICY IF EXISTS "Users view own cps" ON public.contract_provider_status;
CREATE POLICY "Users view own cps"
  ON public.contract_provider_status
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'user')
    AND contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
    )
  );

-- 2) Schreib-Policy (INSERT) für Vertriebsrollen
DROP POLICY IF EXISTS "Sales roles mark cps ready" ON public.contract_provider_status;
CREATE POLICY "Sales roles mark cps ready"
  ON public.contract_provider_status
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'sales_lead')
    OR (
      public.has_role(auth.uid(), 'regional_lead')
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE public.is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
           OR public.is_in_regional_lead_team(auth.uid(), c.created_by)
      )
    )
    OR (
      (public.has_role(auth.uid(), 'sales_partner') OR public.has_role(auth.uid(), 'user'))
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
      )
    )
  );

-- 3) Schreib-Policy (UPDATE) für Vertriebsrollen
DROP POLICY IF EXISTS "Sales roles update cps" ON public.contract_provider_status;
CREATE POLICY "Sales roles update cps"
  ON public.contract_provider_status
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_lead')
    OR (
      public.has_role(auth.uid(), 'regional_lead')
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE public.is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
           OR public.is_in_regional_lead_team(auth.uid(), c.created_by)
      )
    )
    OR (
      (public.has_role(auth.uid(), 'sales_partner') OR public.has_role(auth.uid(), 'user'))
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'sales_lead')
    OR (
      public.has_role(auth.uid(), 'regional_lead')
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE public.is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
           OR public.is_in_regional_lead_team(auth.uid(), c.created_by)
      )
    )
    OR (
      (public.has_role(auth.uid(), 'sales_partner') OR public.has_role(auth.uid(), 'user'))
      AND contract_id IN (
        SELECT c.id FROM public.contracts c
        WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
      )
    )
  );