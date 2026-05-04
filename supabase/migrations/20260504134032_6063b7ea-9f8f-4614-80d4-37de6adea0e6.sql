-- Migration: offboard_mahfouz_to_clement
-- Off-Boarding Amir Mahfouz (gekündigt) → Michael Clement (sales_lead)
-- Datum: 2026-05-04

BEGIN;

CREATE TEMP TABLE _offboard_map (
  context   text PRIMARY KEY,
  user_id   uuid NOT NULL UNIQUE,
  email     text NOT NULL,
  full_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _offboard_map (context, user_id, email, full_name) VALUES
  ('mahfouz', '8894ba03-7d89-4157-ba73-6bedefa95fdc', 'mahfouz@carecapital.de', 'Amir Mahfouz'),
  ('clement', '2a9ffe78-b997-461b-9302-7fa5b3073b5d', 'clement@carecapital.de', 'Michael Clement');

DO $$
DECLARE
  v_mahfouz_id uuid;
  v_clement_id uuid;
  v_exists_mahfouz boolean;
  v_exists_clement boolean;
  v_clement_lead_active boolean;
  v_leads_active int;
  v_plz_count int;
  v_contracts_sp int;
  v_contracts_cb int;
BEGIN
  SELECT user_id INTO v_mahfouz_id FROM _offboard_map WHERE context = 'mahfouz';
  SELECT user_id INTO v_clement_id FROM _offboard_map WHERE context = 'clement';

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_mahfouz_id) INTO v_exists_mahfouz;
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_clement_id) INTO v_exists_clement;

  IF NOT v_exists_mahfouz THEN
    RAISE EXCEPTION 'Pre-Flight FAILED: Mahfouz user_id % nicht in auth.users', v_mahfouz_id;
  END IF;
  IF NOT v_exists_clement THEN
    RAISE EXCEPTION 'Pre-Flight FAILED: Clement user_id % nicht in auth.users', v_clement_id;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_clement_id AND role = 'sales_lead' AND is_active = true
  ) INTO v_clement_lead_active;

  IF NOT v_clement_lead_active THEN
    RAISE EXCEPTION 'Pre-Flight FAILED: Clement hat keine aktive sales_lead-Rolle';
  END IF;

  SELECT COUNT(*) INTO v_leads_active FROM public.leads WHERE assigned_to = v_mahfouz_id AND status <> 'kunde';
  SELECT COUNT(*) INTO v_plz_count FROM public.plz_gebietsleiter_mapping WHERE gebietsleiter_id = v_mahfouz_id;
  SELECT COUNT(*) INTO v_contracts_sp FROM public.contracts WHERE sales_partner_id = v_mahfouz_id;
  SELECT COUNT(*) INTO v_contracts_cb FROM public.contracts WHERE created_by = v_mahfouz_id;

  RAISE NOTICE '--- PRE-FLIGHT (Bestand auf Mahfouz) ---';
  RAISE NOTICE '  aktive Leads:            %', v_leads_active;
  RAISE NOTICE '  PLZ-Mappings:            %', v_plz_count;
  RAISE NOTICE '  Verträge sales_partner:  %', v_contracts_sp;
  RAISE NOTICE '  Verträge created_by:     %', v_contracts_cb;
END $$;

UPDATE public.leads
SET assigned_to = NULL, assignment_source = 'unassigned', updated_at = now()
WHERE assigned_to = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz')
  AND status <> 'kunde';

UPDATE public.leads
SET tippgeber_id = NULL, updated_at = now()
WHERE tippgeber_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz');

UPDATE public.plz_gebietsleiter_mapping
SET gebietsleiter_id = (SELECT user_id FROM _offboard_map WHERE context = 'clement'),
    gebietsleiter_name = (SELECT full_name FROM _offboard_map WHERE context = 'clement'),
    updated_at = now()
WHERE gebietsleiter_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz');

UPDATE public.contracts
SET sales_partner_id = (SELECT user_id FROM _offboard_map WHERE context = 'clement'),
    sales_partner_name = (SELECT full_name FROM _offboard_map WHERE context = 'clement'),
    updated_at = now()
WHERE sales_partner_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz');

UPDATE public.contracts
SET created_by = (SELECT user_id FROM _offboard_map WHERE context = 'clement'),
    updated_at = now()
WHERE created_by = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz');

