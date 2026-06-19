-- Welle 1: Salesforce-Tokens client-dicht
-- (a) Sichere Status-Funktion (SECURITY DEFINER, admin-gegated, ohne Token-Spalten)
CREATE OR REPLACE FUNCTION public.get_salesforce_connection_status()
RETURNS TABLE (is_connected boolean, instance_url text, last_sync_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sc.is_connected,
    sc.instance_url,
    sc.updated_at AS last_sync_at  -- Proxy bis echtes last_sync_at-Feld existiert
  FROM public.salesforce_connections sc
  WHERE sc.id = 'default'
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_salesforce_connection_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_salesforce_connection_status() TO authenticated;

-- (b) Alle Client-Policies droppen → Tabelle vollständig client-dicht
-- (RLS bleibt enabled; Service-Role-Edge-Functions umgehen RLS weiterhin)
DROP POLICY IF EXISTS "Admins can view salesforce connections"   ON public.salesforce_connections;
DROP POLICY IF EXISTS "Admins can update salesforce connections" ON public.salesforce_connections;
DROP POLICY IF EXISTS "Admins can insert salesforce connections" ON public.salesforce_connections;