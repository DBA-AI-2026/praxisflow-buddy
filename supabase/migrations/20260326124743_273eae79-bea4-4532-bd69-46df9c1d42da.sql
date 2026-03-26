
-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe Idempotenz: Partial Unique Index für retry-fähiges Status-Modell
-- processing → processed | error
--
-- Regel:
--   - "processed" blockiert finale Duplikate (echter Unique-Schutz)
--   - "processing" schützt gegen Parallelverarbeitung (ebenfalls unique)
--   - "error" darf ersetzt werden → kein Unique, Retry möglich
-- ─────────────────────────────────────────────────────────────────────────────

-- Bestehenden vollständigen Unique-Index entfernen
DROP INDEX IF EXISTS idx_processed_stripe_events_event_id;

-- Partial Unique Index: nur "processed" und "processing" blockieren Duplikate
-- "error"-Einträge werden beim Retry gelöscht und neu angelegt → kein Unique auf error
CREATE UNIQUE INDEX idx_processed_stripe_events_dedup
  ON public.processed_stripe_events (stripe_event_id)
  WHERE status IN ('processed', 'processing');

-- Index für schnelle Fehlerauswertung (bleibt)
-- (idx_processed_stripe_events_status und _type bereits vorhanden, nichts tun)

COMMENT ON TABLE public.processed_stripe_events IS
  'Idempotenz-Register für Stripe-Webhooks.
   Status-Modell:
     processing → Event wird gerade verarbeitet (Schutz gegen Parallelverarbeitung)
     processed  → Verarbeitung erfolgreich abgeschlossen (finale Duplikat-Sperre)
     error      → Verarbeitung fehlgeschlagen, Retry erlaubt (kein Unique-Schutz)
   Stripe at-least-once Retries nach Fehlern werden korrekt erneut verarbeitet.';
