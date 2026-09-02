-- =====================================================================
-- 2026-09-02 · PLZ-Neuzuordnung bestehender Leads — Phase 1 (DB only)
-- ---------------------------------------------------------------------
-- Kontext: Änderungen in plz_gebietsleiter_mapping wirkten bisher nur auf
-- neue Leads (BEFORE-INSERT-Trigger). Diese Migration liefert eine
-- kontrollierte, rückwirkende Neuzuordnung: Vorschau (admin+sales_lead)
-- und Apply (nur admin), beides über EINE gemeinsame Kandidatenlogik.
--
-- Entscheidungen (freigegeben):
--  * Status-WHITELIST ('neu','kontaktiert','qualifiziert'). 'vertrag' ist
--    bewusst ausgeschlossen (Provisions-Attribution steht unmittelbar bevor).
--    Zukünftige Status (z. B. 'dublette') sind damit automatisch außen vor.
--  * Kanon assignment_source = 'plz_auto' (DB-Trigger-Referenz). Die
--    capture-lead-Schreibweise 'auto_plz' bleibt unangetastet; tolerante
--    IN-Liste fängt beide. Kein Massen-Update historischer Werte.
--  * Nur Kandidaten, bei denen resolve_plz_ad() einen AD liefert und dieser
--    vom aktuellen assigned_to abweicht. no_match/no_plz führt NICHT zu
--    einer Ent-Zuordnung.
--  * Keine Mails (notify-lead-assignment bleibt dem Einzeldialog vorbehalten).
--
-- Named, not touched: ReassignLeadAdDialog loggt nicht ins
-- plz_assignment_log · Trigger auto_assign_lead_from_plz loggt nicht ·
-- plz_assignment_log INSERT-Policy WITH CHECK (true) ist unnötig breit ·
-- tipp_leads (eigenes System) · Harmonisierung capture-lead → 'plz_auto'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Interne Kandidatenlogik — SSOT für Preview und Apply. Kein Grant.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._plz_reassignment_candidates()
RETURNS TABLE (
  lead_id             uuid,
  hfx_customer_number text,
  praxis_name         text,
  plz                 text,
  alter_ad_id         uuid,
  alter_ad_name       text,
  neuer_ad_id         uuid,
  neuer_ad_name       text,
  matched_rule        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id                      AS lead_id,
    l.hfx_customer_number,
    l.praxis_name,
    l.plz,
    l.assigned_to             AS alter_ad_id,
    p_old.full_name           AS alter_ad_name,
    r.gebietsleiter_id        AS neuer_ad_id,
    r.gebietsleiter_name      AS neuer_ad_name,
    r.matched_rule
  FROM public.leads l
  CROSS JOIN LATERAL public.resolve_plz_ad(l.plz) r
  LEFT JOIN public.profiles p_old ON p_old.user_id = l.assigned_to
  WHERE
    -- Whitelist offener Status (neue Status automatisch ausgeschlossen)
    l.status IN ('neu', 'kontaktiert', 'qualifiziert')
    -- Niemals manuell zugeordnete Leads
    AND COALESCE(l.assignment_source, '') <> 'manual'
    -- Nur automatisch / unzugeordnete Leads (tolerante Schreibweisen)
    AND (
      l.assigned_to IS NULL
      OR l.assignment_source IN ('plz_auto', 'auto_plz', 'auto_plz_backfill', 'none', 'unassigned')
    )
    -- Testdaten ausschließen
    AND COALESCE(l.hfx_customer_number, '') NOT ILIKE 'HFX-I01070%'
    AND COALESCE(l.hfx_customer_number, '') NOT ILIKE 'TEST-HARNESS%'
    AND COALESCE(l.praxis_name, '')         NOT ILIKE 'TEST-HARNESS%'
    -- Nur echte Änderungen mit aufgelöstem AD
    AND r.gebietsleiter_id IS NOT NULL
    AND r.gebietsleiter_id IS DISTINCT FROM l.assigned_to
  ORDER BY l.plz, l.created_at;
$$;

REVOKE ALL ON FUNCTION public._plz_reassignment_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._plz_reassignment_candidates() FROM anon;
REVOKE ALL ON FUNCTION public._plz_reassignment_candidates() FROM authenticated;

-- ---------------------------------------------------------------------
-- 2) Vorschau — admin + sales_lead, nur lesen
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_plz_reassignment()
RETURNS TABLE (
  lead_id             uuid,
  hfx_customer_number text,
  praxis_name         text,
  plz                 text,
  alter_ad_id         uuid,
  alter_ad_name       text,
  neuer_ad_id         uuid,
  neuer_ad_name       text,
  matched_rule        text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_lead'::app_role)
  ) THEN
    RAISE EXCEPTION 'Nicht berechtigt: preview_plz_reassignment erfordert admin oder sales_lead'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public._plz_reassignment_candidates();
END;
$$;

REVOKE ALL ON FUNCTION public.preview_plz_reassignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_plz_reassignment() FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_plz_reassignment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_plz_reassignment() TO service_role;

-- ---------------------------------------------------------------------
-- 3) Apply — nur admin. Führt exakt die Kandidaten aus und loggt.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_plz_reassignment()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Nicht berechtigt: apply_plz_reassignment erfordert admin'
      USING ERRCODE = '42501';
  END IF;

  -- Kandidaten einmalig einfrieren, damit Update und Log denselben Stand nutzen
  CREATE TEMP TABLE _plz_reassign_batch ON COMMIT DROP AS
    SELECT * FROM public._plz_reassignment_candidates();

  -- Protokoll (vor dem Update, damit auch bei späterem Fehler alles in einer TX bleibt)
  INSERT INTO public.plz_assignment_log (
    entity_type, entity_id, plz,
    resolved_gebietsleiter_id, resolved_gebietsleiter_name,
    assignment_source, matched_rule, changed_by
  )
  SELECT
    'lead', b.lead_id, b.plz,
    b.neuer_ad_id, b.neuer_ad_name,
    'plz_auto', b.matched_rule, v_actor
  FROM _plz_reassign_batch b;

  -- Umhängen
  UPDATE public.leads l
  SET
    assigned_to       = b.neuer_ad_id,
    assignment_source = 'plz_auto',
    updated_at        = now()
  FROM _plz_reassign_batch b
  WHERE l.id = b.lead_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_plz_reassignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_plz_reassignment() FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_plz_reassignment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plz_reassignment() TO service_role;

COMMENT ON FUNCTION public._plz_reassignment_candidates() IS
  'Interne SSOT-Kandidatenlogik für PLZ-Neuzuordnung von Leads (kein direkter Aufruf).';
COMMENT ON FUNCTION public.preview_plz_reassignment() IS
  'Vorschau PLZ-Neuzuordnung offener, auto-zugeordneter Leads. admin + sales_lead.';
COMMENT ON FUNCTION public.apply_plz_reassignment() IS
  'Führt PLZ-Neuzuordnung aus (assigned_to, assignment_source=plz_auto) und loggt in plz_assignment_log. Nur admin.';