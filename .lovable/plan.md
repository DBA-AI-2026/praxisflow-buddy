
## Implementation Plan: FiBu-Vorbereitungsmodul

### Key findings from code analysis

**`auto-invoice`**: `customer_revenues` is created with `invoice_number` as the link to `invoices`. The `invoices` table stores `stripe_invoice_id`. This means the chain is: `stripe_invoice_id → invoices.stripe_invoice_id → invoices.invoice_number → customer_revenues.invoice_number`. This is the robust link to use in the `invoice.paid` handler.

**`commission_payouts`**: 4 INSERT sites in `auto-invoice` need `commission_base_amount` + `commission_rule_version` added.

**`Buchhaltung.tsx`**: The Provisionen tab calculates commissions live from `contracts × product_commissions` – not from `commission_payouts`. Must be refactored to load from `commission_payouts`.

**Stripe webhook**: Currently handles `checkout.session.completed` and `customer.subscription.*`. No `invoice.paid` handler exists. The `customer_revenues` table has no `stripe_invoice_id` column – the link must go through `invoices`.

### Resolving the 3 pre-start points

**Point 1 – customer_revenues link**: The handler looks up `invoices` by `stripe_invoice_id`, then joins to `customer_revenues` via `invoice_number`. If no invoice is found: log a warning and still create the `fibu_events` entry with Stripe metadata — do not block. If invoice found but no matching `customer_revenues`: update invoice status only, still create fibu_event.

**Point 2 – customer_id + product_name on payment_received_reference**: After finding the invoice, load the linked `contracts` record via `invoices.contract_id` to pull `customer_id`, `product_name`, and `period_month`. All three fields are then set on the `fibu_events` row.

**Point 3 – Legacy CSV exports**: The existing Erlöse/Provisionen/Kosten CSV export buttons stay in place but are visually labeled "Direktexport (Legacy)" with an info note that the `fibu_events` tab is the controlled standard export path for FiBu handover.

---

### Files to create/modify

| File | Change |
|---|---|
| `supabase/migrations/[ts]_fibu_schema.sql` | NEW: 3 tables + sequence + schema extension + RLS |
| `supabase/functions/auto-invoice/index.ts` | +2 fields on 4 `commission_payouts` INSERT sites |
| `supabase/functions/stripe-webhook/index.ts` | +1 handler for `invoice.paid` (~45 lines) |
| `src/pages/Buchhaltung.tsx` | Provisionen tab → `commission_payouts`; 3 new tabs; export-protection logic |

Nothing else touched.

---

### Step 1: DB Migration

**Table: `fibu_export_batches`** (created first, `fibu_events` references it)
```sql
CREATE TABLE public.fibu_export_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_reference text UNIQUE NOT NULL,   -- HFX-EXP-2026-001
  export_type text NOT NULL,              -- 'all'|'invoices'|'commissions'|'costs'
  period_from date NOT NULL,
  period_to date NOT NULL,
  exported_by uuid,
  exported_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL DEFAULT 0,
  amount_net_total numeric DEFAULT 0,
  amount_gross_total numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  filter_criteria jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE public.fibu_export_batch_seq START WITH 1;
ALTER TABLE public.fibu_export_batches ENABLE ROW LEVEL SECURITY;
-- RLS: admin ALL
```

**Table: `fibu_events`**
```sql
CREATE TABLE public.fibu_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,              -- invoice_base_fee_created|invoice_usage_created|payment_received_reference|partner_commission_approved|tipster_commission_released|internal_sales_bonus_reference|vendor_cost_created|credit_note_created|correction_created|cancellation_created
  source_module text NOT NULL,           -- 'invoices'|'commission_payouts'|'accounting_costs'|'stripe'
  source_reference_id text,             -- primary key of source record (invoice.id, payout.id, stripe_invoice_id)
  customer_id uuid REFERENCES public.customers(id),
  contract_id uuid REFERENCES public.contracts(id),
  product_name text,                    -- stable product name text key, no FK
  period_start date,
  period_end date,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  amount_net numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  amount_gross numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  -- Commission fields (NULL when not a commission event)
  commission_type text,                 -- 'partner'|'tipster'|'internal'
  commission_base_amount numeric,
  commission_rate numeric,
  commission_amount numeric,
  commission_rule_version text,
  beneficiary_type text,               -- 'sales_partner'|'tippgeber'|'ad'
  beneficiary_id uuid,
  -- Cost fields (NULL when not a cost event)
  cost_type text,
  supplier text,
  -- Status (fachlich - separated from export status)
  status text NOT NULL DEFAULT 'draft', -- draft|approved|corrected|cancelled
  -- Export status (technisch)
  export_status text NOT NULL DEFAULT 'open', -- open|exported|blocked
  -- Export tracking
  export_batch_id uuid REFERENCES public.fibu_export_batches(id),
  exported_at timestamptz,
  -- Correction reference (corrections never modify originals)
  correction_of_event_id uuid REFERENCES public.fibu_events(id),
  description text,
  metadata jsonb,  -- For payment events: {stripe_invoice_id, payment_intent_id, stripe_customer_id}
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
-- Idempotency: prevent duplicate source event
CREATE UNIQUE INDEX idx_fibu_events_source_unique
  ON public.fibu_events(source_reference_id, event_type)
  WHERE source_reference_id IS NOT NULL AND correction_of_event_id IS NULL;
ALTER TABLE public.fibu_events ENABLE ROW LEVEL SECURITY;
-- RLS: admin ALL; sales_lead SELECT
```

