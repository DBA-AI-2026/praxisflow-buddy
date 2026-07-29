CREATE OR REPLACE FUNCTION public.set_current_agb_version(
  p_product_id uuid, p_version integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_path text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT storage_path INTO v_path
  FROM public.agb_versions
  WHERE product_id = p_product_id AND version = p_version;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'version not found';
  END IF;

  UPDATE public.agb_versions SET is_current = false
  WHERE product_id = p_product_id AND is_current;

  UPDATE public.agb_versions SET is_current = true
  WHERE product_id = p_product_id AND version = p_version;

  UPDATE public.products SET agb_pdf_path = v_path WHERE id = p_product_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_current_agb_version(uuid, integer) TO authenticated;