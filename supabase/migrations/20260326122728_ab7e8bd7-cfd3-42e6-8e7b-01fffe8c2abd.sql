
-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe Event Idempotenz: processed_stripe_events Tabelle
-- Speichert jede verarbeitete Stripe-Event-ID einmalig.
-- Doppelte Webhook-Deliveries werden damit sicher erkannt und übersprungen.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.processed_stripe_events (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id  text        NOT NULL,
  event_type       text        NOT NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  status           text        NOT NULL DEFAULT 'ok', -- 'ok' | 'error'
  error_message    text,
  metadata         jsonb
);

-- Unique auf stripe_event_id: Kern-Idempotenz-Schutz
CREATE UNIQUE INDEX idx_processed_stripe_events_event_id
  ON public.processed_stripe_events (stripe_event_id);

-- Index für Monitoring/Fehlerauswertung
CREATE INDEX idx_processed_stripe_events_status
  ON public.processed_stripe_events (status, processed_at DESC);

CREATE INDEX idx_processed_stripe_events_type
  ON public.processed_stripe_events (event_type, processed_at DESC);

-- RLS: nur service_role (Edge Functions) darf schreiben; admins dürfen lesen
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view processed stripe events"
  ON public.processed_stripe_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.processed_stripe_events IS
  'Idempotenz-Register für Stripe-Webhooks. Jede stripe_event_id wird genau einmal eingetragen. '
  'Doppelte Webhook-Deliveries (Stripe garantiert at-least-once) werden erkannt und ignoriert. '
  'status=error bedeutet: Event empfangen aber Verarbeitung fehlgeschlagen – muss manuell geprüft werden.';
