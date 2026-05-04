-- Lead-Sichtbarkeit reparieren

-- 1) Trigger-Funktion: Auto-Zuweisung bei INSERT, wenn assigned_to leer und PLZ vorhanden
CREATE OR REPLACE FUNCTION public.auto_assign_lead_from_plz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gl_id   uuid;
  v_gl_name text;
  v_rule    text;
BEGIN
  IF NEW.assigned_to IS NULL AND NEW.plz IS NOT NULL AND length(trim(NEW.plz)) > 0 THEN
    SELECT r.gebietsleiter_id, r.gebietsleiter_name, r.matched_rule
      INTO v_gl_id, v_gl_name, v_rule
      FROM public.resolve_plz_ad(NEW.plz) r
      LIMIT 1;

    IF v_gl_id IS NOT NULL THEN
      NEW.assigned_to       := v_gl_id;
      NEW.assignment_source := 'plz_auto';
    ELSE
      NEW.assignment_source := COALESCE(NEW.assignment_source, 'unassigned');
    END IF;
  ELSIF NEW.assigned_to IS NULL THEN
    NEW.assignment_source := COALESCE(NEW.assignment_source, 'unassigned');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_lead_from_plz ON public.leads;
CREATE TRIGGER trg_auto_assign_lead_from_plz
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_lead_from_plz();

-- 2) Backfill: 8 bestehende Leads ohne assigned_to
DO $$
DECLARE
  l record;
  v_gl_id   uuid;
  v_gl_name text;
  v_assigned int := 0;
  v_unassigned int := 0;
BEGIN
  FOR l IN
    SELECT id, plz FROM public.leads WHERE assigned_to IS NULL
  LOOP
    v_gl_id := NULL;
    IF l.plz IS NOT NULL AND length(trim(l.plz)) > 0 THEN
      SELECT r.gebietsleiter_id, r.gebietsleiter_name
        INTO v_gl_id, v_gl_name
        FROM public.resolve_plz_ad(l.plz) r
        LIMIT 1;
    END IF;

    IF v_gl_id IS NOT NULL THEN
      UPDATE public.leads
         SET assigned_to       = v_gl_id,
             assignment_source = 'auto_plz_backfill',
             updated_at        = now()
       WHERE id = l.id;
      v_assigned := v_assigned + 1;
    ELSE
      UPDATE public.leads
         SET assignment_source = 'unassigned',
             updated_at        = now()
       WHERE id = l.id;
      v_unassigned := v_unassigned + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Lead-Backfill: % zugewiesen, % bleiben unzugewiesen', v_assigned, v_unassigned;
END $$;

-- 3) RLS: Sales Partner sehen Pool inkl. unzugewiesener Leads
DROP POLICY IF EXISTS "Sales roles can view leads" ON public.leads;
CREATE POLICY "Sales roles can view leads"
ON public.leads FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'sales_partner'::app_role)
  OR (has_role(auth.uid(), 'regional_lead'::app_role) AND (assigned_to IS NULL OR is_in_regional_lead_team(auth.uid(), assigned_to)))
);