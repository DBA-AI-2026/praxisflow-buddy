-- Fix: Regional Leads sollen Pool-Leads (assigned_to IS NULL) NICHT mehr aus fremden Gebieten sehen.
-- Regression eingeführt am 04.05.2026 (Migration 20260504125905_..., Mahfouz-Offboarding).
-- Sales Lead und Admin behalten vollen Pool-Zugriff (sind in den anderen Klauseln abgedeckt).

-- Pre-Flight: aktuelle Policy als NOTICE loggen
DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual::text INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'leads'
     AND policyname = 'Sales roles can view leads';
  RAISE NOTICE 'BEFORE: Sales roles can view leads USING = %', COALESCE(v_qual, '<none>');
END $$;

DROP POLICY IF EXISTS "Sales roles can view leads" ON public.leads;

CREATE POLICY "Sales roles can view leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND assigned_to IS NOT NULL
    AND is_in_regional_lead_team(auth.uid(), assigned_to)
  )
);

-- Verifikation
DO $$
DECLARE
  v_qual text;
  v_has_null_clause boolean;
  v_has_notnull_clause boolean;
  v_has_team_fn boolean;
BEGIN
  SELECT qual::text INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'leads'
     AND policyname = 'Sales roles can view leads';

  v_has_null_clause    := v_qual ILIKE '%assigned_to IS NULL%';
  v_has_notnull_clause := v_qual ILIKE '%assigned_to IS NOT NULL%';
  v_has_team_fn        := v_qual ILIKE '%is_in_regional_lead_team%';

  RAISE NOTICE 'AFTER: Sales roles can view leads USING = %', v_qual;
  RAISE NOTICE 'Verifikation: has IS NULL = % (erwartet: false), has IS NOT NULL = % (erwartet: true), has is_in_regional_lead_team = % (erwartet: true)',
    v_has_null_clause, v_has_notnull_clause, v_has_team_fn;

  IF v_has_null_clause THEN
    RAISE EXCEPTION 'Migration fehlgeschlagen: assigned_to IS NULL ist noch in der Policy enthalten.';
  END IF;
  IF NOT v_has_notnull_clause THEN
    RAISE EXCEPTION 'Migration fehlgeschlagen: assigned_to IS NOT NULL fehlt in der Policy.';
  END IF;
  IF NOT v_has_team_fn THEN
    RAISE EXCEPTION 'Migration fehlgeschlagen: is_in_regional_lead_team() fehlt in der Policy.';
  END IF;
END $$;