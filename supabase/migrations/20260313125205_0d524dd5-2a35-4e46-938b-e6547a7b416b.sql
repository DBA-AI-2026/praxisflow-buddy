-- Allow unauthenticated access to contracts with status 'eingegangen'
-- Needed for the public /buchen booking page
CREATE POLICY "Public can read eingegangen contracts for booking"
  ON public.contracts
  FOR SELECT
  TO anon
  USING (status = 'eingegangen');