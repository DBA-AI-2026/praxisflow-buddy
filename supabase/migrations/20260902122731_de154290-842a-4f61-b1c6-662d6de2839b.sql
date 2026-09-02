-- ============================================================================
-- 2026-09-02 · RLS-Verengung demo_downloads (Security-Finding, PII)
--
-- Grund: Vertriebspartner (sales_partner) konnten bislang ALLE Demo-Downloads
-- einsehen – inkl. personenbezogener Daten fremder Kunden (Security-Finding).
--
-- Änderungen:
-- 1) "Sales partners can view demo downloads": Owner-Scope (nur eigene Zeilen,
--    created_by = auth.uid()). INSERT-Policy verlangt das ohnehin schon.
-- 2) "Regional lead can view team demo downloads": sales_partner-OR-Zweig
--    entfernt (war Vollsicht und hätte den Fix ausgehebelt).
--
-- Bewusst UNVERÄNDERT belassen: has_role(...,'user')-Vollsicht in der
-- Regional-Lead-Policy. Interne Gebietsleiter sehen im gesamten System alle
-- Leads und Verträge; demo_downloads enger zu fassen als contracts wäre
-- inkonsistent. Freigegebene Entscheidung vom 2026-09-02.
-- ============================================================================

DROP POLICY "Sales partners can view demo downloads" ON public.demo_downloads;
CREATE POLICY "Sales partners can view demo downloads"
ON public.demo_downloads FOR SELECT
USING (has_role(auth.uid(), 'sales_partner'::app_role) AND created_by = auth.uid());

DROP POLICY "Regional lead can view team demo downloads" ON public.demo_downloads;
CREATE POLICY "Regional lead can view team demo downloads"
ON public.demo_downloads FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'user'::app_role)
  OR (has_role(auth.uid(), 'regional_lead'::app_role) AND is_in_regional_lead_team(auth.uid(), created_by))
);