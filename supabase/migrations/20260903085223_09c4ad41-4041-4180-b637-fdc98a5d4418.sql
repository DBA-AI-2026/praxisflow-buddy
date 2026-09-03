-- 2026-09-03: Trigger-Logging fuer PLZ-Neuzuordnung (Auftrag 2)
-- Grund: auto_assign_lead_from_plz stempelt PLZ-Zuweisungen bei neuen Leads,
-- schrieb aber bisher keinen Audit-Trail in plz_assignment_log.
-- Zuweisungslogik byte-identisch uebernommen; nur Logging ergaenzt.
-- Das Log-INSERT ist exception-gekapselt und darf den Lead-INSERT nie scheitern lassen.
-- Geloggter assignment_source ist der FINALE Wert von NEW.assignment_source
-- (kann 'plz_auto', 'unassigned' oder den Spalten-Default 'none' enthalten).

CREATE OR REPLACE FUNCTION public.auto_assign_lead_from_plz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gl_id   uuid;
  v_gl_name text;
  v_rule    text;
  v_had_assignment boolean;
BEGIN
  v_had_assignment := NEW.assigned_to IS NOT NULL;

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

  -- Audit-Trail: nur wenn der Trigger selbst taetig wurde (assigned_to war leer).
  -- resolve_plz_ad liefert stets genau eine Zeile; im Kein-Treffer-Zweig steht
  -- v_rule auf 'no_match' bzw. 'no_plz'. Im ELSIF-Zweig (Resolver laeuft nie)
  -- faellt COALESCE auf die Konstante 'no_plz'.
  IF NOT v_had_assignment THEN
    BEGIN
      INSERT INTO public.plz_assignment_log (
        entity_type, entity_id, plz,
        resolved_gebietsleiter_id, resolved_gebietsleiter_name,
        assignment_source, matched_rule, changed_by
      ) VALUES (
        'lead', NEW.id, NEW.plz,
        v_gl_id, v_gl_name,
        NEW.assignment_source, COALESCE(v_rule, 'no_plz'), NULL
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Logging darf den Lead-INSERT niemals scheitern lassen
    END;
  END IF;

  RETURN NEW;
END;
$function$