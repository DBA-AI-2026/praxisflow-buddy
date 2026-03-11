
-- ============================================================
-- Fix: Regional Lead sieht nur Daten der zugeordneten Team-Mitglieder
-- Basis: user_regional_assignments (regional_lead_id → user_id)
-- ============================================================

-- Helper: Hilfsfunktion, ob ein User dem Regional Lead zugeordnet ist
CREATE OR REPLACE FUNCTION public.is_in_regional_lead_team(_regional_lead_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_regional_assignments
    WHERE regional_lead_id = _regional_lead_id
      AND user_id = _user_id
  )
$$;

-- ============================================================
-- CONTRACTS: Regional Lead sieht nur Verträge seiner Team-Mitglieder
-- ============================================================
DROP POLICY IF EXISTS "Gebietsleiter can view own contracts" ON public.contracts;

CREATE POLICY "Gebietsleiter can view own contracts"
ON public.contracts FOR SELECT
USING (
  -- Gebietsleiter (user) sehen nur eigene Verträge
  (has_role(auth.uid(), 'user'::app_role) AND (sales_partner_id = auth.uid() OR created_by = auth.uid()))
  OR
  -- Regional Lead sieht Verträge seiner Teammitglieder
  (has_role(auth.uid(), 'regional_lead'::app_role) AND (
    is_in_regional_lead_team(auth.uid(), sales_partner_id)
    OR is_in_regional_lead_team(auth.uid(), created_by)
  ))
);

-- ============================================================
-- PRAXEN: Regional Lead sieht nur Kunden seiner Teammitglieder
-- ============================================================
DROP POLICY IF EXISTS "Gebietsleiter can view own praxen" ON public.praxen;

CREATE POLICY "Gebietsleiter can view own praxen"
ON public.praxen FOR SELECT
USING (
  -- Gebietsleiter sehen nur Kunden mit eigenem Vertrag
  (has_role(auth.uid(), 'user'::app_role) AND id IN (
    SELECT customer_id FROM public.contracts
    WHERE (sales_partner_id = auth.uid() OR created_by = auth.uid())
      AND customer_id IS NOT NULL
  ))
  OR
  -- Regional Lead sieht Kunden, die Teammitglieder als Vertragspartner haben
  (has_role(auth.uid(), 'regional_lead'::app_role) AND id IN (
    SELECT c.customer_id FROM public.contracts c
    WHERE (
      is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
      OR is_in_regional_lead_team(auth.uid(), c.created_by)
    )
    AND c.customer_id IS NOT NULL
  ))
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- ============================================================
-- LEADS: Regional Lead sieht nur Interessenten seiner Teammitglieder
-- ============================================================
DROP POLICY IF EXISTS "Sales roles can view leads" ON public.leads;

CREATE POLICY "Sales roles can view leads"
ON public.leads FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND is_in_regional_lead_team(auth.uid(), assigned_to)
  )
);

-- ============================================================
-- CUSTOMER_REVENUES: Regional Lead sieht nur Umsätze seiner Teammitglieder
-- ============================================================
DROP POLICY IF EXISTS "Admins and sales leads can view all revenues" ON public.customer_revenues;

CREATE POLICY "Admins and sales leads can view all revenues"
ON public.customer_revenues FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'user'::app_role)
  OR (auth.uid() = user_id)
  OR (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND is_in_regional_lead_team(auth.uid(), user_id)
  )
);

-- ============================================================
-- DEMO_DOWNLOADS: Regional Lead sieht nur Downloads seiner Teammitglieder
-- ============================================================
DROP POLICY IF EXISTS "Admins and leads can manage demo downloads" ON public.demo_downloads;
DROP POLICY IF EXISTS "Gebietsleiter can view demo downloads" ON public.demo_downloads;

-- Neue getrennte SELECT-Policy für Regional Lead (nur Team)
CREATE POLICY "Regional lead can view team demo downloads"
ON public.demo_downloads FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'user'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND is_in_regional_lead_team(auth.uid(), created_by)
  )
);

-- Schreib-Rechte (INSERT/UPDATE/DELETE) nur für Admin und Sales Lead
CREATE POLICY "Admins and sales leads can manage demo downloads"
ON public.demo_downloads FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
);

-- Sales Partner INSERT (eigene Einträge)
DROP POLICY IF EXISTS "Sales partners can create demo downloads" ON public.demo_downloads;
CREATE POLICY "Sales partners can create demo downloads"
ON public.demo_downloads FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'sales_partner'::app_role) AND auth.uid() = created_by
);
