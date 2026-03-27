-- Phase 2: Kompatibilitäts-View für customer_revenues
-- Vereint historische Legacy-Daten (customer_revenues) mit dem Zielpfad (invoices).
-- Neue Abrechnungsfälle werden künftig nur in invoices geschrieben.

CREATE OR REPLACE VIEW public.v_customer_revenues_compat
WITH (security_invoker = true)
AS
-- SOURCE 1: invoices (Zielpfad – neue Daten)
SELECT
  i.id,
  COALESCE(i.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS user_id,
  NULL::uuid              AS praxis_id,
  i.invoice_date,
  i.due_date,
  1                       AS quantity,
  i.net_amount            AS unit_price,
  i.tax_rate,
  i.net_amount,
  i.tax_amount,
  i.gross_amount,
  CASE WHEN i.status = 'bezahlt' THEN now() ELSE NULL END AS paid_at,
  i.exported_to_lexware,
  i.lexware_export_date,
  i.created_at,
  i.updated_at,
  i.customer_name,
  i.customer_number,
  i.invoice_number,
  COALESCE((i.positions->0->>'description')::text, 'Rechnung') AS product_name,
  NULL::text              AS product_category,
  CASE
    WHEN i.status = 'bezahlt' THEN 'paid'
    WHEN i.status = 'storniert' THEN 'cancelled'
    ELSE 'pending'
  END                     AS payment_status,
  i.lexware_voucher_id,
  i.notes,
  'invoices'::text        AS data_source,
  false                   AS is_legacy
FROM public.invoices i
WHERE NOT EXISTS (
  -- Deduplizierung: Wenn ein Legacy-Eintrag mit gleicher invoice_number existiert,
  -- wird der invoices-Eintrag bevorzugt und der Legacy-Eintrag übersprungen (siehe SOURCE 2 WHERE)
  SELECT 1
)

UNION ALL

-- SOURCE 2: customer_revenues (Legacy – historische Daten, die vor Phase 2 erstellt wurden)
SELECT
  cr.id,
  cr.user_id,
  cr.praxis_id,
  cr.invoice_date,
  cr.due_date,
  cr.quantity,
  cr.unit_price,
  cr.tax_rate,
  cr.net_amount,
  cr.tax_amount,
  cr.gross_amount,
  cr.paid_at,
  cr.exported_to_lexware,
  cr.lexware_export_date,
  cr.created_at,
  cr.updated_at,
  cr.customer_name,
  cr.customer_number,
  cr.invoice_number,
  cr.product_name,
  cr.product_category,
  cr.payment_status,
  cr.lexware_voucher_id,
  cr.notes,
  'customer_revenues'::text AS data_source,
  true                      AS is_legacy
FROM public.customer_revenues cr
WHERE NOT EXISTS (
  -- Deduplizierung: Wenn eine Rechnung mit gleicher invoice_number existiert,
  -- wird der Legacy-Eintrag übersprungen (invoices-Eintrag aus SOURCE 1 wird bevorzugt)
  SELECT 1 FROM public.invoices i2
  WHERE i2.invoice_number = cr.invoice_number
);