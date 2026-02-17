
-- Create signature audit log table for legally robust electronic signatures
CREATE TABLE public.signature_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  signer_type TEXT NOT NULL CHECK (signer_type IN ('customer', 'vertrieb')),
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  document_hash TEXT,
  signature_data_hash TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.signature_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies: admins and sales partners can read/insert
CREATE POLICY "Users can view signature logs for their contracts"
  ON public.signature_audit_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'sales_partner') OR
    public.has_role(auth.uid(), 'sales_lead')
  );

CREATE POLICY "Authenticated users can create signature logs"
  ON public.signature_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = created_by);
