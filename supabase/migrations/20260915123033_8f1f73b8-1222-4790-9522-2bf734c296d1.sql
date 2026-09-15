-- AUFTRAG_Vermittlung Schritt A — additiv, kein Backfill, kein FK (analog tippgeber_id).
-- Rollback: ALTER TABLE public.leads DROP COLUMN vermittler_id;
--           ALTER TABLE public.contracts DROP COLUMN vermittler_id;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vermittler_id uuid DEFAULT NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS vermittler_id uuid DEFAULT NULL;

COMMENT ON COLUMN public.leads.vermittler_id IS 'vermittelnde Person/Organisation; NICHT betreut durch, NICHT tippgeber_id';
COMMENT ON COLUMN public.contracts.vermittler_id IS 'vermittelnde Person/Organisation; NICHT betreut durch, NICHT tippgeber_id';