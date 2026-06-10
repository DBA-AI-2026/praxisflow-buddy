-- contracts-SELECT-RLS: sales_partner auf eigene Verträge beschränken
-- Ziel: PII-Schutz (IBAN, Signatur, MP-Nummer) — Vertriebspartner sollen nicht fremde Verträge lesen können.
-- Datum: 2026-06-10
-- Anforderung: admin/sales_lead/regional_lead/user weiterhin alle Verträge; sales_partner nur eigene.

-- 1) Alte weitläufige sales_partner-Policy entfernen
DROP POLICY IF EXISTS "Sales roles and admins can view contracts" ON public.contracts;

-- 2) Neue, verengte Policy für Vertriebspartner
CREATE POLICY "Sales partners view own contracts"
  ON public.contracts FOR SELECT
  USING (
    has_role(auth.uid(), 'sales_partner'::app_role)
    AND (sales_partner_id = auth.uid() OR created_by = auth.uid())
  );

-- 3) Admin und Leads weiterhin alles sehen (explizit, falls zuvor in einer kombinierten Policy abgedeckt)
DROP POLICY IF EXISTS "Admin and leads view all contracts" ON public.contracts;
CREATE POLICY "Admin and leads view all contracts"
  ON public.contracts FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'regional_lead'::app_role)
    OR has_role(auth.uid(), 'user'::app_role)
  );