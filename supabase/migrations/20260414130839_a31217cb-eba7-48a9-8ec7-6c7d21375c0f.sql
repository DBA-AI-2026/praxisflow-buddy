
-- Add billing_period_month to invoices for robust duplicate prevention
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_period_month text;

-- Create unique index: one invoice per contract per billing period
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_contract_billing_period 
ON public.invoices (contract_id, billing_period_month) 
WHERE billing_period_month IS NOT NULL;

-- Add waiver fields to contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS base_fee_waived boolean NOT NULL DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS base_fee_waived_until date;
