
## Full Analysis

### Current State

**What "Vertrag erstellen" does today (qualifiziert lead):**
- `PraxenJourney.tsx` line 251: navigates to `/vertrieb/vertraege?leadId=...` with URL params
- `Vertraege.tsx` imports `useLocation` but NEVER reads those URL params → lead data silently discarded
- The "Digitaler Vertragsabschluss" button in `Vertraege.tsx` saves the contract with `status: "aktiv"` and immediately triggers Stripe + sends the PDF email — it's designed as a **direct activation**, not as a "send booking link" flow

**What the user wants:**
1. In the Journey (or contract form), the **Vertrieb** can create a contract as a draft, then manually trigger: "Send digital booking link" → customer receives the `send-contract-confirmation` email → `/buchen` page → Stripe payment → contract activates
2. This "Buchungsmail senden" button must also appear in the **Journey Verträge tab** (inline, no page navigation)
3. The Email Preview at `/admin/email-preview` is **missing the "Digitaler Vertragsabschluss" booking email template** — the `send-contract-confirmation` edge function's HTML is not shown anywhere

### What's Missing / Broken

**1. "Digitaler Vertragsabschluss" flow has no trigger in the Journey**
- The Journey's `InteressentenTab` "Vertrag erstellen" → navigates away, params ignored
- The `VertraegeTab` shows contracts but has no "Send booking link" action — only an ArrowRight to `/vertrieb/vertraege`
- The `sendBuchungsmail` function exists in `LeadDetailDialog.tsx` but is buried in a tab

**2. Contract creation needs to stay in the Journey (inline dialog)**
- Per the already-approved plan, contract creation should open as an inline dialog
- The contract form in `Vertraege.tsx` is huge (2791 lines) — needs to be reused, not duplicated

**3. Email Preview missing templates:**
- `send-contract-confirmation` → the booking email with `/buchen` link (Digitaler Abschluss) is NOT in EmailPreview
- The `contract-paper-confirmation` template in EmailPreview uses a mock Stripe URL but the actual flow goes through `/buchen` first — the template IS there but labeled "Vertragsbestätigung (manuell)" which is fine

**Current TemplateId list in EmailPreview (line 34):**
```
"lead-confirmation" | "contract-customer" | "contract-customer-pdf-send" | "contract-partner" | "contract-paper-confirmation" | "invoice" | "invoice-pdf" | "dashboard-credentials" | "demo-expiry-customer" | "ad-tipp-lead" | "ad-demo-reminder" | "ad-new-lead" | "ad-lead-assignment"
```
**Missing:** A template for the "Digitaler Vertragsabschluss" booking email (the one `send-contract-confirmation` sends)

### Plan

#### 1. Journey: Inline "Vertrag erstellen" dialog (without leaving the page)
In `PraxenJourney.tsx → InteressentenTab`, replace the `navigate(...)` call for "qualifiziert" leads with opening an **inline contract creation dialog**. This dialog wraps the existing form from `Vertraege.tsx`.

**Approach:** Extract the contract creation dialog from `Vertraege.tsx` into a new reusable component `src/components/contracts/CreateContractDialog.tsx`. This is a large but necessary refactor. The component:
- Accepts `prefillLead?: { id, praxis_name, vorname, nachname, email, plz, ort, adresse, hfx_customer_number, mobilnummer }` 
- On success, calls `onSuccess()` to invalidate queries and stay in the Journey
- Has two action buttons: "Als Entwurf" and "Digitaler Vertragsabschluss" (which saves as `eingegangen` + immediately triggers `send-contract-confirmation`)

Wait — actually this is a very large component. A lighter approach: just **fix the URL param reading in `Vertraege.tsx`** to auto-open the dialog with prefill when `leadId` is present, AND add the inline "send booking link" button in the Journey's Verträge tab directly. The user's core complaint is about the **flow**, not just navigation.

**Revised lighter approach:**
- `PraxenJourney.tsx`: Change "Vertrag erstellen" action for qualifiziert leads to instead open a **confirmation/booking dialog inline** — but since the contract form is 2000+ lines, a full extract is risky. Instead:
  - Keep navigate but fix Vertraege.tsx to read params and auto-open with prefill
  - In the Journey Verträge tab, add inline "Buchungsmail senden" button on rows with `status=eingegangen AND !confirmation_email_sent_at`

#### Final Approach (pragmatic, minimal risk):

**File 1: `src/pages/vertrieb/Vertraege.tsx`**
- Add `useEffect` to read URL params on mount: if `leadId` present, fetch lead → prefill form → auto-open dialog
- Change the main form submit for new contracts to offer two paths:
  - "Als Entwurf speichern" → status: entwurf (existing)
  - "Buchungsmail senden" → saves as status: `eingegangen` → calls `send-contract-confirmation` edge function → closes dialog
  - "Digitaler Vertragsabschluss" remains as full activation (existing)

**File 2: `src/pages/PraxenJourney.tsx` → `VertraegeTab`**
- Add a "Buchungsmail senden" action button inline in each row where `status === "eingegangen" && !confirmation_email_sent_at`  
- This calls `send-contract-confirmation` directly, updates the row to show the email was sent
- No page navigation needed

**File 3: `src/pages/tools/EmailPreview.tsx`**
- Add new template entry: `"booking-link"` — the digital booking email from `send-contract-confirmation`
- Add `buildBookingLinkHtml()` function mirroring the actual HTML from the edge function
- Category: "kunden" — label: "Digitaler Vertragsabschluss (Buchungslink)"

#### Summary of changes:

```text
src/pages/vertrieb/Vertraege.tsx
  - Add useEffect to read URL params + auto-open dialog with lead prefill
  - Add "Buchungsmail senden" as new submit option (saves as eingegangen + sends email)

src/pages/PraxenJourney.tsx
  - VertraegeTab: add inline "Buchungsmail senden" button on eingegangen rows without email
  - InteressentenTab: update "Vertrag erstellen" button label/tooltip to clarify it opens contract form

src/pages/tools/EmailPreview.tsx
  - Add template: "booking-link" with label "Digitaler Abschluss (Buchungslink)"
  - Add buildBookingLinkHtml() that mirrors send-contract-confirmation HTML
  - Category: "kunden"
```

No new edge functions needed — `send-contract-confirmation` already exists and works correctly.
No DB migrations needed.

### What the user experiences after the fix

```text
BEFORE (broken):
  Journey → "Vertrag erstellen" → /vertrieb/vertraege loads blank → params ignored
  Journey → "Verträge" tab → no way to send booking link
  Email Preview → missing digital booking email template

AFTER:
  Journey → "Vertrag erstellen" → /vertrieb/vertraege auto-opens form with lead prefilled
  Journey → "Verträge" tab → "Buchungsmail senden" button on eingegangen rows
  Vertraege.tsx form → new "Als Entwurf + Buchungsmail" flow for digital closing
  Email Preview → "Digitaler Abschluss (Buchungslink)" template visible in Kunden-Mails
```
