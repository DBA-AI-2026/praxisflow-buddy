import Stripe from "npm:stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const log = (step: string, details?: unknown) =>
  console.log(`[stripe-webhook] ${step}${details ? " – " + JSON.stringify(details) : ""}`);

type ProductWithAgb = {
  name: string;
  agb_pdf_path: string | null;
};

const normalizeProductKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function findBestProductMatch(products: ProductWithAgb[], candidates: Array<string | null | undefined>) {
  const preparedCandidates = candidates
    .flatMap((candidate) => String(candidate || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (preparedCandidates.length === 0) return null;

  const exactMatch = products.find((product) =>
    preparedCandidates.some((candidate) => candidate.toLowerCase() === product.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  return products.find((product) => {
    const normalizedProduct = normalizeProductKey(product.name);
    return preparedCandidates.some((candidate) => {
      const normalizedCandidate = normalizeProductKey(candidate);
      return (
        normalizedCandidate === normalizedProduct ||
        normalizedCandidate.includes(normalizedProduct) ||
        normalizedProduct.includes(normalizedCandidate)
      );
    });
  }) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event: Stripe.Event;

  // Validate signature if secret is configured
  if (webhookSecret && sig) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      log("Webhook signature verification failed", String(err));
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    // Accept without signature in dev / when secret not yet configured
    event = JSON.parse(body) as Stripe.Event;
  }

  log("Event received", { type: event.type, id: event.id });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const source = session.metadata?.source;
      log("checkout.session.completed", { source, sessionId: session.id });

      // ─── DEMO BOOKING FLOW ──────────────────────────────────────────────
      if (source === "demo_booking") {
        await handleDemoBooking(supabase, stripe, session, RESEND_API_KEY);
      }

      // ─── CONTRACT ACTIVATION FLOW (digital) ─────────────────────────────
      if (source === "contract_activation") {
        await handleContractActivation(supabase, stripe, session);
      }


      // ─── SEPA MANDATE SETUP: Zahlungsmethode nach Setup speichern ───────
      if (source === "sepa_mandate_setup") {
        await handleSepaMandateSetup(supabase, stripe, session);
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const contractId = sub.metadata?.contract_id;
      if (contractId) {
        await supabase
          .from("contracts")
          .update({
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer as string,
          })
          .eq("id", contractId);
        log("Subscription linked to contract", { contractId, subscriptionId: sub.id });
      }
    }

    // ── invoice.paid: update invoice status, customer_revenues, create fibu_event ──
    if (event.type === "invoice.paid") {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const stripeInvoiceId = stripeInvoice.id;
      const paymentIntentId = typeof stripeInvoice.payment_intent === "string"
        ? stripeInvoice.payment_intent
        : (stripeInvoice.payment_intent as any)?.id ?? null;
      const stripeCustomerId = typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : (stripeInvoice.customer as any)?.id ?? null;

      // 1. Find invoice by stripe_invoice_id and mark as bezahlt
      const { data: inv } = await supabase
        .from("invoices")
        .update({ status: "bezahlt" })
        .eq("stripe_invoice_id", stripeInvoiceId)
        .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number")
        .maybeSingle();

      if (!inv) {
        log("invoice.paid – no matching invoice found for stripe_invoice_id", stripeInvoiceId);
        // Continue: still create fibu_event as Stripe-sourced reference
      }

      // 2. Update customer_revenues via invoice_number (robust 1:1 link through invoices table)
      if (inv?.invoice_number) {
        const { error: revErr } = await supabase
          .from("customer_revenues")
          .update({ payment_status: "paid", paid_at: new Date().toISOString() })
          .eq("invoice_number", inv.invoice_number);
        if (revErr) {
          log("customer_revenues update failed", revErr.message);
        } else {
          log("customer_revenues updated to paid for invoice", inv.invoice_number);
        }
      }

      // 3. Enrich with contract data: customer_id + product_name for complete FiBu tracing
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

      // 4. Create fibu_event
      // Point 3: If no HFX invoice was found (amounts would be 0, no verified mapping),
      // set status = 'draft' so an admin must manually approve it.
      // When a matched invoice exists, Stripe is authoritative → status = 'approved'.
      const fibuStatus = inv ? "approved" : "draft";
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
        // approved = Stripe-confirmed, matched HFX invoice; draft = unmatched, requires manual review
        status: fibuStatus,
        export_status: "open",
        description: `Zahlungseingang Stripe ${stripeInvoiceId}${inv?.invoice_number ? ` / ${inv.invoice_number}` : " (keine HFX-Rechnung gefunden)"}`,
        metadata: {
          stripe_invoice_id: stripeInvoiceId,
          payment_intent_id: paymentIntentId,
          stripe_customer_id: stripeCustomerId,
          hfx_invoice_number: inv?.invoice_number ?? null,
          unmatched: !inv,
        },
      } as any);

      if (fibuErr && (fibuErr as any).code !== "23505") {
        // 23505 = unique constraint violation (idempotent webhook retry) – silently ignore
        log("fibu_events insert failed for invoice.paid", fibuErr.message);
      }
      log("invoice.paid processed", { stripeInvoiceId, found: !!inv, fibuStatus, customerId, productName });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("Error processing event", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DEMO BOOKING: create contract + praxen entry after successful checkout
// ────────────────────────────────────────────────────────────────────────────
async function handleDemoBooking(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  resendKey?: string | null
) {
  const demoId = session.metadata?.demo_id;
  if (!demoId) {
    console.error("[stripe-webhook] demo_booking missing demo_id in metadata");
    return;
  }

  // Load demo download record
  const { data: demo, error: demoErr } = await supabase
    .from("demo_downloads")
    .select("*")
    .eq("id", demoId)
    .maybeSingle();
  if (demoErr || !demo) {
    console.error("[stripe-webhook] demo not found:", demoId, demoErr);
    return;
  }

  // Prevent duplicate contract creation
  const { data: existingContract } = await supabase
    .from("contracts")
    .select("id")
    .eq("hfx_customer_number", demo.hfx_customer_number)
    .eq("status", "aktiv")
    .maybeSingle();
  if (existingContract) {
    console.log("[stripe-webhook] contract already exists, skipping", existingContract.id);
    return;
  }

  // Retrieve subscription / customer from Stripe
  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null = null;
  if (session.subscription) {
    stripeSubscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  }
  if (session.customer) {
    stripeCustomerId = typeof session.customer === "string"
      ? session.customer
      : session.customer.id;
  }

  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  // Build contract record
  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .insert({
      customer_name: demo.contact_name || demo.company_name,
      praxis: demo.company_name,
      email: demo.email,
      telefon: demo.telefon,
      product_name: demo.product_name || "Demo-Buchung",
      modules: demo.product_name ? [demo.product_name] : [],
      monthly_price: session.amount_total ? session.amount_total / 100 / 1.19 : 0,
      hfx_customer_number: demo.hfx_customer_number,
      start_date: today,
      end_date: endDate.toISOString().split("T")[0],
      duration_months: 12,
      cancellation_period_months: 3,
      auto_renewal: true,
      payment_interval: "monatlich",
      status: "aktiv",
      approved_at: new Date().toISOString(),
      notes: `Automatisch erstellt via Stripe Checkout (Demo-Buchung) – Session: ${session.id}`,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
    } as any)
    .select()
    .single();
  if (contractErr || !contract) {
    console.error("[stripe-webhook] failed to create contract:", contractErr);
    return;
  }
  console.log("[stripe-webhook] contract created:", contract.id);

  // Create Praxen entry
  const { data: existingPraxis } = await supabase
    .from("praxen")
    .select("id")
    .eq("name", demo.company_name)
    .maybeSingle();
  if (!existingPraxis) {
    await supabase.from("praxen").insert({
      name: demo.company_name,
      email: demo.email,
      telefon: demo.telefon,
      produkt: demo.product_name,
      module: demo.product_name ? [demo.product_name] : [],
      buchungs_datum: today,
      status: "aktiv",
    });
  }

  // Update demo status
  await supabase.from("demo_downloads").update({ status: "kunde" }).eq("id", demoId);

  // Convert linked lead if any
  if (demo.hfx_customer_number) {
    await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", demo.hfx_customer_number);
  }

  // Send confirmation email
  if (resendKey && demo.email) {
    const productLabel = demo.product_name || "HFX-Produkt";
    const monthlyGross = session.amount_total ? (session.amount_total / 100).toFixed(2) : "–";
    const html = buildConfirmationEmail({
      contactName: demo.contact_name || demo.company_name,
      companyName: demo.company_name,
      productLabel,
      monthlyGross,
      startDate: today,
      contractId: contract.id,
      invoiceNumber: contract.invoice_number ?? null,
    });
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        to: [demo.email],
        subject: `✅ Buchungsbestätigung: ${productLabel}`,
        html,
      }),
    });
    console.log("[stripe-webhook] confirmation email sent to", demo.email);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CONTRACT ACTIVATION: link subscription to existing contract + ensure 3-tier records exist
// ────────────────────────────────────────────────────────────────────────────
async function handleContractActivation(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const contractId = session.metadata?.contract_id || session.client_reference_id;
  if (!contractId) {
    console.error("[stripe-webhook] contract_activation missing contract_id");
    return;
  }

  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null = null;

  if (session.subscription) {
    stripeSubscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as any).id;
  }
  if (session.customer) {
    stripeCustomerId = typeof session.customer === "string"
      ? session.customer
      : (session.customer as any).id;
  }

  // Load full contract details for downstream operations
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();

  const { error } = await supabase
    .from("contracts")
    .update({
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      status: "aktiv",
      approved_at: new Date().toISOString(),
    } as any)
    .eq("id", contractId);

  if (error) {
    console.error("[stripe-webhook] failed to update contract:", error);
    await supabase.from("audit_logs").insert({
      action: "CONTRACT_ACTIVATION_FAILED",
      resource_path: `/contracts/${contractId}`,
      success: false,
      details: JSON.stringify({
        contract_id: contractId,
        stripe_session_id: session.id,
        flow: "contract_activation",
        error: error.message,
      }),
      user_email: contract?.email ?? null,
    });
    return;
  }

  console.log("[stripe-webhook] contract activated via Stripe:", contractId);

  // ── 3-Tier Architecture: ensure customers record exists (Ebene 1) ────────
  // Upsert a customer record keyed on hfx_customer_number so the 3-tier
  // hierarchy (customer → contract → case) is complete for digital activations.
  if (contract?.hfx_customer_number) {
    const { error: custErr } = await supabase
      .from("customers")
      .upsert(
        {
          hfx_customer_number: contract.hfx_customer_number,
          praxis_name: contract.praxis || contract.customer_name || null,
          vorname: contract.vorname || null,
          nachname: contract.nachname || null,
          email: contract.email || null,
          telefon: contract.telefon || null,
          adresse: contract.adresse || null,
          plz: contract.plz || null,
          ort: contract.ort || null,
          bsnr: contract.bsnr || null,
          lanr: contract.lanr || null,
          mp_nr: contract.mp_nr || null,
        },
        { onConflict: "hfx_customer_number", ignoreDuplicates: false }
      );
    if (custErr) {
      console.error("[stripe-webhook] customers upsert failed:", custErr.message);
    } else {
      console.log("[stripe-webhook] customers record ensured for", contract.hfx_customer_number);

      // Link contract to customer record (customer_id) if not already set
      if (!contract.customer_id) {
        const { data: custRecord } = await supabase
          .from("customers")
          .select("id")
          .eq("hfx_customer_number", contract.hfx_customer_number)
          .maybeSingle();
        if (custRecord?.id) {
          await supabase
            .from("contracts")
            .update({ customer_id: custRecord.id } as any)
            .eq("id", contractId);
        }
      }
    }
  }

  // ── 3-Tier Architecture: create Neuabschluss case (Ebene 3) ─────────────
  // The unique partial index idx_contract_cases_neuabschluss_unique on
  // (contract_id) WHERE case_type = 'neuabschluss' makes this INSERT
  // idempotent: Stripe webhook retries will simply conflict and be silently
  // ignored, preventing duplicate neuabschluss records.
  const { error: caseErr } = await supabase
    .from("contract_cases")
    .insert({
      contract_id: contractId,
      customer_id: contract?.customer_id ?? null,
      case_type: "neuabschluss",
      status: "abgeschlossen",
      title: `Neuabschluss – ${contract?.product_name ?? "Produkt"}`,
      notes: `Automatisch erstellt bei digitalem Vertragsabschluss via Stripe (Session: ${session.id})`,
    } as any)
    .throwOnError();

  if (caseErr) {
    // Unique constraint violation (23505) = already exists → idempotent, ignore
    if ((caseErr as any).code === "23505") {
      console.log("[stripe-webhook] contract_case neuabschluss already exists (idempotent retry), skipping", contractId);
    } else {
      console.error("[stripe-webhook] contract_cases insert failed:", caseErr.message);
    }
  } else {
    console.log("[stripe-webhook] contract_case neuabschluss created for", contractId);
  }

  // ── Audit log: successful digital activation ─────────────────────────────
  await supabase.from("audit_logs").insert({
    action: "CONTRACT_ACTIVATED_DIGITAL",
    resource_path: `/contracts/${contractId}`,
    success: true,
    details: JSON.stringify({
      contract_id: contractId,
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      flow: "contract_activation",
      customer_name: contract?.customer_name ?? null,
      product_name: contract?.product_name ?? null,
      hfx_customer_number: contract?.hfx_customer_number ?? null,
      monthly_price: contract?.monthly_price ?? null,
    }),
    user_email: contract?.email ?? null,
  });
}


// ────────────────────────────────────────────────────────────────────────────
// SEPA MANDATE SETUP: Nach erfolgreichem Setup Zahlungsmethode speichern
// ────────────────────────────────────────────────────────────────────────────
async function handleSepaMandateSetup(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const contractId = session.metadata?.contract_id;
  if (!contractId) {
    console.error("[stripe-webhook] sepa_mandate_setup missing contract_id");
    return;
  }

  const stripeCustomerId = typeof session.customer === "string"
    ? session.customer
    : (session.customer as any)?.id;

  if (!stripeCustomerId) {
    console.error("[stripe-webhook] sepa_mandate_setup missing customer id");
    return;
  }

  // SetupIntent abrufen und Zahlungsmethode als Standard setzen
  if (session.setup_intent) {
    const setupIntentId = typeof session.setup_intent === "string"
      ? session.setup_intent
      : (session.setup_intent as any).id;
    try {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      if (setupIntent.payment_method) {
        const pmId = typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : (setupIntent.payment_method as any).id;
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: pmId },
        });
        log("SEPA payment method set as default", { stripeCustomerId, pmId });
      }
    } catch (err) {
      console.error("[stripe-webhook] Could not set default payment method:", err);
    }
  }

  // stripe_customer_id am Vertrag sichern
  const { error } = await supabase
    .from("contracts")
    .update({ stripe_customer_id: stripeCustomerId } as any)
    .eq("id", contractId);

  if (error) {
    console.error("[stripe-webhook] failed to save stripe_customer_id after mandate setup:", error);
  } else {
    log("SEPA mandate setup completed", { contractId, stripeCustomerId });
  }
}

