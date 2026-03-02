
-- 1. Erweitere tipp_leads um reservation_until (30 Tage), AD-Kontaktfelder und SF-ID
ALTER TABLE public.tipp_leads
  ADD COLUMN IF NOT EXISTS reservation_until timestamp with time zone DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS ad_email text,
  ADD COLUMN IF NOT EXISTS ad_telefon text,
  ADD COLUMN IF NOT EXISTS salesforce_id text,
  ADD COLUMN IF NOT EXISTS salesforce_synced boolean NOT NULL DEFAULT false;

-- 2. Setze reservation_until für bestehende Zeilen
UPDATE public.tipp_leads SET reservation_until = created_at + interval '30 days' WHERE reservation_until IS NULL;

-- 3. Storage-Bucket für Tippgebervereinbarungen (privat)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tippgeber-agreements', 'tippgeber-agreements', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage-Tabelle für Tippgebervereinbarung-Metadaten
CREATE TABLE IF NOT EXISTS public.tippgeber_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  uploaded_by uuid
);

ALTER TABLE public.tippgeber_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agreements"
  ON public.tippgeber_agreements FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Storage RLS policies für tippgeber-agreements bucket
CREATE POLICY "Admins can upload tippgeber agreements"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tippgeber-agreements' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view tippgeber agreements"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tippgeber-agreements' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tippgeber agreements"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'tippgeber-agreements' AND has_role(auth.uid(), 'admin'::app_role));
