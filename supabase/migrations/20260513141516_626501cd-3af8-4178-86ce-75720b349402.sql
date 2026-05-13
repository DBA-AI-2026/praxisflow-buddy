ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS mandate_email_sent_at timestamp with time zone;

COMMENT ON COLUMN public.contracts.mandate_email_sent_at IS 'Zeitpunkt, zu dem Mail 1 (SEPA-Mandat-Setup-Link via send-mandate-setup) erfolgreich versendet wurde. Getrennt von confirmation_email_sent_at (Mail 2, Vertragsbestätigung mit AGB).';