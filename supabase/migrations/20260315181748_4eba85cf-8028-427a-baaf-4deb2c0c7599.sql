-- Fix AGB upload with upsert=true: requires UPDATE policy on storage.objects
DROP POLICY IF EXISTS "Authenticated users can update contracts docs" ON storage.objects;

CREATE POLICY "Authenticated users can update contracts docs"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'contracts'
  AND auth.uid() IS NOT NULL
)
WITH CHECK (
  bucket_id = 'contracts'
  AND auth.uid() IS NOT NULL
);