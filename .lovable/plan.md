
## Understanding

The user wants:
1. **Remove signature collection** from the "Neuer Vertrag" dialog — no more drawing pads, no "Unterschrift Kunde" / "Unterschrift Vertrieb" sections
2. **Rename the submit button** from "Vertrag zeichnen" → "Digitaler Vertragsabschluss"
3. The "Vertragsbestätigung (manuell)" email (existing `send-contract-confirmation` edge function) IS the digital closing — it sends the Stripe payment link. Customer clicks → pays → contract activates automatically. This flow already works.
4. **Add AGB download link** inside the `send-contract-confirmation` email template (the one the customer receives with the Stripe button)
5. **Update Email Preview** (`buildContractPaperConfirmationHtml`) to reflect the AGB link and rename accordingly

## What changes

### 1. `src/pages/vertrieb/Vertraege.tsx`

**Remove signature section entirely from the dialog (lines ~2687–2769)**:
- Remove the "Unterschriften" section with signature pads, mode toggle, and canvas refs
- Remove all signature-related state, refs and logic from `getMissingFields()` — remove the signature check
- Remove signature mode from required checks: `if (form.signature_mode === "digital")` block removed
- Keep `signature_data` field in `ContractFormData` for backward compatibility but don't show it
- Rename submit button "Vertrag zeichnen" → "Digitaler Vertragsabschluss"
- Keep the form completely functional — all other fields remain

**Note**: `SignaturePad` import, refs, `clearSignature`, `clearVertriebSignature`, canvas refs, and the related `useEffect` can all be removed since nothing renders them.

### 2. `supabase/functions/send-contract-confirmation/index.ts`

Add AGB link to the email HTML in the sign-off section. The AGB PDF lives at `https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf` (publicly accessible via the Vertragsvorlage download button). Add a small text line and link button in the email body:

```html
<!-- AGB / Vertragsunterlagen -->
<tr>
  <td style="padding:0 40px 20px;">
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0;">
      📄 <a href="https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf" style="color:#0b367f;">Allgemeine Geschäftsbedingungen (AGB) herunterladen</a>
    </p>
  </td>
</tr>
```

### 3. `src/pages/tools/EmailPreview.tsx`

Update `buildContractPaperConfirmationHtml()` to include the same AGB link so the preview stays in sync with the real email template.

## What does NOT change

- The Stripe confirmation flow, paper contract upload, `send-contract-confirmation` edge function logic
- Status flow: "eingegangen" → Stripe paid → "aktiv"
- The warning banner in the contracts list
- All other form fields (Praxisdaten, Produkte, Bankdaten etc.)
- `signature_data` and `vertrieb_signature_data` columns stay in the DB (existing data not affected)
- The PDF template generation logic stays (used for "Zum Ausdrucken" / "Vertrag per Mail senden")

## Files changed
1. `src/pages/vertrieb/Vertraege.tsx` — remove Unterschriften section, rename button
2. `supabase/functions/send-contract-confirmation/index.ts` — add AGB link
3. `src/pages/tools/EmailPreview.tsx` — sync preview template with AGB link
