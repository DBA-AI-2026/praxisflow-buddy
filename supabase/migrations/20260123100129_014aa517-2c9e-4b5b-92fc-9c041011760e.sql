-- Add 'sales_lead' (Vertriebsleitung) to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_lead';