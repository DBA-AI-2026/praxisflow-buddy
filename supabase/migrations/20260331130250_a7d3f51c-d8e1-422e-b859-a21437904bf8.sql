
-- Zuordnungstabelle: Tippgeber → Vertriebspartner
CREATE TABLE public.tippgeber_partner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tippgeber_user_id uuid NOT NULL,
  partner_user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tippgeber_user_id)
);

-- RLS aktivieren
ALTER TABLE public.tippgeber_partner_assignments ENABLE ROW LEVEL SECURITY;

-- Admin Vollzugriff
CREATE POLICY "Admins manage tippgeber_partner_assignments"
  ON public.tippgeber_partner_assignments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Sales Lead kann lesen
CREATE POLICY "Sales leads view tippgeber_partner_assignments"
  ON public.tippgeber_partner_assignments
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'sales_lead'::app_role));

-- Vertriebspartner sehen eigene zugeordnete Tippgeber
CREATE POLICY "Partners view own tippgeber assignments"
  ON public.tippgeber_partner_assignments
  FOR SELECT
  TO authenticated
  USING (partner_user_id = auth.uid());

-- Tippgeber sieht eigene Zuordnung
CREATE POLICY "Tippgeber view own assignment"
  ON public.tippgeber_partner_assignments
  FOR SELECT
  TO authenticated
  USING (tippgeber_user_id = auth.uid());

-- Authenticated users können lesen (für Dropdowns)
CREATE POLICY "Authenticated read tippgeber_partner_assignments"
  ON public.tippgeber_partner_assignments
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
