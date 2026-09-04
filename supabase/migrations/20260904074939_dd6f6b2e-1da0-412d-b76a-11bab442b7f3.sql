-- Aktivitäts-Monitoring für Interessenten in Testphase (Phase 1) – Schema
-- Quelle der Werte: Qodia-Usage-API (rein lesend), geschrieben ausschließlich
-- durch qodia-lead-usage-sync (Cron) und qodia-usage-query (source: "lead").
-- Delta-Basis: qodia_invoice_count_total (12-Monats-Fenster), nie count_month.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qodia_invoice_count_total integer NULL,
  ADD COLUMN IF NOT EXISTS qodia_invoice_count_month integer NULL,
  ADD COLUMN IF NOT EXISTS qodia_last_usage_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qodia_usage_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qodia_usage_error text NULL;

COMMENT ON COLUMN public.leads.qodia_invoice_count_total IS 'Eingereichte Rechnungen, rollierendes 12-Monats-Fenster (API-Limit 365 Tage), gekappt auf created_at. NULL = keine Daten.';
COMMENT ON COLUMN public.leads.qodia_invoice_count_month IS 'Eingereichte Rechnungen im laufenden Kalendermonat (API-Default-Fenster). NULL = keine Daten.';
COMMENT ON COLUMN public.leads.qodia_last_usage_at IS 'Delta-abgeleitet: gesetzt, wenn count_total gegenüber gespeichertem Wert steigt (Erstbefüllung bei total > 0).';
COMMENT ON COLUMN public.leads.qodia_usage_synced_at IS 'Zeitpunkt des letzten erfolgreichen Abgleichs (Cron oder Live-Abruf).';
COMMENT ON COLUMN public.leads.qodia_usage_error IS 'z. B. no_account (403/404 Access denied / User not found), api_error, network_error. NULL = ok.';

INSERT INTO public.app_settings (key, value)
VALUES ('lead_activity_thresholds', '{"yellow": 7, "red": 14}'::jsonb)
ON CONFLICT (key) DO NOTHING;