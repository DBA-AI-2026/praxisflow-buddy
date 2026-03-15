CREATE POLICY "Anon can read AGB files"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'contracts'
  AND (storage.foldername(name))[1] = 'agb'
);