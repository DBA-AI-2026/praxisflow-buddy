
-- Role-based commission defaults (e.g. sales_partner gets 12% on HFX GOÄ)
CREATE TABLE public.commission_role_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  product_name text NOT NULL,
  commission_type text NOT NULL DEFAULT 'prozent',
  commission_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, product_name)
);

-- Individual partner commission overrides
CREATE TABLE public.partner_commission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_name text NOT NULL,
  commission_type text NOT NULL DEFAULT 'prozent',
  commission_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_name)
);

-- Enable RLS
ALTER TABLE public.commission_role_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_overrides ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage, authenticated can view
CREATE POLICY "Admins can manage role defaults" ON public.commission_role_defaults FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view role defaults" ON public.commission_role_defaults FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage partner overrides" ON public.partner_commission_overrides FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view partner overrides" ON public.partner_commission_overrides FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Partners can view own overrides" ON public.partner_commission_overrides FOR SELECT USING (auth.uid() = user_id);

-- Update triggers
CREATE TRIGGER update_commission_role_defaults_updated_at BEFORE UPDATE ON public.commission_role_defaults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_partner_commission_overrides_updated_at BEFORE UPDATE ON public.partner_commission_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
