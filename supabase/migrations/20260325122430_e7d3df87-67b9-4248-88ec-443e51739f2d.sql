-- ════════════════════════════════════════════════════════════════════════════
-- FiBu-Vorbereitungsmodul: Core Schema
-- fibu_export_batches | fibu_events | fibu_audit_log
-- + commission_payouts schema extension
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. fibu_export_batches ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fibu_export_batches (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_reference     text    UNIQUE NOT NULL,
  export_type         text    NOT NULL,
  period_from         date    NOT NULL,
  period_to           date    NOT NULL,
  exported_by         uuid,
  exported_at         timestamptz NOT NULL DEFAULT now(),
  record_count        integer NOT NULL DEFAULT 0,
  amount_net_total    numeric DEFAULT 0,
  amount_gross_total  numeric DEFAULT 0,
  status              text    NOT NULL DEFAULT 'completed',
  filter_criteria     jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.fibu_export_batch_seq START WITH 1;

ALTER TABLE public.fibu_export_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fibu_export_batches"
  ON public.fibu_export_batches FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales leads view fibu_export_batches"
  ON public.fibu_export_batches FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'sales_lead'::app_role));

-- ── 2. fibu_events ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fibu_events (
  id                      uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type              text    NOT NULL,
  source_module           text    NOT NULL,
  source_reference_id     text,
  customer_id             uuid    REFERENCES public.customers(id),
  contract_id             uuid    REFERENCES public.contracts(id),
  product_name            text,
  period_start            date,
  period_end              date,
  occurred_at             timestamptz NOT NULL DEFAULT now(),
  amount_net              numeric NOT NULL DEFAULT 0,
  tax_amount              numeric NOT NULL DEFAULT 0,
  amount_gross            numeric NOT NULL DEFAULT 0,
  currency                text    NOT NULL DEFAULT 'EUR',
  commission_type         text,
  commission_base_amount  numeric,
  commission_rate         numeric,
  commission_amount       numeric,
  commission_rule_version text,
  beneficiary_type        text,
  beneficiary_id          uuid,
  cost_type               text,
  supplier                text,
  status                  text    NOT NULL DEFAULT 'draft',
  export_status           text    NOT NULL DEFAULT 'open',
  export_batch_id         uuid    REFERENCES public.fibu_export_batches(id),
  exported_at             timestamptz,
  correction_of_event_id  uuid    REFERENCES public.fibu_events(id),
  description             text,
  metadata                jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fibu_events_source_unique
  ON public.fibu_events(source_reference_id, event_type)
  WHERE source_reference_id IS NOT NULL AND correction_of_event_id IS NULL;

ALTER TABLE public.fibu_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fibu_events"
  ON public.fibu_events FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales leads view fibu_events"
  ON public.fibu_events FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'sales_lead'::app_role));

-- ── 3. fibu_audit_log (immutable) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fibu_audit_log (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type     text    NOT NULL,
  entity_id       uuid    NOT NULL,
  action_type     text    NOT NULL,
  old_value_json  jsonb,
  new_value_json  jsonb,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      uuid,
  reason          text
);

ALTER TABLE public.fibu_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fibu_audit_log"
  ON public.fibu_audit_log FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert fibu_audit_log"
  ON public.fibu_audit_log FOR INSERT TO public
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 4. commission_payouts: 2 new metadata fields ──────────────────────────────

ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS commission_base_amount numeric,
  ADD COLUMN IF NOT EXISTS commission_rule_version text;