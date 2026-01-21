-- Create customer_revenues table for storing revenue data per customer
CREATE TABLE public.customer_revenues (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    
    -- Customer/Practice info
    customer_name TEXT NOT NULL,
    customer_number TEXT,
    praxis_id UUID REFERENCES public.praxis_reservations(id) ON DELETE SET NULL,
    
    -- Revenue details
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    
    -- Product/Service info
    product_name TEXT NOT NULL,
    product_category TEXT, -- e.g. 'Abrechnungsservice', 'Modul', 'Lizenz'
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 19.00,
    
    -- Calculated amounts (stored for performance)
    net_amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL,
    gross_amount DECIMAL(10,2) NOT NULL,
    
    -- Payment status
    payment_status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, overdue, cancelled
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Export tracking
    exported_to_lexware BOOLEAN NOT NULL DEFAULT false,
    lexware_export_date TIMESTAMP WITH TIME ZONE,
    lexware_voucher_id TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_revenues ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can manage their own revenues
CREATE POLICY "Users can view their own revenues"
ON public.customer_revenues
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own revenues"
ON public.customer_revenues
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own revenues"
ON public.customer_revenues
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own revenues"
ON public.customer_revenues
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all revenues
CREATE POLICY "Admins can view all revenues"
ON public.customer_revenues
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_customer_revenues_updated_at
BEFORE UPDATE ON public.customer_revenues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for common queries
CREATE INDEX idx_customer_revenues_user_id ON public.customer_revenues(user_id);
CREATE INDEX idx_customer_revenues_invoice_date ON public.customer_revenues(invoice_date);
CREATE INDEX idx_customer_revenues_exported ON public.customer_revenues(exported_to_lexware);
CREATE INDEX idx_customer_revenues_payment_status ON public.customer_revenues(payment_status);