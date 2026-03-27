
-- Fix SECURITY DEFINER view warning by setting security_invoker = true
ALTER VIEW public.v_invoice_fibu_reconciliation SET (security_invoker = true);