UPDATE public.contracts
SET tippgeber_id = (SELECT user_id FROM _offboard_map WHERE context = 'clement'),
    updated_at = now()
WHERE tippgeber_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz');

UPDATE public.profiles
SET email = email || '+deactivated_2026-05-04@duplicate.local',
    full_name = COALESCE(full_name, '') || ' (gekündigt 2026-05-04)',
    updated_at = now()
WHERE user_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz')
  AND email NOT LIKE '%+deactivated_%@duplicate.local';

UPDATE public.user_roles
SET is_active = false
WHERE user_id = (SELECT user_id FROM _offboard_map WHERE context = 'mahfouz')
  AND is_active = true;

DO $$
DECLARE
  v_mahfouz_id uuid;
BEGIN
  SELECT user_id INTO v_mahfouz_id FROM _offboard_map WHERE context = 'mahfouz';
  UPDATE auth.users
  SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
  WHERE id = v_mahfouz_id
    AND (banned_until IS NULL OR banned_until < '2099-01-01'::timestamptz);
  RAISE NOTICE 'auth.users: Mahfouz-ID gebannt bis 2099-12-31';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'auth.users konnte nicht beschrieben werden. Bitte manuell nachholen.';
WHEN OTHERS THEN
  RAISE NOTICE 'auth.users-Update fehlgeschlagen (%). Bitte manuell nachholen.', SQLERRM;
END $$;

DO $$
DECLARE
  v_mahfouz_id uuid;
  v_leads_remaining int;
  v_plz_remaining int;
  v_contracts_sp_remaining int;
  v_contracts_cb_remaining int;
  v_contracts_tg_remaining int;
  v_role_active int;
  v_profile_deactivated boolean;
BEGIN
  SELECT user_id INTO v_mahfouz_id FROM _offboard_map WHERE context = 'mahfouz';

  SELECT COUNT(*) INTO v_leads_remaining FROM public.leads WHERE assigned_to = v_mahfouz_id AND status <> 'kunde';
  SELECT COUNT(*) INTO v_plz_remaining FROM public.plz_gebietsleiter_mapping WHERE gebietsleiter_id = v_mahfouz_id;
  SELECT COUNT(*) INTO v_contracts_sp_remaining FROM public.contracts WHERE sales_partner_id = v_mahfouz_id;
  SELECT COUNT(*) INTO v_contracts_cb_remaining FROM public.contracts WHERE created_by = v_mahfouz_id;
  SELECT COUNT(*) INTO v_contracts_tg_remaining FROM public.contracts WHERE tippgeber_id = v_mahfouz_id;
  SELECT COUNT(*) INTO v_role_active FROM public.user_roles WHERE user_id = v_mahfouz_id AND is_active = true;
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = v_mahfouz_id AND email LIKE '%+deactivated_%@duplicate.local') INTO v_profile_deactivated;

  RAISE NOTICE '--- VERIFIKATION ---';
  RAISE NOTICE '  aktive Leads auf Mahfouz:                % (Soll: 0)', v_leads_remaining;
  RAISE NOTICE '  PLZ-Mappings auf Mahfouz:                % (Soll: 0)', v_plz_remaining;
  RAISE NOTICE '  Verträge sales_partner_id auf Mahfouz:   % (Soll: 0)', v_contracts_sp_remaining;
  RAISE NOTICE '  Verträge created_by auf Mahfouz:         % (Soll: 0)', v_contracts_cb_remaining;
  RAISE NOTICE '  Verträge tippgeber_id auf Mahfouz:       % (Soll: 0)', v_contracts_tg_remaining;
  RAISE NOTICE '  aktive Rollen auf Mahfouz:               % (Soll: 0)', v_role_active;
  RAISE NOTICE '  Profil deaktiviert (Suffix vorhanden):   % (Soll: true)', v_profile_deactivated;

  IF v_leads_remaining > 0 OR v_plz_remaining > 0 OR v_contracts_sp_remaining > 0
     OR v_contracts_cb_remaining > 0 OR v_contracts_tg_remaining > 0
     OR v_role_active > 0 OR NOT v_profile_deactivated THEN
    RAISE EXCEPTION 'Verifikation FAILED — ROLLBACK';
  END IF;
  RAISE NOTICE 'Verifikation OK';
END $$;

COMMIT;