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
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

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

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims.email as string) || "unknown";

  const supabase = createClient(supabaseUrl, serviceKey);

  // Admin role check
  const { data: roleRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    const usageChargeIds = usageCharges.map((u: any) => u.id);
    const periodFrom = usageCharges.reduce((min: string, u: any) =>
      !min || u.period_from < min ? u.period_from : min, "");
    const periodTo = usageCharges.reduce((max: string, u: any) =>
      !max || u.period_to > max ? u.period_to : max, "");

    const positions = usageCharges.map((uc: any) => ({
      description: uc.unit_description || `Geprüfte GOÄ-Rechnungen ${fmtDeDate(uc.period_from)} – ${fmtDeDate(uc.period_to)}`,
      quantity: uc.quantity,
      unit_price: Number(uc.unit_price),
    }));

    const taxRate = 19;
    const netAmount = Math.round(positions.reduce((s, p) => s + p.quantity * p.unit_price, 0) * 100) / 100;
    const taxAmount = Math.round(netAmount * taxRate) / 100;
    const grossAmount = Math.round((netAmount + taxAmount) * 100) / 100;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dueDateStr = addDaysISO(today, 14);
    const nowIso = today.toISOString();

    const notesText = `Zwischenabrechnung – manuell ausgelöst am ${nowIso} von ${userEmail} | ${usageChargeIds.length} Positionen | Verbrauch ${periodFrom} bis ${periodTo}`;

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

    // 3) Stripe Invoice + Items + finalize + pay
    let stripeInvoiceId: string | null = null;
    let stripeChargeFailed = false;
    let stripeErrorMessage: string | null = null;
    const createdItemIds: string[] = [];

    try {
      for (const pos of positions) {
        if (pos.quantity * pos.unit_price <= 0) continue;
        const item = await stripe.invoiceItems.create({
          customer: contract.stripe_customer_id,
          amount: Math.round(pos.quantity * pos.unit_price * 100),
          currency: "eur",
          description: pos.description,
        });
        createdItemIds.push(item.id);
      }
      const taxItem = await stripe.invoiceItems.create({
        customer: contract.stripe_customer_id,
        amount: Math.round(taxAmount * 100),
        currency: "eur",
        description: `MwSt. 19% auf ${netAmount.toFixed(2)} €`,
      });
      createdItemIds.push(taxItem.id);

      const stripeDescription = `Zwischenabrechnung – ${contract.product_name} – Verbrauch ${periodFrom} bis ${periodTo} (${usageChargeIds.length} Positionen)`;

      const stripeInvoice = await stripe.invoices.create({
        customer: contract.stripe_customer_id,
        auto_advance: false,
        collection_method: "charge_automatically",
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
      const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
      await stripe.invoices.pay(finalized.id);
      stripeInvoiceId = stripeInvoice.id;
      await supabase.from("invoices").update({ stripe_invoice_id: stripeInvoiceId }).eq("id", invoice.id);

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
      for (const itemId of createdItemIds) {
        try { await stripe.invoiceItems.del(itemId); } catch (_) {}
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

    // 4) Send invoice email (same template style as auto-invoice, simplified for interim)
    const positionsHtml = positions.map((p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${p.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(p.unit_price).toFixed(2)} €</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(p.quantity * p.unit_price).toFixed(2)} €</td>
      </tr>`).join("");

    const noticeHtml = stripeChargeFailed
      ? `<div style="background:#fff4e5;border:1px solid #ffb74d;border-radius:8px;padding:14px 16px;margin-top:20px;">
          <p style="margin:0;font-size:14px;color:#8a4b00;"><strong>⚠️ Hinweis: Automatischer Einzug nicht möglich</strong></p>
          <p style="margin:6px 0 0;font-size:13px;color:#8a4b00;">Der SEPA-Einzug ist fehlgeschlagen. Bei Rückfragen: <a href="mailto:buchhaltung@hfx-honorarfuchs.de" style="color:#8a4b00;">buchhaltung@hfx-honorarfuchs.de</a>.</p>
        </div>`
      : `<div style="background:#e8f4e8;border:1px solid #c3e6c3;border-radius:8px;padding:14px 16px;margin-top:20px;">
          <p style="margin:0;font-size:14px;color:#2d6a2d;"><strong>🔄 Automatischer Einzug (SEPA via Stripe)</strong></p>
          <p style="margin:6px 0 0;font-size:13px;color:#3d7a3d;">Der Betrag wird automatisch von Ihrem hinterlegten SEPA-Konto eingezogen.</p>
        </div>`;

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0b367f,#1a4a9e);color:#fff;padding:30px 20px;border-radius:8px 8px 0 0;text-align:center;">
    <img src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/fox-logo.jpeg" alt="Honorarfuchs" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;"/>
    <h1 style="margin:0;font-size:24px;">Zwischenabrechnung ${invoice.invoice_number}</h1>
    <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Honorarfuchs – HFX Sales Portal</p>
  </div>
  <div style="background:#f9fafb;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;">
    <p style="font-size:15px;color:#333;">Sehr geehrte Damen und Herren,</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">anbei erhalten Sie Ihre <strong>Zwischenabrechnung ${invoice.invoice_number}</strong> vom <strong>${fmtDeDate(todayStr)}</strong> für den Verbrauchszeitraum <strong>${fmtDeDate(periodFrom)} – ${fmtDeDate(periodTo)}</strong>.</p>
    <p style="color:#555;font-size:14px;"><strong>Rechnungsempfänger:</strong> ${contract.customer_name}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;">
      <thead><tr>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:left;font-size:12px;">Beschreibung</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Menge</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Einzelpreis</th>
        <th style="background:#0b367f;color:#fff;padding:10px 12px;text-align:right;font-size:12px;">Gesamt</th>
      </tr></thead>
      <tbody>${positionsHtml}</tbody>
    </table>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Nettobetrag:</span><strong>${netAmount.toFixed(2)} €</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6b7280;"><span>MwSt. (19%):</span><span>${taxAmount.toFixed(2)} €</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0b367f;margin-top:8px;font-size:16px;"><span><strong>Gesamtbetrag:</strong></span><strong style="color:#0b367f;">${grossAmount.toFixed(2)} €</strong></div>
    </div>
    ${noticeHtml}
    <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Diese Zwischenabrechnung wurde manuell ausgelöst.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">© Honorarfuchs – HFX Sales Portal</p>
  </div>
</div>
</body></html>`;

    const sendResult = await resend.emails.send({
      from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [emailTo],
      subject: `Zwischenabrechnung ${invoice.invoice_number} – ${contract.customer_name}`,
      html: emailHtml,
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
