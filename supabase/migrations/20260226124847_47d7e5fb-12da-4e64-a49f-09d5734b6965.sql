
CREATE TABLE public.email_template_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  html_content text NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_template_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template overrides"
  ON public.email_template_overrides
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view template overrides"
  ON public.email_template_overrides
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_email_template_overrides_updated_at
  BEFORE UPDATE ON public.email_template_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
