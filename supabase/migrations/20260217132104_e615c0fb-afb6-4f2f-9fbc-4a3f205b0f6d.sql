
ALTER TABLE public.contracts
  ADD COLUMN selected_addon_modules TEXT[] DEFAULT '{}'::text[];
