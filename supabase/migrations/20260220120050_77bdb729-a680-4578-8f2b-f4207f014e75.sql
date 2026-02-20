
-- Step 1: Add new role to enum (must be committed separately)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'regional_lead';
