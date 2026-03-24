-- Allow tippgeber to view their own commission payouts (stored as sales_partner_id)
CREATE POLICY "Tippgeber can view own payouts"
  ON public.commission_payouts
  FOR SELECT
  USING (
    has_role(auth.uid(), 'tippgeber'::app_role) AND sales_partner_id = auth.uid()
  );

-- Allow tippgeber to view leads where tippgeber_id = their uid
CREATE POLICY "Tippgeber can view own referred leads"
  ON public.leads
  FOR SELECT
  USING (
    has_role(auth.uid(), 'tippgeber'::app_role) AND tippgeber_id = auth.uid()
  );
