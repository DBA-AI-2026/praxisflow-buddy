-- Clean up E2E test data (test invoices + fibu_events from verification run)
DELETE FROM public.fibu_events 
WHERE source_reference_id IN (
  SELECT id::text FROM public.invoices WHERE created_at > '2026-03-27T13:07:00Z'
);
DELETE FROM public.invoices WHERE created_at > '2026-03-27T13:07:00Z';