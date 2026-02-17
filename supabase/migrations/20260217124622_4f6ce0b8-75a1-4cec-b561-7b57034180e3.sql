
-- Add duration-based hourly pricing columns to products
ALTER TABLE public.products ADD COLUMN price_per_unit_3m numeric DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN price_per_unit_6m numeric DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN price_per_unit_12m numeric DEFAULT NULL;

-- Add praxissystem and stundenaufwand fields to contracts
ALTER TABLE public.contracts ADD COLUMN praxissystem text DEFAULT NULL;
ALTER TABLE public.contracts ADD COLUMN stundenaufwand_pro_woche text DEFAULT NULL;

-- Update HFX Doku (THOKX) pricing: 199€ einmalig + 19,90€/Monat
UPDATE public.products SET monthly_price = 19.90, one_time_fee = 199.00 WHERE name = 'HFX Doku';

-- Update HFX Wingmann: hourly rates by duration
UPDATE public.products SET 
  price_per_unit_label = 'Stunde',
  price_per_unit = 159,
  price_per_unit_3m = 159,
  price_per_unit_6m = 149,
  price_per_unit_12m = 139
WHERE name = 'HFX Wingmann';

-- Update HFX Praxismanagement Zahnmedizin: hourly rates by duration + trial info
UPDATE public.products SET 
  price_per_unit_label = 'Stunde',
  price_per_unit = 159,
  price_per_unit_3m = 159,
  price_per_unit_6m = 149,
  price_per_unit_12m = 139,
  one_time_fee = 270,
  description = 'Probearbeiten: 1 Woche, max. 6 Zeitstunden à 45 €/Stunde (270 € einmalig). Danach mind. 3 Wochenstunden fest buchbar.'
WHERE name = 'HFX Praxismanagement Zahnmedizin';
