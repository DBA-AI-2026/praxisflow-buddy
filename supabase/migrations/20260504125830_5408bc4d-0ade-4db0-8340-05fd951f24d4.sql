-- Konsolidierung 7 doppelter AD-Profile (alt 2026-03-04 -> neu 2026-03-20)
BEGIN;

CREATE TEMP TABLE _ad_id_map (
  email          text PRIMARY KEY,
  full_name      text NOT NULL,
  old_user_id    uuid NOT NULL UNIQUE,
  new_user_id    uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO _ad_id_map (email, full_name, old_user_id, new_user_id) VALUES
  ('adolph@carecapital.de',              'Michael Adolph',      '7e5f3362-b7eb-48bc-b299-8a9979a74f99', 'db7199ca-40cd-4c9b-a628-51b2db49bd81'),
  ('beer@carecapital.de',                'Daniel Beer',         '9d53a86e-08fa-4576-8ff5-baf2a1c3ab1f', 'b22aa09f-bf44-4d18-916c-11c891293934'),
  ('christian.weber@zab-abrechnung.de',  'Christian Weber',     'b341e622-2196-4630-9b94-92a1802ad785', 'b0fd89e0-cb8a-4f5d-9bbf-2aa2adc98e51'),
  ('hernandez@carecapital.de',           'Mario Hernandez',     'fe7d7e07-c16b-4a66-aaa5-2b4b2a756db7', '82d4a01d-d35b-4566-aba7-5d55310e5c7a'),
  ('kuchenbecker@carecapital.de',        'Karsten Kuchenbecker','96505651-642c-41c6-bfbb-940d7000cedc', '008e96f9-1dab-47f6-a44a-bac0ef26310e'),
  ('manuela.thordsen@zab-abrechnung.de', 'Manuela Thordsen',    'b8d1e8c7-e6c3-40b3-bf3e-4ecf60d61c37', '3caef0f4-70e7-4625-94ab-a9ed2670897b'),
  ('wilhelm@carecapital.de',             'Benedikt Wilhelm',    'abd32cc7-ce42-4f6f-b137-07fa27512296', 'd2ccc14c-d978-40aa-b0f9-a68c41d6f6dd');

-- Pre-Flight
DO $$
DECLARE
  v_missing int;
  v_pair    record;
  v_conflict_total int := 0;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM _ad_id_map m
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.old_user_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.new_user_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Pre-Flight FAILED: % Mapping-Zeile(n) mit fehlender ID in auth.users', v_missing;
  END IF;
  RAISE NOTICE 'Pre-Flight OK: alle 14 IDs in auth.users vorhanden';

  FOR v_pair IN
    SELECT 'integration_settings(user_id)'              AS loc, COUNT(*)::int AS n FROM public.integration_settings           WHERE user_id           IN (SELECT new_user_id FROM _ad_id_map) UNION ALL
    SELECT 'partner_commission_overrides(user_id)',            COUNT(*)::int FROM public.partner_commission_overrides         WHERE user_id           IN (SELECT new_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_milestone_tracking(tippgeber_id)',       COUNT(*)::int FROM public.tippgeber_milestone_tracking         WHERE tippgeber_id      IN (SELECT new_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_partner_assignments(tippgeber_user_id)', COUNT(*)::int FROM public.tippgeber_partner_assignments        WHERE tippgeber_user_id IN (SELECT new_user_id FROM _ad_id_map) UNION ALL
    SELECT 'user_regional_assignments(user_id)',               COUNT(*)::int FROM public.user_regional_assignments            WHERE user_id           IN (SELECT new_user_id FROM _ad_id_map) UNION ALL
    SELECT 'user_regional_assignments(regional_lead_id)',      COUNT(*)::int FROM public.user_regional_assignments            WHERE regional_lead_id  IN (SELECT new_user_id FROM _ad_id_map)
  LOOP
    IF v_pair.n > 0 THEN
      RAISE NOTICE 'Pre-Flight: % hat % Zeile(n) auf NEUEN IDs (Konflikt-Risiko)', v_pair.loc, v_pair.n;
      v_conflict_total := v_conflict_total + v_pair.n;
    END IF;
  END LOOP;

  IF v_conflict_total = 0 THEN
    RAISE NOTICE 'Pre-Flight OK: keine UNIQUE-relevanten Vor-Daten auf NEUEN IDs';
  ELSE
    RAISE EXCEPTION 'Pre-Flight FAILED: % potenzielle UNIQUE-Konflikte auf NEUEN IDs.', v_conflict_total;
  END IF;
END $$;

-- 38 UPDATEs
UPDATE public.accounting_costs           SET created_by             = m.new_user_id FROM _ad_id_map m WHERE accounting_costs.created_by             = m.old_user_id;
UPDATE public.audit_logs                 SET user_id                = m.new_user_id FROM _ad_id_map m WHERE audit_logs.user_id                      = m.old_user_id;
UPDATE public.commission_payouts         SET approved_by            = m.new_user_id FROM _ad_id_map m WHERE commission_payouts.approved_by          = m.old_user_id;
UPDATE public.commission_payouts         SET sales_partner_id       = m.new_user_id FROM _ad_id_map m WHERE commission_payouts.sales_partner_id     = m.old_user_id;
UPDATE public.contract_cases             SET assigned_to            = m.new_user_id FROM _ad_id_map m WHERE contract_cases.assigned_to              = m.old_user_id;
UPDATE public.contract_cases             SET created_by             = m.new_user_id FROM _ad_id_map m WHERE contract_cases.created_by               = m.old_user_id;
UPDATE public.contracts                  SET approved_by            = m.new_user_id FROM _ad_id_map m WHERE contracts.approved_by                   = m.old_user_id;
UPDATE public.contracts                  SET created_by             = m.new_user_id FROM _ad_id_map m WHERE contracts.created_by                    = m.old_user_id;
UPDATE public.contracts                  SET creditreform_checked_by= m.new_user_id FROM _ad_id_map m WHERE contracts.creditreform_checked_by       = m.old_user_id;
UPDATE public.contracts                  SET sales_partner_id       = m.new_user_id FROM _ad_id_map m WHERE contracts.sales_partner_id              = m.old_user_id;
UPDATE public.contracts                  SET tippgeber_id           = m.new_user_id FROM _ad_id_map m WHERE contracts.tippgeber_id                  = m.old_user_id;
UPDATE public.customer_revenues          SET user_id                = m.new_user_id FROM _ad_id_map m WHERE customer_revenues.user_id               = m.old_user_id;
UPDATE public.demo_downloads             SET created_by             = m.new_user_id FROM _ad_id_map m WHERE demo_downloads.created_by               = m.old_user_id;
UPDATE public.email_template_overrides   SET updated_by             = m.new_user_id FROM _ad_id_map m WHERE email_template_overrides.updated_by     = m.old_user_id;
UPDATE public.fibu_audit_log             SET changed_by             = m.new_user_id FROM _ad_id_map m WHERE fibu_audit_log.changed_by               = m.old_user_id;
UPDATE public.fibu_events                SET beneficiary_id         = m.new_user_id FROM _ad_id_map m WHERE fibu_events.beneficiary_id              = m.old_user_id;
UPDATE public.fibu_events                SET created_by             = m.new_user_id FROM _ad_id_map m WHERE fibu_events.created_by                  = m.old_user_id;
UPDATE public.fibu_export_batches        SET exported_by            = m.new_user_id FROM _ad_id_map m WHERE fibu_export_batches.exported_by         = m.old_user_id;
UPDATE public.integration_settings       SET user_id                = m.new_user_id FROM _ad_id_map m WHERE integration_settings.user_id            = m.old_user_id;
UPDATE public.integration_sync_logs      SET user_id                = m.new_user_id FROM _ad_id_map m WHERE integration_sync_logs.user_id           = m.old_user_id;
UPDATE public.invoices                   SET created_by             = m.new_user_id FROM _ad_id_map m WHERE invoices.created_by                     = m.old_user_id;
UPDATE public.invoices                   SET email_sent_by          = m.new_user_id FROM _ad_id_map m WHERE invoices.email_sent_by                  = m.old_user_id;
UPDATE public.leads                      SET assigned_to            = m.new_user_id FROM _ad_id_map m WHERE leads.assigned_to                       = m.old_user_id;
UPDATE public.leads                      SET tippgeber_id           = m.new_user_id FROM _ad_id_map m WHERE leads.tippgeber_id                      = m.old_user_id;
UPDATE public.partner_commission_overrides SET user_id              = m.new_user_id FROM _ad_id_map m WHERE partner_commission_overrides.user_id    = m.old_user_id;
UPDATE public.plz_assignment_log         SET changed_by             = m.new_user_id FROM _ad_id_map m WHERE plz_assignment_log.changed_by           = m.old_user_id;
UPDATE public.plz_gebietsleiter_mapping  SET gebietsleiter_id       = m.new_user_id FROM _ad_id_map m WHERE plz_gebietsleiter_mapping.gebietsleiter_id = m.old_user_id;
UPDATE public.praxis_reservations        SET assigned_ad_id         = m.new_user_id FROM _ad_id_map m WHERE praxis_reservations.assigned_ad_id      = m.old_user_id;
UPDATE public.praxis_reservations        SET converted_by_user_id   = m.new_user_id FROM _ad_id_map m WHERE praxis_reservations.converted_by_user_id= m.old_user_id;
UPDATE public.praxis_reservations        SET reserved_by            = m.new_user_id FROM _ad_id_map m WHERE praxis_reservations.reserved_by         = m.old_user_id;
UPDATE public.signature_audit_logs       SET created_by             = m.new_user_id FROM _ad_id_map m WHERE signature_audit_logs.created_by         = m.old_user_id;
UPDATE public.tipp_leads                 SET created_by             = m.new_user_id FROM _ad_id_map m WHERE tipp_leads.created_by                   = m.old_user_id;
UPDATE public.tippgeber_agreements       SET user_id                = m.new_user_id FROM _ad_id_map m WHERE tippgeber_agreements.user_id            = m.old_user_id;
UPDATE public.tippgeber_milestone_tracking SET tippgeber_id         = m.new_user_id FROM _ad_id_map m WHERE tippgeber_milestone_tracking.tippgeber_id = m.old_user_id;
UPDATE public.tippgeber_partner_assignments SET partner_user_id     = m.new_user_id FROM _ad_id_map m WHERE tippgeber_partner_assignments.partner_user_id  = m.old_user_id;
UPDATE public.tippgeber_partner_assignments SET tippgeber_user_id   = m.new_user_id FROM _ad_id_map m WHERE tippgeber_partner_assignments.tippgeber_user_id = m.old_user_id;
UPDATE public.user_regional_assignments  SET regional_lead_id       = m.new_user_id FROM _ad_id_map m WHERE user_regional_assignments.regional_lead_id = m.old_user_id;
UPDATE public.user_regional_assignments  SET user_id                = m.new_user_id FROM _ad_id_map m WHERE user_regional_assignments.user_id       = m.old_user_id;

-- Soft-Delete
UPDATE public.profiles p
   SET email      = p.email || '+deactivated_2026-05-04@duplicate.local',
       full_name  = COALESCE(p.full_name,'') || ' (deaktiviert 2026-05-04)',
       updated_at = now()
  FROM _ad_id_map m
 WHERE p.user_id = m.old_user_id
   AND p.email NOT LIKE '%+deactivated_2026-05-04@duplicate.local';

UPDATE public.user_roles ur
   SET is_active = false
  FROM _ad_id_map m
 WHERE ur.user_id = m.old_user_id
   AND ur.is_active = true;

DO $$
BEGIN
  UPDATE auth.users u
     SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
    FROM _ad_id_map m
   WHERE u.id = m.old_user_id
     AND (u.banned_until IS NULL OR u.banned_until < '2099-01-01'::timestamptz);
  RAISE NOTICE 'auth.users: alte IDs gebannt (banned_until=2099-12-31)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'auth.users konnte nicht beschrieben werden (insufficient_privilege). Bitte manuell nachholen.';
WHEN OTHERS THEN
  RAISE NOTICE 'auth.users-Update fehlgeschlagen (%). Bitte manuell nachholen.', SQLERRM;
END $$;

-- Verifikation
DO $$
DECLARE
  r record;
  v_total_remaining int := 0;
  v_plz_new int;
BEGIN
  RAISE NOTICE '--- VERIFIKATION ---';
  FOR r IN
    SELECT 'accounting_costs.created_by'                 AS col, COUNT(*)::int AS n FROM public.accounting_costs           WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'audit_logs.user_id',                               COUNT(*)::int FROM public.audit_logs                 WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'commission_payouts.approved_by',                   COUNT(*)::int FROM public.commission_payouts         WHERE approved_by            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'commission_payouts.sales_partner_id',              COUNT(*)::int FROM public.commission_payouts         WHERE sales_partner_id       IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contract_cases.assigned_to',                       COUNT(*)::int FROM public.contract_cases             WHERE assigned_to            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contract_cases.created_by',                        COUNT(*)::int FROM public.contract_cases             WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contracts.approved_by',                            COUNT(*)::int FROM public.contracts                  WHERE approved_by            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contracts.created_by',                             COUNT(*)::int FROM public.contracts                  WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contracts.creditreform_checked_by',                COUNT(*)::int FROM public.contracts                  WHERE creditreform_checked_by IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contracts.sales_partner_id',                       COUNT(*)::int FROM public.contracts                  WHERE sales_partner_id       IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'contracts.tippgeber_id',                           COUNT(*)::int FROM public.contracts                  WHERE tippgeber_id           IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'customer_revenues.user_id',                        COUNT(*)::int FROM public.customer_revenues          WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'demo_downloads.created_by',                        COUNT(*)::int FROM public.demo_downloads             WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'email_template_overrides.updated_by',              COUNT(*)::int FROM public.email_template_overrides   WHERE updated_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'fibu_audit_log.changed_by',                        COUNT(*)::int FROM public.fibu_audit_log             WHERE changed_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'fibu_events.beneficiary_id',                       COUNT(*)::int FROM public.fibu_events                WHERE beneficiary_id         IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'fibu_events.created_by',                           COUNT(*)::int FROM public.fibu_events                WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'fibu_export_batches.exported_by',                  COUNT(*)::int FROM public.fibu_export_batches        WHERE exported_by            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'integration_settings.user_id',                     COUNT(*)::int FROM public.integration_settings       WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'integration_sync_logs.user_id',                    COUNT(*)::int FROM public.integration_sync_logs      WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'invoices.created_by',                              COUNT(*)::int FROM public.invoices                   WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'invoices.email_sent_by',                           COUNT(*)::int FROM public.invoices                   WHERE email_sent_by          IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'leads.assigned_to',                                COUNT(*)::int FROM public.leads                      WHERE assigned_to            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'leads.tippgeber_id',                               COUNT(*)::int FROM public.leads                      WHERE tippgeber_id           IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'partner_commission_overrides.user_id',             COUNT(*)::int FROM public.partner_commission_overrides WHERE user_id              IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'plz_assignment_log.changed_by',                    COUNT(*)::int FROM public.plz_assignment_log         WHERE changed_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'plz_gebietsleiter_mapping.gebietsleiter_id',       COUNT(*)::int FROM public.plz_gebietsleiter_mapping  WHERE gebietsleiter_id       IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'praxis_reservations.assigned_ad_id',               COUNT(*)::int FROM public.praxis_reservations        WHERE assigned_ad_id         IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'praxis_reservations.converted_by_user_id',         COUNT(*)::int FROM public.praxis_reservations        WHERE converted_by_user_id   IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'praxis_reservations.reserved_by',                  COUNT(*)::int FROM public.praxis_reservations        WHERE reserved_by            IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'signature_audit_logs.created_by',                  COUNT(*)::int FROM public.signature_audit_logs       WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tipp_leads.created_by',                            COUNT(*)::int FROM public.tipp_leads                 WHERE created_by             IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_agreements.user_id',                     COUNT(*)::int FROM public.tippgeber_agreements       WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_milestone_tracking.tippgeber_id',        COUNT(*)::int FROM public.tippgeber_milestone_tracking WHERE tippgeber_id         IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_partner_assignments.partner_user_id',    COUNT(*)::int FROM public.tippgeber_partner_assignments WHERE partner_user_id     IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'tippgeber_partner_assignments.tippgeber_user_id',  COUNT(*)::int FROM public.tippgeber_partner_assignments WHERE tippgeber_user_id   IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'user_regional_assignments.regional_lead_id',       COUNT(*)::int FROM public.user_regional_assignments  WHERE regional_lead_id       IN (SELECT old_user_id FROM _ad_id_map) UNION ALL
    SELECT 'user_regional_assignments.user_id',                COUNT(*)::int FROM public.user_regional_assignments  WHERE user_id                IN (SELECT old_user_id FROM _ad_id_map)
    ORDER BY col
  LOOP
    RAISE NOTICE '  % = %', rpad(r.col, 60), r.n;
    v_total_remaining := v_total_remaining + r.n;
  END LOOP;

  IF v_total_remaining > 0 THEN
    RAISE EXCEPTION 'Verifikation FAILED: % Referenzen auf alte IDs verblieben — ROLLBACK', v_total_remaining;
  END IF;
  RAISE NOTICE 'Verifikation OK: 0 Referenzen auf alte IDs';

  SELECT COUNT(*) INTO v_plz_new
    FROM public.plz_gebietsleiter_mapping
   WHERE gebietsleiter_id IN (SELECT new_user_id FROM _ad_id_map);
  RAISE NOTICE 'Plausibilitätscheck: PLZ-Mappings auf NEUEN IDs = % (Soll: 71)', v_plz_new;
  IF v_plz_new <> 71 THEN
    RAISE EXCEPTION 'Plausibilitätscheck FAILED: Erwartet 71, gefunden % — ROLLBACK', v_plz_new;
  END IF;
END $$;

COMMIT;