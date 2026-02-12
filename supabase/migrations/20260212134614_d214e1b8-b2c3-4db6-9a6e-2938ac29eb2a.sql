
-- Add per-unit pricing and promotional pricing fields to products
ALTER TABLE public.products
  ADD COLUMN price_per_unit numeric DEFAULT NULL,
  ADD COLUMN price_per_unit_label text DEFAULT NULL,
  ADD COLUMN promo_price numeric DEFAULT NULL,
  ADD COLUMN promo_price_label text DEFAULT NULL,
  ADD COLUMN promo_end_date date DEFAULT NULL;
