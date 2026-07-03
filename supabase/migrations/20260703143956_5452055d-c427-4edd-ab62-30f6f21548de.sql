CREATE OR REPLACE FUNCTION public.create_agb_version(
  p_product_id uuid,
  p_storage_path text,
  p_file_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next
    FROM public.agb_versions
   WHERE product_id = p_product_id;

  UPDATE public.agb_versions
     SET is_current = false
   WHERE product_id = p_product_id
     AND is_current;

  INSERT INTO public.agb_versions
    (product_id, version, storage_path, file_name, uploaded_by, is_current)
  VALUES
    (p_product_id, v_next, p_storage_path, p_file_name, auth.uid(), true);

  UPDATE public.products
     SET agb_pdf_path = p_storage_path
   WHERE id = p_product_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agb_version(uuid, text, text) TO authenticated;
