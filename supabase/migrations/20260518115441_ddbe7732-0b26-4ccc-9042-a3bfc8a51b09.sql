-- Helper for contract-merge-diagnose: returns TRUE if the given column on the
-- given public-schema table is covered by a UNIQUE constraint or a UNIQUE index
-- (single-column only — composite uniqueness is handled separately by the
-- diagnose function via value comparison).
CREATE OR REPLACE FUNCTION public.get_fk_unique_columns(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- a) UNIQUE / PRIMARY KEY constraints (single-column)
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class      t ON t.oid = c.conrelid
    JOIN pg_namespace  n ON n.oid = t.relnamespace
    JOIN pg_attribute  a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE n.nspname = 'public'
      AND t.relname = p_table
      AND a.attname = p_column
      AND c.contype IN ('u', 'p')
      AND array_length(c.conkey, 1) = 1
  ) OR EXISTS (
    -- b) UNIQUE indexes that are NOT backed by a constraint (single-column)
    SELECT 1
    FROM pg_index      i
    JOIN pg_class      t ON t.oid = i.indrelid
    JOIN pg_namespace  n ON n.oid = t.relnamespace
    JOIN pg_attribute  a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
    WHERE n.nspname = 'public'
      AND t.relname = p_table
      AND a.attname = p_column
      AND i.indisunique = true
      AND array_length(i.indkey::int[], 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c2
        WHERE c2.conindid = i.indexrelid
      )
  );
$$;

REVOKE ALL ON FUNCTION public.get_fk_unique_columns(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_fk_unique_columns(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fk_unique_columns(text, text) TO service_role;

COMMENT ON FUNCTION public.get_fk_unique_columns(text, text) IS
  'Read-only helper for contract-merge-diagnose. Returns TRUE iff the given column has a single-column UNIQUE constraint or UNIQUE index in the public schema. Service-role only.';