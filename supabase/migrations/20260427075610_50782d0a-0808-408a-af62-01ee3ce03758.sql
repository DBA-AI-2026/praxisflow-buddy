-- Drop old, too-broad policies
DROP POLICY IF EXISTS "Gebietsleiter can view reservations" ON public.praxis_reservations;
DROP POLICY IF EXISTS "Sales roles and admins can view reservations" ON public.praxis_reservations;
DROP POLICY IF EXISTS "Users can update their own reservations" ON public.praxis_reservations;
DROP POLICY IF EXISTS "Sales partners and admins can create reservations" ON public.praxis_reservations;
DROP POLICY IF EXISTS "Admins can delete reservations" ON public.praxis_reservations;

-- =========================
-- SELECT policies
-- =========================

-- 1. Admins & Sales Leads see everything
CREATE POLICY "Admins and sales leads view all reservations"
ON public.praxis_reservations
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_lead'::app_role)
);

-- 2. Creator sees own reservations (any role)
CREATE POLICY "Creator views own reservations"
ON public.praxis_reservations
FOR SELECT
USING (reserved_by = auth.uid());

-- 3. Assigned AD sees assigned reservations
CREATE POLICY "Assigned AD views assigned reservations"
ON public.praxis_reservations
FOR SELECT
USING (assigned_ad_id = auth.uid());

-- 4. Regional Leads see only their team's reservations
CREATE POLICY "Regional leads view team reservations"
ON public.praxis_reservations
FOR SELECT
USING (
  public.has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    public.is_in_regional_lead_team(auth.uid(), reserved_by)
    OR public.is_in_regional_lead_team(auth.uid(), assigned_ad_id)
  )
);

-- =========================
-- INSERT policies
-- =========================

-- Authorized roles may create reservations; they must own the row (reserved_by = self) unless admin/sales_lead
CREATE POLICY "Authorized roles can create reservations"
ON public.praxis_reservations
FOR INSERT
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_lead'::app_role)
  )
  OR (
    (
      public.has_role(auth.uid(), 'sales_partner'::app_role)
      OR public.has_role(auth.uid(), 'user'::app_role)
      OR public.has_role(auth.uid(), 'regional_lead'::app_role)
    )
    AND reserved_by = auth.uid()
  )
);

-- =========================
-- UPDATE policies
-- =========================

-- Admins & Sales Leads always
CREATE POLICY "Admins and sales leads update reservations"
ON public.praxis_reservations
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_lead'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_lead'::app_role)
);

-- Creator updates own, only while not converted
CREATE POLICY "Creator updates own non-converted reservations"
ON public.praxis_reservations
FOR UPDATE
USING (
  reserved_by = auth.uid()
  AND COALESCE(status, 'reserviert') <> 'konvertiert'
)
WITH CHECK (
  reserved_by = auth.uid()
  AND COALESCE(status, 'reserviert') <> 'konvertiert'
);

-- Assigned AD updates assigned, only while not converted
CREATE POLICY "Assigned AD updates assigned non-converted reservations"
ON public.praxis_reservations
FOR UPDATE
USING (
  assigned_ad_id = auth.uid()
  AND COALESCE(status, 'reserviert') <> 'konvertiert'
)
WITH CHECK (
  assigned_ad_id = auth.uid()
  AND COALESCE(status, 'reserviert') <> 'konvertiert'
);

-- Regional Leads update within their team
CREATE POLICY "Regional leads update team reservations"
ON public.praxis_reservations
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    public.is_in_regional_lead_team(auth.uid(), reserved_by)
    OR public.is_in_regional_lead_team(auth.uid(), assigned_ad_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    public.is_in_regional_lead_team(auth.uid(), reserved_by)
    OR public.is_in_regional_lead_team(auth.uid(), assigned_ad_id)
  )
);

-- =========================
-- DELETE policies
-- =========================

CREATE POLICY "Only admins can delete reservations"
ON public.praxis_reservations
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));
