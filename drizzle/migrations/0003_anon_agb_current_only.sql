CREATE OR REPLACE FUNCTION public.is_current_agb_path(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agb_versions v
    WHERE v.storage_path = p_path AND v.is_current
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_agb_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_agb_path(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can read AGB files" ON storage.objects;
CREATE POLICY "Anon can read AGB files"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'contracts' AND public.is_current_agb_path(name));