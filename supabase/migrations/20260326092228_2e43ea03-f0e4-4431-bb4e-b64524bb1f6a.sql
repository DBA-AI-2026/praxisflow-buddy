
-- ============================================================
-- Migration: sales_lead commission write access
-- Umsetzung der Regel: admin + sales_lead dürfen Provisionssätze bearbeiten
-- ============================================================

-- ─── 1. product_commissions ─────────────────────────────────
-- sales_lead: INSERT + UPDATE erlaubt; DELETE bleibt admin-only (systemkritische Grundregel)

CREATE POLICY "Sales leads can insert product commissions"
ON public.product_commissions
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

CREATE POLICY "Sales leads can update product commissions"
ON public.product_commissions
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role))
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

-- ─── 2. commission_role_defaults ────────────────────────────
-- sales_lead: volle CRUD (Rollen-Standards konfigurieren)

CREATE POLICY "Sales leads can insert commission role defaults"
ON public.commission_role_defaults
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

CREATE POLICY "Sales leads can update commission role defaults"
ON public.commission_role_defaults
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role))
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

CREATE POLICY "Sales leads can delete commission role defaults"
ON public.commission_role_defaults
FOR DELETE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role));

-- ─── 3. partner_commission_overrides ────────────────────────
-- sales_lead: volle CRUD (individuelle Partner-Overrides verwalten)

CREATE POLICY "Sales leads can insert partner commission overrides"
ON public.partner_commission_overrides
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

CREATE POLICY "Sales leads can update partner commission overrides"
ON public.partner_commission_overrides
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role))
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));

CREATE POLICY "Sales leads can delete partner commission overrides"
ON public.partner_commission_overrides
FOR DELETE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role));

-- ─── 4. commission_payouts ──────────────────────────────────
-- sales_lead: UPDATE erlaubt (Freigabe + als bezahlt markieren)
-- INSERT + DELETE bleiben admin-only (finanzrelevante Buchungen)

CREATE POLICY "Sales leads can update commission payouts"
ON public.commission_payouts
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'sales_lead'::app_role))
WITH CHECK (has_role(auth.uid(), 'sales_lead'::app_role));
