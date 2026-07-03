CREATE TABLE public.agb_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  storage_path  text NOT NULL,
  file_name     text,
  uploaded_by   uuid,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  is_current    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version)
);

CREATE INDEX agb_versions_product_current_idx ON public.agb_versions (product_id, is_current);
CREATE UNIQUE INDEX agb_versions_one_current_per_product ON public.agb_versions (product_id) WHERE is_current;

GRANT SELECT, INSERT, UPDATE ON public.agb_versions TO authenticated;
GRANT ALL ON public.agb_versions TO service_role;

ALTER TABLE public.agb_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view agb versions"   ON public.agb_versions FOR SELECT USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins can insert agb versions" ON public.agb_versions FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins can update agb versions" ON public.agb_versions FOR UPDATE USING (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.agb_versions (product_id, version, storage_path, file_name, is_current)
SELECT id, 1, agb_pdf_path, split_part(agb_pdf_path,'/', -1), true
FROM public.products
WHERE agb_pdf_path IS NOT NULL;