-- Drop the overly permissive service role policy
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

-- Update the insert policy to allow any authenticated user to insert logs
-- This is needed because we log access attempts before knowing the role
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR auth.uid() = user_id));