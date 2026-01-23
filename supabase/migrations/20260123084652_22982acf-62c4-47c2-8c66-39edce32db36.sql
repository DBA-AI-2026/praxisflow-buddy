-- Add code_verifier column for PKCE OAuth flow
ALTER TABLE public.salesforce_connections
ADD COLUMN IF NOT EXISTS code_verifier TEXT;