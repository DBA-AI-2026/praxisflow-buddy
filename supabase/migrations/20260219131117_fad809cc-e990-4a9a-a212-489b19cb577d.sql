
-- Add trigger to prevent non-admin users from changing reserved_by and reserved_by_name
CREATE OR REPLACE FUNCTION public.prevent_reservation_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.reserved_by IS DISTINCT FROM OLD.reserved_by THEN
      RAISE EXCEPTION 'Only admins can change reservation ownership';
    END IF;
    IF NEW.reserved_by_name IS DISTINCT FROM OLD.reserved_by_name THEN
      RAISE EXCEPTION 'Only admins can change reservation owner name';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_reservation_ownership
BEFORE UPDATE ON public.praxis_reservations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_reservation_ownership_change();

-- Also add a WITH CHECK clause to the UPDATE policy for defense-in-depth
DROP POLICY IF EXISTS "Users can update their own reservations (except reserved_until)" ON public.praxis_reservations;

CREATE POLICY "Users can update their own reservations"
ON public.praxis_reservations
FOR UPDATE
TO authenticated
USING (
  reserved_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR reserved_by = auth.uid()
);
