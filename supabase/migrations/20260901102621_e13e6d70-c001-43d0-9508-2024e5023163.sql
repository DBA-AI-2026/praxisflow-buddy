CREATE POLICY "Admins can upload email assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update email assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'::app_role));