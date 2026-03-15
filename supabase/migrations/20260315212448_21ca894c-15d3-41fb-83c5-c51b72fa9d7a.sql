DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Public can view active products for booking'
  ) THEN
    CREATE POLICY "Public can view active products for booking"
    ON public.products
    FOR SELECT
    TO anon
    USING (is_active = true);
  END IF;
END $$;