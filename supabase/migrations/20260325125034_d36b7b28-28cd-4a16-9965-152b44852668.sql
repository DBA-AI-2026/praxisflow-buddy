-- Create a view that exposes nextval() for fibu_export_batch_seq
-- so the frontend can retrieve a collision-free, monotonically increasing
-- sequence number for batch_reference generation via the REST API.
-- Access is protected at app level (admin role only triggers an export).
CREATE OR REPLACE VIEW public.fibu_export_batch_seq_view AS
SELECT nextval('public.fibu_export_batch_seq') AS nextval;
