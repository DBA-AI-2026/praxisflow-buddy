ALTER TABLE public.contracts
  ADD COLUMN cancellation_date date,
  ADD COLUMN effective_end_date date;

COMMENT ON COLUMN public.contracts.cancellation_date IS 'Datum des Kuendigungseingangs (Phase 1 Kuendigungsmanagement). Nullable, kein Default.';
COMMENT ON COLUMN public.contracts.effective_end_date IS 'Effektives Vertragsende nach Kuendigungsfrist (Phase 1 Kuendigungsmanagement). Nullable, kein Default. end_date bleibt unangetastet.';