
-- PLZ-GEBIETS-ZUORDNUNG: Zentrale Logik
-- Ziel: Stabiler, eindeutiger Business-Rule-Layer für AD-Zuordnung via PLZ

-- 1. Erweitere plz_gebietsleiter_mapping um optionale Range-Felder
ALTER TABLE public.plz_gebietsleiter_mapping
  ADD COLUMN IF NOT EXISTS plz_von text,
  ADD COLUMN IF NOT EXISTS plz_bis text;

-- 2. assignment_source auf leads-Tabelle
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assignment_source text DEFAULT 'none';

UPDATE public.leads
  SET assignment_source = 'manual'
  WHERE assigned_to IS NOT NULL AND (assignment_source = 'none' OR assignment_source IS NULL);

-- 3. assignment_source auf tipp_leads
ALTER TABLE public.tipp_leads
  ADD COLUMN IF NOT EXISTS assignment_source text DEFAULT 'none';

UPDATE public.tipp_leads
  SET assignment_source = 'manual'
  WHERE ad_email IS NOT NULL AND (assignment_source = 'none' OR assignment_source IS NULL);

-- 4. Zentrales Änderungs-Log für PLZ-Zuordnungen
CREATE TABLE IF NOT EXISTS public.plz_assignment_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  plz text,
  resolved_gebietsleiter_id uuid,
  resolved_gebietsleiter_name text,
  assignment_source text NOT NULL,
  matched_rule text,
  changed_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.plz_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view assignment log"
  ON public.plz_assignment_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System insert assignment log"
  ON public.plz_assignment_log FOR INSERT
  WITH CHECK (true);

-- 5. Zentrale DB-Funktion: resolve_plz_ad
CREATE OR REPLACE FUNCTION public.resolve_plz_ad(plz_input text)
RETURNS TABLE(
  gebietsleiter_id uuid,
  gebietsleiter_name text,
  matched_rule text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plz text;
  v_prefix2 text;
  v_prefix1 text;
  v_gl_id uuid;
  v_gl_name text;
  v_rule text;
BEGIN
  v_plz := regexp_replace(plz_input, '[^0-9]', '', 'g');
  IF v_plz IS NULL OR length(v_plz) = 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'no_plz'::text;
    RETURN;
  END IF;

  v_prefix2 := left(v_plz, 2);
  v_prefix1 := left(v_plz, 1);

  -- a) Range-Match (plz_von/plz_bis gesetzt, höchste Priorität gewinnt)
  SELECT m.gebietsleiter_id, m.gebietsleiter_name,
         ('range:' || m.plz_von || '-' || m.plz_bis)
    INTO v_gl_id, v_gl_name, v_rule
    FROM public.plz_gebietsleiter_mapping m
   WHERE m.is_active = true
     AND m.plz_von IS NOT NULL
     AND m.plz_bis IS NOT NULL
     AND v_plz >= m.plz_von
     AND v_plz <= m.plz_bis
   ORDER BY m.priority DESC
   LIMIT 1;

  IF FOUND AND v_gl_id IS NOT NULL THEN
    RETURN QUERY SELECT v_gl_id, v_gl_name, v_rule;
    RETURN;
  END IF;

  -- b) 2-stelliger Prefix-Match
  SELECT m.gebietsleiter_id, m.gebietsleiter_name,
         ('prefix:' || m.plz_prefix)
    INTO v_gl_id, v_gl_name, v_rule
    FROM public.plz_gebietsleiter_mapping m
   WHERE m.is_active = true
     AND m.plz_von IS NULL
     AND m.plz_prefix = v_prefix2
   ORDER BY m.priority DESC
   LIMIT 1;

  IF FOUND AND v_gl_id IS NOT NULL THEN
    RETURN QUERY SELECT v_gl_id, v_gl_name, v_rule;
    RETURN;
  END IF;

  -- c) 1-stelliger Prefix-Match
  SELECT m.gebietsleiter_id, m.gebietsleiter_name,
         ('prefix:' || m.plz_prefix)
    INTO v_gl_id, v_gl_name, v_rule
    FROM public.plz_gebietsleiter_mapping m
   WHERE m.is_active = true
     AND m.plz_von IS NULL
     AND m.plz_prefix = v_prefix1
   ORDER BY m.priority DESC
   LIMIT 1;

  IF FOUND AND v_gl_id IS NOT NULL THEN
    RETURN QUERY SELECT v_gl_id, v_gl_name, v_rule;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, NULL::text, 'no_match'::text;
END;
$$;

-- 6. RLS auf plz_gebietsleiter_mapping sicherstellen
ALTER TABLE public.plz_gebietsleiter_mapping ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plz_gebietsleiter_mapping' AND policyname = 'Admins manage plz mappings'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins manage plz mappings" ON public.plz_gebietsleiter_mapping FOR ALL USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plz_gebietsleiter_mapping' AND policyname = 'Authenticated can read plz mappings'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated can read plz mappings" ON public.plz_gebietsleiter_mapping FOR SELECT USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;
