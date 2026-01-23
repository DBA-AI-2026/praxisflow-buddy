-- Create table for Salesforce connections
CREATE TABLE public.salesforce_connections (
    id TEXT PRIMARY KEY DEFAULT 'default',
    access_token TEXT,
    refresh_token TEXT,
    instance_url TEXT,
    token_type TEXT,
    issued_at TIMESTAMP WITH TIME ZONE,
    is_connected BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salesforce_connections ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage Salesforce connections
CREATE POLICY "Admins can view salesforce connections"
ON public.salesforce_connections
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update salesforce connections"
ON public.salesforce_connections
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert salesforce connections"
ON public.salesforce_connections
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_salesforce_connections_updated_at
BEFORE UPDATE ON public.salesforce_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();