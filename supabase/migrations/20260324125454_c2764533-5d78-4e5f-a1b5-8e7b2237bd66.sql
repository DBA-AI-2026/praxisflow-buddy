
ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS commission_role text,
  ADD COLUMN IF NOT EXISTS payout_trigger text,
  ADD COLUMN IF NOT EXISTS contract_start_date date;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS tippgeber_id uuid;

CREATE TABLE IF NOT EXISTS public.tippgeber_milestone_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tippgeber_id uuid NOT NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  cumulative_revenue numeric NOT NULL DEFAULT 0,
  milestone_reached boolean NOT NULL DEFAULT false,
  milestone_reached_at timestamp with time zone,
  payout_triggered boolean NOT NULL DEFAULT false,
  payout_triggered_at timestamp with time zone,
  payout_triggered_by uuid,
  payout_id uuid REFERENCES public.commission_payouts(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tippgeber_id, contract_id)
);

ALTER TABLE public.tippgeber_milestone_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tippgeber milestones"
  ON public.tippgeber_milestone_tracking
  FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tippgeber can view own milestones"
  ON public.tippgeber_milestone_tracking
  FOR SELECT
  TO public
  USING (public.has_role(auth.uid(), 'tippgeber'::app_role) AND tippgeber_id = auth.uid());

CREATE TRIGGER update_tippgeber_milestone_tracking_updated_at
  BEFORE UPDATE ON public.tippgeber_milestone_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
