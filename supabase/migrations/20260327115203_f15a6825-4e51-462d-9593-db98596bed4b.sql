
-- Reconciliation View: invoices vs fibu_events
-- Phase 1: Read-only transparency layer
CREATE OR REPLACE VIEW public.v_invoice_fibu_reconciliation AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.customer_name,
  i.customer_number,
  i.contract_id,
  i.net_amount AS invoice_net,
  i.tax_amount AS invoice_tax,
  i.gross_amount AS invoice_gross,
  i.status AS invoice_status,
  i.created_at AS invoice_created_at,
  -- Aggregated fibu_events for this invoice
  COALESCE(fe.fibu_event_count, 0) AS fibu_event_count,
  fe.fibu_net_total,
  fe.fibu_tax_total,
  fe.fibu_gross_total,
  fe.fibu_event_types,
  -- Delta calculations
  CASE 
    WHEN fe.fibu_event_count IS NULL OR fe.fibu_event_count = 0 THEN 'missing'
    WHEN ABS(i.net_amount - COALESCE(fe.fibu_net_total, 0)) > 0.01 THEN 'amount_mismatch'
    WHEN ABS(i.gross_amount - COALESCE(fe.fibu_gross_total, 0)) > 0.01 THEN 'amount_mismatch'
    ELSE 'ok'
  END AS reconciliation_status,
  i.net_amount - COALESCE(fe.fibu_net_total, 0) AS delta_net,
  i.gross_amount - COALESCE(fe.fibu_gross_total, 0) AS delta_gross
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS fibu_event_count,
    SUM(e.amount_net) AS fibu_net_total,
    SUM(e.tax_amount) AS fibu_tax_total,
    SUM(e.amount_gross) AS fibu_gross_total,
    array_agg(DISTINCT e.event_type) AS fibu_event_types
  FROM public.fibu_events e
  WHERE e.source_reference_id = i.id::text
    AND e.event_type IN ('invoice_base_fee_created', 'invoice_usage_created')
    AND e.status != 'cancelled'
) fe ON true
ORDER BY i.invoice_date DESC;

-- RLS: View inherits from underlying tables, but add explicit policy comment
COMMENT ON VIEW public.v_invoice_fibu_reconciliation IS 'Phase 1 Reconciliation: Read-only view comparing invoices with their corresponding fibu_events. Access controlled by underlying table RLS policies.';