**Table: `fibu_audit_log`**
```sql
CREATE TABLE public.fibu_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,   -- 'fibu_event'|'export_batch'
  entity_id uuid NOT NULL,
  action_type text NOT NULL,   -- 'created'|'status_changed'|'exported'|'corrected'|'blocked'
  old_value_json jsonb,
  new_value_json jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  reason text
);
ALTER TABLE public.fibu_audit_log ENABLE ROW LEVEL SECURITY;
-- RLS: admin SELECT+INSERT, no UPDATE/DELETE for anyone
```

**Schema extension on `commission_payouts`:**
```sql
ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS commission_base_amount numeric,
  ADD COLUMN IF NOT EXISTS commission_rule_version text;
```

Backfill block is included at the end of the migration, fully commented out.

---

### Step 2: `auto-invoice/index.ts` — 4 commission INSERT sites

Add `commission_base_amount` and `commission_rule_version` to each INSERT:

| ~Line | Role | base_amount source | rule_version |
|---|---|---|---|
| ~503 | classic product / sales_partner | `baseNetAmount` | `'STD-PARTNER-10PCT-v1'` |
| ~620 | GOÄ AD contract_signup (fixed) | `baseNetAmount` | `'GOÄ-AD-SIGNUP-2026-v1'` |
| ~646 | GOÄ AD usage (10%, 24m) | `usageNetAmount` | `'GOÄ-AD-USAGE-10PCT-24M-v1'` |
| ~681 | GOÄ sales_partner (10%) | `netAmount` | `'GOÄ-PARTNER-10PCT-v1'` |

No logic changes — only two additional fields in each insert object.

---

### Step 3: `stripe-webhook/index.ts` — `invoice.paid` handler

Added after the `customer.subscription.*` block (after line ~133):

```typescript
if (event.type === "invoice.paid") {
  const stripeInvoice = event.data.object as Stripe.Invoice;
  const stripeInvoiceId = stripeInvoice.id;
  const paymentIntentId = typeof stripeInvoice.payment_intent === 'string'
    ? stripeInvoice.payment_intent
    : (stripeInvoice.payment_intent as any)?.id ?? null;
  const stripeCustomerId = typeof stripeInvoice.customer === 'string'
    ? stripeInvoice.customer
    : (stripeInvoice.customer as any)?.id ?? null;

  // 1. Find invoice by stripe_invoice_id
  const { data: inv } = await supabase
    .from("invoices")
    .update({ status: "bezahlt" })
    .eq("stripe_invoice_id", stripeInvoiceId)
    .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number")
    .maybeSingle();

  // 2. Update customer_revenues via invoice_number (robust 1:1 link)
  if (inv?.invoice_number) {
    await supabase
      .from("customer_revenues")
      .update({ payment_status: "paid", paid_at: new Date().toISOString() })
      .eq("invoice_number", inv.invoice_number);
  } else {
    log("invoice.paid – no matching invoice found for stripe_invoice_id", stripeInvoiceId);
    // Continue: still create fibu_event as Stripe-sourced reference
  }

  // 3. Enrich with contract data for customer_id + product_name
  let customerId: string | null = null;
  let productName: string | null = null;
  if (inv?.contract_id) {
    const { data: ctr } = await supabase
      .from("contracts")
      .select("customer_id, product_name")
      .eq("id", inv.contract_id)
      .maybeSingle();
    customerId = ctr?.customer_id ?? null;
    productName = ctr?.product_name ?? null;
  }

  // 4. Create fibu_event — payment_received_reference is auto-approved (Stripe is authoritative)
  const { error: fibuErr } = await supabase.from("fibu_events").insert({
    event_type: "payment_received_reference",
    source_module: "stripe",
    source_reference_id: stripeInvoiceId,
    contract_id: inv?.contract_id ?? null,
    customer_id: customerId,
    product_name: productName,
    amount_net: inv ? Number(inv.net_amount) : 0,
    tax_amount: inv ? Number(inv.tax_amount) : 0,
    amount_gross: inv ? Number(inv.gross_amount) : 0,
    occurred_at: new Date().toISOString(),
    status: "approved",        // Stripe confirmation = authoritative, no manual review needed
    export_status: "open",
    description: `Zahlungseingang Stripe ${stripeInvoiceId}${inv?.invoice_number ? ` / ${inv.invoice_number}` : ""}`,
    metadata: {
      stripe_invoice_id: stripeInvoiceId,
      payment_intent_id: paymentIntentId,
      stripe_customer_id: stripeCustomerId,
      hfx_invoice_number: inv?.invoice_number ?? null,
    },
  });
  if (fibuErr && (fibuErr as any).code !== "23505") {
    log("fibu_events insert failed for invoice.paid", fibuErr.message);
  }
  log("invoice.paid processed", { stripeInvoiceId, found: !!inv });
}
```

