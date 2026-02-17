
-- =============================================
-- 1. CONTRACTS: Restrict SELECT + INSERT to sales roles & admins
-- =============================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated users can create contracts" ON public.contracts;

-- SELECT: only admin, sales_partner, sales_lead can view
CREATE POLICY "Sales roles and admins can view contracts"
  ON public.contracts FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_partner'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
  );

-- INSERT: only admin, sales_partner, sales_lead can create
CREATE POLICY "Sales roles and admins can create contracts"
  ON public.contracts FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_partner'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role))
    AND auth.uid() = created_by
  );

-- =============================================
-- 2. PRAXIS_RESERVATIONS: Replace USING(true) with role-based SELECT
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can view reservations" ON public.praxis_reservations;

CREATE POLICY "Sales roles and admins can view reservations"
  ON public.praxis_reservations FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_partner'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
  );

-- =============================================
-- 3. SIGNATURE_AUDIT_LOGS: Restrict to admin + contract owner
-- =============================================

DROP POLICY IF EXISTS "Users can view signature logs for their contracts" ON public.signature_audit_logs;

CREATE POLICY "Admins and contract owners can view signature logs"
  ON public.signature_audit_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (contract_id IN (SELECT id FROM public.contracts WHERE created_by = auth.uid()))
  );

-- =============================================
-- 4. PROFILES: Remove temp_password column (security risk)
-- =============================================

ALTER TABLE public.profiles DROP COLUMN IF EXISTS temp_password;

-- =============================================
-- 5. CUSTOMER_REVENUES: Allow sales_lead to also view revenues
-- =============================================

-- Add sales_lead access to revenues (they need operational overview)
DROP POLICY IF EXISTS "Admins can view all revenues" ON public.customer_revenues;

CREATE POLICY "Admins and sales leads can view all revenues"
  ON public.customer_revenues FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR auth.uid() = user_id
  );

-- Drop the old user-specific SELECT policy since it's now merged above
DROP POLICY IF EXISTS "Users can view their own revenues" ON public.customer_revenues;
