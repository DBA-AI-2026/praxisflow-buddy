CREATE TABLE public.free_quota_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hfx_customer_number text NOT NULL,
  grant_type text NOT NULL,
  menge integer NOT NULL CHECK (menge >= 0),
  quelle text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX free_quota_grants_one_auto_trial_per_hfx
  ON public.free_quota_grants (hfx_customer_number)
  WHERE grant_type = 'trial';

CREATE INDEX free_quota_grants_hfx_idx
  ON public.free_quota_grants (hfx_customer_number);

GRANT ALL ON public.free_quota_grants TO service_role;

ALTER TABLE public.free_quota_grants ENABLE ROW LEVEL SECURITY;
-- Default-Deny: keine Policies in Phase 1. Client-Rollen (anon/authenticated)
-- haben weder GRANT noch Policy → jeder Zugriff außer service_role wird abgewiesen.
-- Admin-UI-Policies folgen in einer separaten Migration.