Error handling: unique constraint violation (23505 = already processed on webhook retry) is silently ignored. Any other error is logged but does not fail the webhook response.

---

### Step 4: `Buchhaltung.tsx` — 4 targeted changes

**4a. Provisionen tab: replace live calculation with `commission_payouts` query**

Remove the `contracts × product_commissions` live calculation. Add a new query:
```typescript
const { data: commissions = [], isLoading: commLoading } = useQuery({
  queryKey: ["accounting-commissions", effectiveFrom, effectiveTo],
  queryFn: async () => supabase
    .from("commission_payouts")
    .select("*")
    .in("status", ["approved", "paid"])
    .gte("created_at", effectiveFrom)
    .lte("created_at", effectiveTo)
    .order("created_at", { ascending: false })
});
```

Table shows grouped by `commission_role`: extern (sales_partner + tippgeber) / intern (ad). Toggle checkbox to include/exclude internal in CSV export. Columns: Monat | Vertriebler | Rolle | Produkt | Basis | Satz | Betrag | Regelversion | Status.

**4b. New tab "Geschäftsvorfälle"**

New `TabsTrigger value="vorfaelle"` tab. Loads `fibu_events` with filters for period, event_type, status, export_status.

Table columns: Datum | Typ | Beschreibung | Betrag | Status | Exportstatus | Aktionen

Status badges:
- `draft`: gray outline
- `approved`: blue
- `corrected`: amber
- `cancelled`: red
- `export_status=exported`: green chip

Per-row actions:
- "Freigeben" button: changes `draft → approved`, inserts `fibu_audit_log` entry
- "Sperren" button: changes export_status to `blocked`
- "Korrektur" button: opens dialog → creates new event with `correction_of_event_id` set, sets original `status = 'corrected'`

Export button (top-right of this tab):
- Filters: `status = 'approved' AND export_status = 'open'`
- Validation: `amount_gross >= 0`, at least one of `customer_id`/`source_reference_id` present
- Shows preview count + gross total
- On confirm: INSERT `fibu_export_batches` with `batch_reference = 'HFX-EXP-' + year + '-' + seq`, UPDATE all matching events to `export_status = 'exported' + export_batch_id + exported_at`, INSERT `fibu_audit_log`, trigger CSV download

CSV contains all 24 mandatory fields from the spec (UTF-8 BOM, semicolon-separated, ISO dates).

**4c. New tab "Zahlungseingänge"**

Loads `fibu_events WHERE event_type = 'payment_received_reference'`, sorted desc by `occurred_at`.
Columns: Datum | Stripe-Invoice-ID | Betrag | Produkt | HFX-Kunde | Status
Stripe-Invoice-ID pulled from `metadata->>'stripe_invoice_id'`.

**4d. New tab "Export-Protokoll"**

Loads `fibu_export_batches` ordered by `exported_at DESC`.
Columns: Batch-Ref | Typ | Zeitraum | Exporteur | Anzahl | Brutto | Datum | Status
"Download" button per row: fetches `fibu_events WHERE export_batch_id = batch.id` and regenerates the same CSV read-only.

**4e. Label legacy exports as "Direktexport (Legacy)"**

In the Erlöse, Provisionen, and Kosten tabs: rename existing CSV export buttons to `"CSV Direktexport (Legacy)"` and add a small info note: `"Für kontrollierte FiBu-Übergaben bitte den Tab Geschäftsvorfälle nutzen."` No other changes to those tabs.

---

### Summary of all files

| File | Change type |
|---|---|
| `supabase/migrations/[ts]_fibu_schema.sql` | NEW |
| `supabase/functions/auto-invoice/index.ts` | EDIT: +2 fields, 4 INSERT sites |
| `supabase/functions/stripe-webhook/index.ts` | EDIT: +1 handler block ~45 lines |
| `src/pages/Buchhaltung.tsx` | EDIT: provisionen tab refactor + 3 new tabs + export logic + legacy labels |

No other files touched. No existing logic broken.
