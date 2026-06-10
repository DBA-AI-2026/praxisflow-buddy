-- Härte storage.objects-Policies für contracts-Bucket (PII-Leak fix)
DROP POLICY IF EXISTS "Authenticated users can view contracts docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update contracts docs" ON storage.objects;

-- SELECT: Admin/sales_lead/vertragsabteilung sehen alles;
-- sonst nur Owner (erster Folder = user.id) oder Pfad ist als document_url
-- in einer für den User per contracts-RLS sichtbaren Vertragszeile referenziert.
CREATE POLICY "Contracts bucket: scoped read access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_lead'::public.app_role)
    OR public.has_role(auth.uid(), 'vertragsabteilung'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.document_url = storage.objects.name
    )
  )
);

-- INSERT: Admin/vertragsabteilung dürfen alle Pfade (inkl. agb/ und paper-contracts/);
-- alle anderen Authenticated nur in ihren eigenen Owner-Folder uploaden.
CREATE POLICY "Contracts bucket: scoped upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contracts'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'vertragsabteilung'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- UPDATE (z.B. upsert): selbe Logik wie INSERT.
CREATE POLICY "Contracts bucket: scoped update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contracts'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'vertragsabteilung'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'contracts'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'vertragsabteilung'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
