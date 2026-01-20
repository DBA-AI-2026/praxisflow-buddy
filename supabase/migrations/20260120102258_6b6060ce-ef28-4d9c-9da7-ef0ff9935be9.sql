-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_partner', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create reservations table for practices
CREATE TABLE public.praxis_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    praxis_name TEXT NOT NULL,
    arzt_namen TEXT NOT NULL,
    strasse TEXT NOT NULL,
    hausnummer TEXT NOT NULL,
    plz TEXT NOT NULL,
    ort TEXT NOT NULL,
    telefon TEXT NOT NULL,
    reserved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reserved_by_name TEXT,
    reserved_until TIMESTAMP WITH TIME ZONE NOT NULL,
    reservation_months INTEGER NOT NULL DEFAULT 3,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on reservations
ALTER TABLE public.praxis_reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for praxis_reservations
CREATE POLICY "Authenticated users can view reservations"
ON public.praxis_reservations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Sales partners and admins can create reservations"
ON public.praxis_reservations
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_role(auth.uid(), 'sales_partner') OR 
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can update their own reservations (except reserved_until)"
ON public.praxis_reservations
FOR UPDATE
TO authenticated
USING (
    reserved_by = auth.uid() OR 
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete reservations"
ON public.praxis_reservations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_praxis_reservations_updated_at
BEFORE UPDATE ON public.praxis_reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to enforce that only admins can change reserved_until
CREATE OR REPLACE FUNCTION public.check_reservation_date_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If reserved_until is being changed and user is not admin, reject
    IF OLD.reserved_until IS DISTINCT FROM NEW.reserved_until THEN
        IF NOT public.has_role(auth.uid(), 'admin') THEN
            RAISE EXCEPTION 'Only admins can change the reservation end date';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_reservation_date_admin_only
BEFORE UPDATE ON public.praxis_reservations
FOR EACH ROW
EXECUTE FUNCTION public.check_reservation_date_update();