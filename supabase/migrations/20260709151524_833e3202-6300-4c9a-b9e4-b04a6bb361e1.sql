-- Alte, zu weit gefasste Policy entfernen (regional_lead sah systemweit alles).
DROP POLICY "Sales leads can view commission_payouts" ON public.commission_payouts;

-- a) Vertriebsleitung: sieht alle Provisionen (bewusst)
CREATE POLICY "Sales leads can view all commission_payouts"
ON public.commission_payouts
FOR SELECT
USING (has_role(auth.uid(), 'sales_lead'::app_role));

-- b) Regionalleitung: eigene + Team + eigene Tippgeber + Tippgeber des Teams
CREATE POLICY "Regional leads can view team commission_payouts"
ON public.commission_payouts
FOR SELECT
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND (
    sales_partner_id = auth.uid()
    OR public.is_in_regional_lead_team(auth.uid(), sales_partner_id)
    OR public.is_tippgeber_of(auth.uid(), sales_partner_id)
    OR EXISTS (
      SELECT 1
      FROM public.tippgeber_partner_assignments tpa
      WHERE tpa.tippgeber_user_id = commission_payouts.sales_partner_id
        AND tpa.is_active = true
        AND public.is_in_regional_lead_team(auth.uid(), tpa.partner_user_id)
    )
  )
);

-- c) Rolle 'user' (Gebietsleiter/AD): eigene + eigene Tippgeber.
-- HINWEIS: Die bestehende Policy "Sales partners can view own payouts" prüft
-- keine Rolle und deckt den Eigene-Zeilen-Zweig (sales_partner_id = auth.uid())
-- bereits für JEDEN Auth-User ab. Sie bleibt bewusst unangetastet als
-- Sicherheitsanker für sales_partner. Folge: der Eigene-Zeilen-Zweig dieser
-- Policy ist real redundant; wirksam wirkt sie nur über den Tippgeber-Zweig.
-- Das ist so akzeptiert und dokumentiert.
CREATE POLICY "Users can view own and tippgeber commission_payouts"
ON public.commission_payouts
FOR SELECT
USING (
  has_role(auth.uid(), 'user'::app_role)
  AND (
    sales_partner_id = auth.uid()
    OR public.is_tippgeber_of(auth.uid(), sales_partner_id)
  )
);