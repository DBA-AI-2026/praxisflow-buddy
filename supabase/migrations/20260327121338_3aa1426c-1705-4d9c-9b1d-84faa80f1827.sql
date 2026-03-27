
-- Phase 1 Erweiterung: Kombinierte Reconciliation-View
-- Vereint den Zielpfad (invoices) und den Legacy-Pfad (customer_revenues)
-- mit klarer Kennzeichnung der Datenquelle.
-- Dies ist eine reine Beobachtungs-/Kompatibilitätslösung für Phase 1.

CREATE OR REPLACE VIEW public.v_combined_fibu_reconciliation
WITH (security_invoker = true)
AS
-- SOURCE 1: invoices (Zielpfad)
SELECT
  i.id                        AS record_id,
  i.invoice_number            AS record_number,
  i.invoice_date              AS record_date,
  i.customer_name,
  i.customer_number,
  i.contract_id,
  i.net_amount                AS source_net,
  i.tax_amount                AS source_tax,
  i.gross_amount              AS source_gross,
  i.status                    AS source_status,
  i.created_at                AS source_created_at,
  'invoices'::text            AS data_source,
  false                       AS is_legacy,
  COALESCE(fe.fibu_event_count, 0)   AS fibu_event_count,
  fe.fibu_net_total,
  fe.fibu_tax_total,
  fe.fibu_gross_total,
  fe.fibu_event_types,
  CASE
    WHEN COALESCE(fe.fibu_event_count, 0) = 0 THEN 'missing'
    WHEN ABS(i.net_amount - COALESCE(fe.fibu_net_total, 0)) > 0.01
      OR ABS(i.gross_amount - COALESCE(fe.fibu_gross_total, 0)) > 0.01 THEN 'amount_mismatch'
    ELSE 'ok'
  END                         AS reconciliation_status,
  i.net_amount   - COALESCE(fe.fibu_net_total, 0)   AS delta_net,
  i.gross_amount - COALESCE(fe.fibu_gross_total, 0)  AS delta_gross
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int                                  AS fibu_event_count,
    SUM(f.amount_net)                              AS fibu_net_total,
    SUM(f.tax_amount)                              AS fibu_tax_total,
    SUM(f.amount_gross)                            AS fibu_gross_total,
    ARRAY_AGG(DISTINCT f.event_type)               AS fibu_event_types
  FROM public.fibu_events f
  WHERE f.source_reference_id = i.id::text
) fe ON true

UNION ALL

-- SOURCE 2: customer_revenues (Legacy-Übergangspfad)
SELECT
  cr.id                       AS record_id,
  cr.invoice_number           AS record_number,
  cr.invoice_date::date       AS record_date,
  cr.customer_name,
  cr.customer_number,
  NULL::uuid                  AS contract_id,
  cr.net_amount               AS source_net,
  cr.tax_amount               AS source_tax,
  cr.gross_amount             AS source_gross,
  cr.payment_status           AS source_status,
  cr.created_at               AS source_created_at,
  'customer_revenues'::text   AS data_source,
  true                        AS is_legacy,
  COALESCE(fe2.fibu_event_count, 0)  AS fibu_event_count,
  fe2.fibu_net_total,
  fe2.fibu_tax_total,
  fe2.fibu_gross_total,
  fe2.fibu_event_types,
  CASE
    WHEN COALESCE(fe2.fibu_event_count, 0) = 0 THEN 'missing'
    WHEN ABS(cr.net_amount - COALESCE(fe2.fibu_net_total, 0)) > 0.01
      OR ABS(cr.gross_amount - COALESCE(fe2.fibu_gross_total, 0)) > 0.01 THEN 'amount_mismatch'
    ELSE 'ok'
  END                         AS reconciliation_status,
  cr.net_amount   - COALESCE(fe2.fibu_net_total, 0)   AS delta_net,
  cr.gross_amount - COALESCE(fe2.fibu_gross_total, 0)  AS delta_gross
FROM public.customer_revenues cr
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int                                  AS fibu_event_count,
    SUM(f.amount_net)                              AS fibu_net_total,
    SUM(f.tax_amount)                              AS fibu_tax_total,
    SUM(f.amount_gross)                            AS fibu_gross_total,
    ARRAY_AGG(DISTINCT f.event_type)               AS fibu_event_types
  FROM public.fibu_events f
  WHERE f.source_reference_id = cr.id::text
) fe2 ON true;