// ────────────────────────────────────────────────────────────────────────────
function buildConfirmationEmail(params: {
  contactName: string;
  companyName: string;
  productLabel: string;
  monthlyGross: string;
  startDate: string;
  contractId: string;
  invoiceNumber: string | null;
}) {
  const { contactName, companyName, productLabel, monthlyGross, startDate } = params;
  const startFormatted = new Date(startDate + "T00:00:00").toLocaleDateString("de-DE");
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 40px;text-align:center;">
        <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">✅ Buchungsbestätigung</p>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:6px 0 0;">HFX Honorarfuchs – Herzlich willkommen!</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <p style="font-size:16px;color:#1a1a2e;margin:0 0 16px;">Guten Tag ${contactName},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
          vielen Dank für Ihre Buchung! Ihre Zahlung war erfolgreich und Ihr Abonnement ist nun aktiv.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px;">
          <tr><td style="padding:20px 24px;">
            <p style="color:#0b367f;font-size:14px;font-weight:700;margin:0 0 12px;">📋 Ihre Buchungsübersicht</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Unternehmen</td><td style="font-size:13px;color:#111827;font-weight:500;">${companyName}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Produkt</td><td style="font-size:13px;color:#111827;">${productLabel}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Monatlicher Betrag</td><td style="font-size:13px;color:#0b367f;font-weight:600;">${monthlyGross} € (inkl. MwSt.)</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Vertragsbeginn</td><td style="font-size:13px;color:#111827;">${startFormatted}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Zahlung</td><td style="font-size:13px;color:#111827;">Automatisch via Stripe (monatlich)</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
          Ihr zuständiger Außendienstmitarbeiter wird sich in Kürze mit Ihnen in Verbindung setzen, um die Einrichtung zu begleiten.
        </p>
        <p style="font-size:15px;color:#374151;margin:0;">Mit freundlichen Grüßen,<br><strong>Ihr HFX Honorarfuchs Team</strong></p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
