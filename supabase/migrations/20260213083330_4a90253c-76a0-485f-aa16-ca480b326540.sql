-- Add column for base fee waiver end date (separate from sign-up deadline)
ALTER TABLE public.products ADD COLUMN promo_base_fee_end_date date DEFAULT NULL;