-- Auftrag 3 capture-lead. Rollback:
--   DROP TABLE IF EXISTS public.capture_lead_rate;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS qodia_signup_error;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS qodia_signup_error text NULL;
COMMENT ON COLUMN public.leads.qodia_signup_error IS 'Letzter Fehlschlag beim Qodia-Sign-up in capture-lead (gekürzt, ohne Daten); NULL = kein Fehler';

CREATE TABLE IF NOT EXISTS public.capture_lead_rate (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.capture_lead_rate TO service_role;
REVOKE ALL ON public.capture_lead_rate FROM anon, authenticated;
ALTER TABLE public.capture_lead_rate ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS capture_lead_rate_ip_time_idx ON public.capture_lead_rate (ip_hash, created_at);
COMMENT ON TABLE public.capture_lead_rate IS 'IP-Zähler für capture-lead (nur SHA-256-Hash), nur Service-Zugang, Einträge > 2 Tage werden gelöscht';