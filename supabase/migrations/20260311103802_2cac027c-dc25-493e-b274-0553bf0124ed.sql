
-- Fix: Contracts - Gebietsleiter sehen nur ihre eigenen Verträge
DROP POLICY IF EXISTS "Gebietsleiter can view contracts" ON public.contracts;

CREATE POLICY "Gebietsleiter can view own contracts"
ON public.contracts FOR SELECT
USING (
  (has_role(auth.uid(), 'user'::app_role) AND (sales_partner_id = auth.uid() OR created_by = auth.uid()))
  OR
  has_role(auth.uid(), 'regional_lead'::app_role)
);

-- Fix: Praxen - Gebietsleiter sehen nur Kunden, zu denen sie Verträge haben
DROP POLICY IF EXISTS "Gebietsleiter can view praxen" ON public.praxen;

CREATE POLICY "Gebietsleiter can view own praxen"
ON public.praxen FOR SELECT
USING (
  (has_role(auth.uid(), 'user'::app_role) AND id IN (
    SELECT customer_id FROM public.contracts
    WHERE (sales_partner_id = auth.uid() OR created_by = auth.uid())
      AND customer_id IS NOT NULL
  ))
  OR has_role(auth.uid(), 'regional_lead'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);
