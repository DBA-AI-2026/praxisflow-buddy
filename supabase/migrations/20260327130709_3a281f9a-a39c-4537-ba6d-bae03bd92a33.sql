-- Clean up test data from pre-deployment run to allow re-test
-- Delete fibu_events linked to the test invoices
DELETE FROM public.fibu_events 
WHERE source_reference_id IN (
  SELECT id::text FROM public.invoices WHERE created_at > '2026-03-27T13:00:00Z'
);

-- Delete the test invoices themselves
DELETE FROM public.invoices WHERE created_at > '2026-03-27T13:00:00Z';

-- Delete the stale customer_revenues entries from pre-deployment run
DELETE FROM public.customer_revenues 
WHERE created_at > '2026-03-27T13:00:00Z' 
AND invoice_number IN ('RE-2026-0005', 'RE-2026-0006');