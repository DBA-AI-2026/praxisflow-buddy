
-- Add Creditreform credit check fields to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS creditreform_score numeric NULL,
  ADD COLUMN IF NOT EXISTS creditreform_rating text NULL,
  ADD COLUMN IF NOT EXISTS creditreform_checked_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS creditreform_checked_by uuid NULL,
  ADD COLUMN IF NOT EXISTS creditreform_approval_note text NULL;

COMMENT ON COLUMN public.contracts.creditreform_score IS 'Bonitätsscore von Creditreform (0-600)';
COMMENT ON COLUMN public.contracts.creditreform_rating IS 'Ampelfarbe: gruen, gelb, rot';
COMMENT ON COLUMN public.contracts.creditreform_checked_at IS 'Zeitpunkt der Bonitätsprüfung';
COMMENT ON COLUMN public.contracts.creditreform_checked_by IS 'User-ID des Prüfenden';
COMMENT ON COLUMN public.contracts.creditreform_approval_note IS 'Begründung bei Freigabe trotz negativer Bonität';
