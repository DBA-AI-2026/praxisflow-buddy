-- Replace the view with explicit SECURITY INVOKER to avoid the security-definer linter warning.
-- The sequence access is intentional: only admin users reach the export flow in the app.
DROP VIEW IF EXISTS public.fibu_export_batch_seq_view;

CREATE VIEW public.fibu_export_batch_seq_view
  WITH (security_invoker = true)
AS
SELECT nextval('public.fibu_export_batch_seq') AS nextval;
