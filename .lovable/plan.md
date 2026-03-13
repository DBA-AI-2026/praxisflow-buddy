
## Summary of User Decisions

The user answered 4 open questions from the previous analysis:

1. **Fachrichtung** → Customer fills in during the booking flow (not pre-collected)
2. **Rechtsform** → Customer fills in during the booking flow (not pre-collected)
3. **Produkt** → Passed via URL link parameter (e.g. `?product=HFX+GOÄ`)
4. **BSNR/LANR** → Only required if HFX EBM is chosen (option b from previous analysis)

## Full Digital Flow Architecture

```text
INTERN: Interessent angelegt (Lead DB)
   │
   └─► Email 1 (exists): Zugangsdaten + Download ✓
   
   Trigger: "Buchungsmail senden" button (manual) or Qodia "Buchen" (later)
   │
   └─► NEW PAGE: /buchen?product=HFX+GOÄ&contract_id=xxx
       Customer fills in:
         - Fachrichtung (Dropdown, always)
         - Rechtsform (Dropdown, always)  
         - BSNR + LANR (only if HFX EBM product)
         - AGB checkbox (mandatory, with PDF link)
       Then clicks → Stripe Checkout

   Stripe payment completed
   │
   └─► Webhook activates contract
   └─► Email 3: Vertragsbestätigung (PDF summary + AGB PDF attachment)
   └─► ContractConfirmation page: "Dokumente werden per E-Mail gesendet"
```

## What changes

### 1. New public page: `/buchen` — `src/pages/Buchen.tsx`
A **public** (no login required) customer-facing booking page. It reads URL params:
- `contract_id` — identifies which contract/lead
- `product` — pre-selects the product (e.g. `HFX+GOÄ+-+die+KI+...`)

**Page shows:**
- Product summary (name + price fetched from contract or products table)
- Form fields:
  - Fachrichtung (Select: Allgemeinmedizin, Innere Medizin, Chirurgie, Gynäkologie, HNO, Pädiatrie, Psychiatrie, Radiologie, Urologie, Zahnmedizin, Sonstiges)
  - Rechtsform (Select: Einzelpraxis, Berufsausübungsgemeinschaft, MVZ, GmbH, Sonstiges)
  - BSNR (Input, only shown if product contains "EBM")
  - LANR (Input, only shown if product contains "EBM")
- AGB checkbox: "Ich akzeptiere die [AGB (PDF)](link)" — mandatory
- "Verbindlich buchen →" button → calls `send-contract-confirmation` edge function (which creates Stripe session), saves fachrichtung/rechtsform/bsnr/lanr to contract, then redirects customer to Stripe URL

**Data flow:** On submit → PATCH contract with fachrichtung/rechtsform/bsnr/lanr → invoke `send-contract-confirmation` → redirect to `session.url`

For this to work without auth, the page calls a **new edge function** `initiate-booking` (public, no JWT required) that:
- Accepts `contract_id`, `fachrichtung`, `rechtsform`, `bsnr`, `lanr`, `product_name`  
- Validates the contract exists and `status` is `eingegangen`
- Updates the contract fields
- Creates Stripe checkout session
- Returns the Stripe URL

### 2. New edge function: `supabase/functions/initiate-booking/index.ts`
No auth required (`verify_jwt = false`). Accepts the form data, updates contract, returns Stripe checkout URL. Reuses the same Stripe session logic from `send-contract-confirmation`.

### 3. `send-contract-confirmation/index.ts` — update booking email
The email's CTA button link changes from a direct Stripe URL to the `/buchen?contract_id=xxx&product=...` page URL. This way the customer always goes through the form first to fill in Fachrichtung + Rechtsform before paying.

### 4. `src/App.tsx` — register public route
Add `<Route path="/buchen" element={<Buchen />} />` as a public route (no ProtectedRoute wrapper).

### 5. `stripe-webhook/index.ts` — `handlePaperContractPayment` — post-payment email
After activating the contract, send **Email 3** (Vertragsbestätigung) via Resend with:
- **Attachment 1:** AGB PDF — fetched from `https://praxisflow-buddy.lovable.app/templates/agb-honorarfuchs.pdf` (fallback: `vertrag-honorarfuchs.pdf`)  
- **Attachment 2:** Contract summary PDF — generated inline using `pdf-lib` (already installed) containing: Kundennummer, Produkt, Praxis, Fachrichtung, Rechtsform, Monatspreis netto/brutto, Vertragsbeginn, Kündigungsfrist, Zahlung via Stripe

### 6. `src/pages/ContractConfirmation.tsx` — update success message
Replace "Ihr zuständiger Außendienstmitarbeiter meldet sich zeitnah bei Ihnen" with "Eine Vertragsbestätigung mit Ihren Unterlagen wird Ihnen per E-Mail zugeschickt."

### 7. `supabase/functions/send-contract-confirmation/index.ts` — update CTA text
Remove "Ihr Außendienstmitarbeiter hat Ihren Vertragsabschluss vorbereitet" → replace with neutral text that works without a sales rep.

### 8. `supabase/config.toml` — register new function
Add `[functions.initiate-booking]` with `verify_jwt = false`.

## Files changed

| File | Change |
|---|---|
| `src/pages/Buchen.tsx` | NEW — customer booking form page |
| `src/App.tsx` | Add public `/buchen` route |
| `supabase/functions/initiate-booking/index.ts` | NEW — public edge function |
| `supabase/config.toml` | Register `initiate-booking` with `verify_jwt = false` |
| `supabase/functions/send-contract-confirmation/index.ts` | CTA link → `/buchen?contract_id=...`, remove AD text |
| `supabase/functions/stripe-webhook/index.ts` | Add post-payment Email 3 with 2 PDF attachments |
| `src/pages/ContractConfirmation.tsx` | Remove AD reference in success message |

## AGB PDF note
Code references `agb-honorarfuchs.pdf`. Once uploaded to `public/templates/agb-honorarfuchs.pdf` via GitHub it works automatically. Until then the code falls back to `vertrag-honorarfuchs.pdf`.

## Technical detail: pdf-lib in Deno edge function
`pdf-lib` is available in Deno via `npm:pdf-lib`. The summary PDF is generated entirely server-side — no template file needed. Font is Helvetica (built-in). The PDF contains all legally required contract data.
