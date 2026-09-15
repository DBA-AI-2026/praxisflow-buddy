drop index if exists idx_invoices_contract_billing_period;

create unique index idx_invoices_contract_billing_period
  on public.invoices (contract_id, billing_period_month)
  where billing_period_month is not null
    and status is distinct from 'storniert';