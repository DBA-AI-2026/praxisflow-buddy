// manual-interim-invoice
// Admin-only interim invoice for a single contract. Bills ALL pending usage_charges
// (net_amount > 0) regardless of calendar month, runs Stripe SEPA pull, sends invoice email.
//
// SYNCHRONIZE WITH auto-invoice/index.ts:
//   - Invoice insert shape (positions, billing_period_month=NULL, status flow)
//   - Stripe flow (V2, 2026-05):
//       1) invoices.create({ pending_invoice_items_behavior: "exclude", ... }) → draft
//       2) Persist stripe_invoice_id to DB IMMEDIATELY (before any further Stripe call)
//       3) For each position + tax: invoiceItems.create({ invoice: <id>, ... }) — explicit attach
//       4) finalizeInvoice → pay
//       Cleanup on error: del each item; if draft → invoices.del, if open → voidInvoice, else noop.
//   - Email HTML template
//   - fibu_events insert pattern (invoice_usage_created)
// This is a deliberate duplication of the usage-billing slice of auto-invoice. The
// retry path (B1-B5), base fee, EBM logic, commissions and mandate-setup flow are
// intentionally NOT mirrored — interim invoices are usage-only.
// TODO: If interim invoices should later trigger commission events, extend here.

import { Resend } from "npm:resend@2.0.0";
import Stripe from "npm:stripe@14.21.0";
import { requireActiveRole } from "../_shared/auth.ts";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";
import {
  renderPositionsRows,
  renderPositionsTable,
  renderTotalsBlock,
  renderStripeFailedBox,
  renderSepaOkBox,
} from "../_shared/invoiceEmailParts.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function addDaysISO(base: Date, days: number): string {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDeDate(s: string) {
  return new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("de-DE");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireActiveRole(req, ["admin"], corsHeaders);
  if (guard instanceof Response) return guard;
  const { userId, email: claimEmail, admin: supabase } = guard;
  const userEmail = claimEmail || "unknown";



  try {
    const body = await req.json();
    const contractId: string | undefined = body?.contract_id;
    if (!contractId) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: cErr } = await supabase
      .from("contracts").select("*").eq("id", contractId).maybeSingle();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!contract.stripe_customer_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "Kein SEPA-Mandat hinterlegt, Zwischenabrechnung nicht möglich.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const emailTo = contract.rechnungs_email || contract.email;
    if (!emailTo) {
      return new Response(JSON.stringify({ success: false, error: "Keine Rechnungs-E-Mail hinterlegt." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load ALL pending usage_charges (any month) – same filter as the UI preview.
    const { data: usageCharges, error: ucErr } = await supabase
      .from("usage_charges")
      .select("*")
      .eq("contract_id", contract.id)
      .eq("status", "pending")
      .gt("net_amount", 0)
      .order("period_from", { ascending: true });
    if (ucErr) throw ucErr;
    if (!usageCharges || usageCharges.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Kein offener Verbrauch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodFrom = usageCharges.reduce((min: string, u: any) =>
      !min || u.period_from < min ? u.period_from : min, "");
    const periodTo = usageCharges.reduce((max: string, u: any) =>
      !max || u.period_to > max ? u.period_to : max, "");
    const billingPeriodLabel = `${fmtDeDate(periodFrom)} – ${fmtDeDate(periodTo)}`;

    // ROLLBACK 04.08.2026: Aufruf von computeEffectiveUsageNet, die beiden
    // Vorab-Abfragen (grantsTotal/usageInvoicedPrior) und das 0-€-Gate
    // entfernen; positions wieder direkt aus usage_charges bauen.
    //
    // Kontingent ist auf hfx_customer_number geschlüsselt, nicht auf den
    // Vertrag. Kein Periodenfilter: Zwischenabrechnungen laufen
    // periodenübergreifend, die Regel ist Lebensverbrauch
    // (max(0, Grants − bereits fakturierte Menge)).
    // Muss VOR jedem Statuswechsel der Charges laufen.
    let grantsTotal = 0;
    let usageInvoicedPrior = 0;
    if (contract.hfx_customer_number) {
      const [{ data: grantRows }, { data: priorRows }] = await Promise.all([
        supabase
          .from("free_quota_grants")
          .select("menge")
          .eq("hfx_customer_number", contract.hfx_customer_number),
        supabase
          .from("usage_charges")
          .select("quantity")
          .eq("hfx_customer_number", contract.hfx_customer_number)
          .eq("status", "invoiced"),
      ]);
      grantsTotal = (grantRows || []).reduce((s: number, g: any) => s + (Number(g.menge) || 0), 0);
      usageInvoicedPrior = (priorRows || []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
    }

    // Geteilter SSOT-Helper – KEINE Kopie der Formel (Drift war die Ursache).
    const eff = computeEffectiveUsageNet(usageCharges as any, grantsTotal, usageInvoicedPrior, billingPeriodLabel);
    const usageChargeIds = eff.usageChargeIds;
    const positions = eff.positions;
    if (eff.freiQty > 0) {
      console.log(`[manual-interim-invoice] Freikontingent: contract=${contract.id} hfx=${contract.hfx_customer_number} grants=${grantsTotal} priorInvoiced=${usageInvoicedPrior} saldo=${eff.saldo} periodQty=${eff.periodUsageQty} frei=${eff.freiQty} deduction=${eff.grantDeductionNet.toFixed(2)}€`);
    }

    const taxRate = 19;
    const netAmount = Math.round(positions.reduce((s, p) => s + p.quantity * p.unit_price, 0) * 100) / 100;
    const taxAmount = Math.round(netAmount * taxRate) / 100;
    const grossAmount = Math.round((netAmount + taxAmount) * 100) / 100;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dueDateStr = addDaysISO(today, 14);
    const nowIso = today.toISOString();

    const notesText = `Zwischenabrechnung – manuell ausgelöst am ${nowIso} von ${userEmail} | ${usageChargeIds.length} Positionen | Verbrauch ${periodFrom} bis ${periodTo}`
      + (grossAmount === 0 ? ` | Kein Einzug: vollständiger Freikontingent-Abzug (${eff.freiQty} Rechnungen)` : "");


    // 1) Atomar claimen: pending → invoicing. Conditional update fungiert als Lock.
    // Bei parallelem Aufruf updated der zweite Request 0 Rows und bricht ab.
    const { data: claimedCharges, error: claimErr } = await supabase
      .from("usage_charges")
      .update({ status: "invoicing" })
      .in("id", usageChargeIds)
      .eq("status", "pending")
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimedCharges || claimedCharges.length !== usageChargeIds.length) {
      return new Response(JSON.stringify({
        success: false,
        error: `Race condition: ${claimedCharges?.length ?? 0} von ${usageChargeIds.length} Charges wurden bereits anderweitig in Bearbeitung genommen. Bitte erneut versuchen.`,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Internal invoice — billing_period_month stays NULL → partial unique index ignores us
    const { data: invoice, error: insErr } = await supabase
      .from("invoices")
      .insert({
        contract_id: contract.id,
        customer_name: contract.customer_name,
        customer_number: contract.hfx_customer_number,
        rechnungs_email: emailTo,
        adresse: contract.adresse || contract.praxisanschrift,
        plz: contract.plz,
        ort: contract.ort,
        invoice_date: todayStr,
        due_date: dueDateStr,
        billing_period_month: null,
        positions,
        net_amount: netAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        gross_amount: grossAmount,
        status: "entwurf",
        notes: notesText,
      } as any)
      .select()
      .single();
    if (insErr || !invoice) {
      // Release claim so user can retry
      await supabase
        .from("usage_charges")
        .update({ status: "pending" })
        .in("id", usageChargeIds)
        .eq("status", "invoicing");
      return new Response(JSON.stringify({ error: insErr?.message || "Invoice insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Stripe Invoice + Items + finalize + pay (V2 flow, see header)
    let stripeInvoiceId: string | null = null;
    let stripeChargeFailed = false;
    let stripeErrorMessage: string | null = null;
    let stripeInvoice: any = null;
    const createdItemIds: string[] = [];

    // 0-€-Gate: bei vollständigem Freikontingent-Abzug kein Stripe-Einzug.
    if (grossAmount > 0) try {
      const stripeDescription = `Zwischenabrechnung – ${contract.product_name} – Verbrauch ${periodFrom} bis ${periodTo} (${usageChargeIds.length} Positionen)`;

      // 1) Leere Draft-Invoice ZUERST anlegen
      stripeInvoice = await stripe.invoices.create({
        customer: contract.stripe_customer_id,
        auto_advance: false,
        collection_method: "charge_automatically",
        pending_invoice_items_behavior: "exclude",
        description: stripeDescription,
        metadata: {
          hfx_contract_id: contract.id,
          hfx_invoice_id: invoice.id,
          hfx_invoice_number: invoice.invoice_number,
          hfx_customer_number: contract.hfx_customer_number || "",
          flow: "interim",
          usage_charge_ids: usageChargeIds.join(","),
        },
      });

      // 2) stripe_invoice_id SOFORT persistieren — egal was danach passiert,
      //    die Verknüpfung zwischen HFX-Invoice und Stripe-Invoice ist gesichert.
      await supabase
        .from("invoices")
        .update({ stripe_invoice_id: stripeInvoice.id })
        .eq("id", invoice.id);

      // 3) Items explizit an diese Invoice hängen
      let itemAmountSum = 0;
      for (const pos of positions) {
        // === 0 statt <= 0: negative Positionen (Freikontingent-Abzug,
        // EBM-Sondervereinbarung) MÜSSEN an Stripe übermittelt werden.
        // Ein <=-Vergleich verschluckte sie und zog den Rohbetrag ein
        // (Vorfall RE-2026-0032, 01.08.2026).
        // ROLLBACK 03.08.2026: === 0 zurück auf <= 0 und Summenprüfung
        // vor finalizeInvoice entfernen.
        if (pos.quantity * pos.unit_price === 0) continue;
        const itemAmount = Math.round(pos.quantity * pos.unit_price * 100);
        const item = await stripe.invoiceItems.create({
          customer: contract.stripe_customer_id,
          invoice: stripeInvoice.id,
          amount: itemAmount,
          currency: "eur",
          description: pos.description,
        });
        itemAmountSum += itemAmount;
        createdItemIds.push(item.id);
      }
      if (taxAmount !== 0) {
        const taxItemAmount = Math.round(taxAmount * 100);
        const taxItem = await stripe.invoiceItems.create({
          customer: contract.stripe_customer_id,
          invoice: stripeInvoice.id,
          amount: taxItemAmount,
          currency: "eur",
          description: `MwSt. 19% auf ${netAmount.toFixed(2)} €`,
        });
        itemAmountSum += taxItemAmount;
        createdItemIds.push(taxItem.id);
      }

      // Summenprüfung vor finalize: Stripe-Items vs. interne Bruttosumme
      const expectedCents = Math.round(grossAmount * 100);
      const diffCents = Math.abs(itemAmountSum - expectedCents);
      if (diffCents === 1) {
        console.warn(`[manual-interim-invoice] Rundungstoleranz 1 Cent bei ${invoice.invoice_number} (contract ${contract.id})`);
      } else if (diffCents >= 2) {
        console.error(`[manual-interim-invoice] Summenabweichung ${diffCents} Cent bei ${invoice.invoice_number} (contract ${contract.id}): Soll ${expectedCents}, Ist ${itemAmountSum}`);
        throw new Error(`Summenabweichung Stripe-Items (${itemAmountSum}) vs. Bruttobetrag (${expectedCents}) = ${diffCents} Cent – Einzug abgebrochen`);
      }

      // 4) Finalize + Pay
      const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
      await stripe.invoices.pay(finalized.id);
      stripeInvoiceId = stripeInvoice.id;

      // Erfolg: Charges final markieren invoicing → invoiced + invoice_id
      await supabase
        .from("usage_charges")
        .update({ status: "invoiced", invoice_id: invoice.id })
        .in("id", usageChargeIds)
        .eq("status", "invoicing");
    } catch (stripeErr: any) {
      console.error("[manual-interim-invoice] Stripe error:", stripeErr?.message);
      stripeChargeFailed = true;
      stripeErrorMessage = stripeErr?.message || String(stripeErr);

      // Cleanup Items
      for (const itemId of createdItemIds) {
        try { await stripe.invoiceItems.del(itemId); } catch (_) {}
      }
      // Cleanup Invoice: draft → del, open → void, sonst noop
      if (stripeInvoice?.id) {
        try {
          const fresh = await stripe.invoices.retrieve(stripeInvoice.id);
          if (fresh.status === "draft") {
            try { await stripe.invoices.del(stripeInvoice.id); } catch (_) {}
          } else if (fresh.status === "open") {
            try { await stripe.invoices.voidInvoice(stripeInvoice.id); } catch (_) {}
          }
          // paid/uncollectible/void → kein Eingriff möglich/sinnvoll
        } catch (_) { /* swallow cleanup errors */ }
      }

      await supabase
        .from("invoices")
        .update({ status: "zahlung_fehlgeschlagen" })
        .eq("id", invoice.id)
        .not("status", "in", "(bezahlt,storniert)");

      // Rollback: Charges zurück auf pending, damit erneut abgerechnet werden kann
      await supabase
        .from("usage_charges")
        .update({ status: "pending", invoice_id: null })
        .in("id", usageChargeIds)
        .eq("status", "invoicing");
    }

    // 4) Send invoice email (SSOT: renderBrandedEmail + _shared/invoiceEmailParts)
    const positionsHtml = renderPositionsRows(positions);
    const tableHtml = renderPositionsTable(positionsHtml);
    const totalsHtml = renderTotalsBlock({ net: netAmount, tax: taxAmount, gross: grossAmount });
    const noticeHtml = stripeChargeFailed
      ? renderStripeFailedBox({ includeRetryHint: false })
      : renderSepaOkBox();

    const introHtml = `
    <p style="font-size:15px;color:#333;">Sehr geehrte Damen und Herren,</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">anbei erhalten Sie Ihre <strong>Zwischenabrechnung ${invoice.invoice_number}</strong> vom <strong>${fmtDeDate(todayStr)}</strong> für den Verbrauchszeitraum <strong>${fmtDeDate(periodFrom)} – ${fmtDeDate(periodTo)}</strong>.</p>
    <p style="color:#555;font-size:14px;"><strong>Rechnungsempfänger:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</p>`;

    const bodyHtml = `${introHtml}
    ${tableHtml}
    ${totalsHtml}
    ${noticeHtml}
    <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Diese Zwischenabrechnung wurde manuell ausgelöst.</p>`;

    const bodyText = [
      `Sehr geehrte Damen und Herren,`,
      ``,
      `anbei erhalten Sie Ihre Zwischenabrechnung ${invoice.invoice_number} vom ${fmtDeDate(todayStr)} für den Verbrauchszeitraum ${fmtDeDate(periodFrom)} – ${fmtDeDate(periodTo)}.`,
      `Rechnungsempfänger: ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`,
      ``,
      ...positions.map((p) => `- ${p.description} | ${p.quantity} × ${Number(p.unit_price).toFixed(2)} € = ${(p.quantity * p.unit_price).toFixed(2)} €`),
      ``,
      `Nettobetrag: ${netAmount.toFixed(2)} €`,
      `MwSt. (19%): ${taxAmount.toFixed(2)} €`,
      `Gesamtbetrag: ${grossAmount.toFixed(2)} €`,
      ``,
      stripeChargeFailed
        ? `Hinweis: Automatischer Einzug aktuell nicht möglich. Bei Rückfragen: info@hfx-honorarfuchs.de.`
        : `Der Betrag wird automatisch von Ihrem hinterlegten SEPA-Konto eingezogen.`,
      ``,
      `Diese Zwischenabrechnung wurde manuell ausgelöst.`,
    ].join("\n");

    const { html: emailHtml } = renderBrandedEmail({
      subheadline: "Ihre Zwischenabrechnung",
      bodyHtml,
      bodyText,
    });

    const sendResult = await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [emailTo],
      subject: `Zwischenabrechnung ${invoice.invoice_number} – ${contract.customer_name}`,
      html: emailHtml,
      text: bodyText,
    });

    if (stripeChargeFailed) {
      await supabase.from("invoices").update({ email_sent_at: nowIso }).eq("id", invoice.id);
    } else {
      await supabase.from("invoices")
        .update({ status: "versendet", email_sent_at: nowIso })
        .eq("id", invoice.id)
        .not("status", "in", "(bezahlt,storniert)");
    }

    // 5) FiBu event: invoice_usage_created (only when Stripe succeeded — same rule as auto-invoice)
    if (!stripeChargeFailed) {
      try {
        await supabase.from("fibu_events").insert({
          event_type: "invoice_usage_created",
          source_module: "invoices",
          source_reference_id: `${invoice.id}:usage`,
          contract_id: contract.id,
          customer_id: contract.customer_id ?? null,
          product_name: contract.product_name,
          period_start: periodFrom,
          period_end: periodTo,
          amount_net: netAmount,
          tax_amount: taxAmount,
          amount_gross: grossAmount,
          currency: "EUR",
          status: "approved",
          export_status: "open",
          description: `Zwischenabrechnung ${invoice.invoice_number} – Verbrauch ${periodFrom} bis ${periodTo} (${usageChargeIds.length} Positionen)`,
          metadata: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            stripe_invoice_id: stripeInvoiceId,
            contract_id: contract.id,
            hfx_customer_number: contract.hfx_customer_number ?? null,
            usage_charge_ids: usageChargeIds,
            charge_count: usageChargeIds.length,
            flow: "interim",
          },
        } as any);
      } catch (e) {
        console.error("[manual-interim-invoice] fibu_events insert failed:", String(e));
      }
    }

    // Audit
    await supabase.from("audit_logs").insert({
      user_id: userId, user_email: userEmail, user_role: "admin",
      action: "INTERIM_INVOICE_CREATED",
      resource_path: `invoices/${invoice.id}`,
      success: !stripeChargeFailed,
      details: JSON.stringify({
        contract_id: contract.id,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        gross_amount: grossAmount,
        stripe_invoice_id: stripeInvoiceId,
        stripe_failed: stripeChargeFailed,
        stripe_error: stripeErrorMessage,
        usage_charge_count: usageChargeIds.length,
        period_from: periodFrom, period_to: periodTo,
        email_sent: !sendResult.error,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      net_amount: netAmount,
      gross_amount: grossAmount,
      stripe_invoice_id: stripeInvoiceId,
      stripe_failed: stripeChargeFailed,
      stripe_error: stripeErrorMessage,
      period_from: periodFrom,
      period_to: periodTo,
      position_count: usageChargeIds.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[manual-interim-invoice] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
