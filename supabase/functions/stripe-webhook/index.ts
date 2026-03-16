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

      // ─── PAPER CONTRACT: activate after customer payment ────────────────
      if (source === "paper_contract_confirmation") {
        await handlePaperContractPayment(supabase, stripe, session);
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
// CONTRACT ACTIVATION: link subscription to existing contract
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

  // Load contract details before update for audit log
  const { data: contractBefore } = await supabase
    .from("contracts")
    .select("customer_name, product_name, hfx_customer_number, email, monthly_price")
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
    // Log failed attempt
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
      user_email: contractBefore?.email ?? null,
    });
  } else {
    console.log("[stripe-webhook] contract activated via Stripe:", contractId);
    // Log successful digital contract activation
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
        customer_name: contractBefore?.customer_name ?? null,
        product_name: contractBefore?.product_name ?? null,
        hfx_customer_number: contractBefore?.hfx_customer_number ?? null,
        monthly_price: contractBefore?.monthly_price ?? null,
      }),
      user_email: contractBefore?.email ?? null,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PAPER CONTRACT PAYMENT: activate existing eingegangen contract after payment
// ────────────────────────────────────────────────────────────────────────────
async function handlePaperContractPayment(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const contractId = session.metadata?.contract_id;
  if (!contractId) {
    console.error("[stripe-webhook] paper_contract_confirmation missing contract_id");
    return;
  }

  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null = null;
  if (session.subscription) {
    stripeSubscriptionId = typeof session.subscription === "string"
      ? session.subscription : (session.subscription as any).id;
  }
  if (session.customer) {
    stripeCustomerId = typeof session.customer === "string"
      ? session.customer : (session.customer as any).id;
  }

  const now = new Date().toISOString();

  // Activate the contract
  const { error: updateError } = await supabase
    .from("contracts")
    .update({
      status: "aktiv",
      approved_at: now,
      customer_confirmed_at: now,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
    } as any)
    .eq("id", contractId);

  if (updateError) {
    console.error("[stripe-webhook] failed to activate paper contract:", updateError);
    await supabase.from("audit_logs").insert({
      action: "CONTRACT_ACTIVATION_FAILED",
      resource_path: `/contracts/${contractId}`,
      success: false,
      details: JSON.stringify({
        contract_id: contractId,
        stripe_session_id: session.id,
        flow: "paper_contract_confirmation",
        error: updateError.message,
      }),
    });
    return;
  }
  log("Paper contract activated after payment", { contractId });

  // Load contract to create praxen entry
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();

  if (!contract) return;

  // Log successful paper contract activation
  await supabase.from("audit_logs").insert({
    action: "CONTRACT_ACTIVATED_PAPER",
    resource_path: `/contracts/${contractId}`,
    success: true,
    details: JSON.stringify({
      contract_id: contractId,
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      flow: "paper_contract_confirmation",
      customer_name: contract.customer_name,
      product_name: contract.product_name,
      hfx_customer_number: contract.hfx_customer_number,
      monthly_price: contract.monthly_price,
    }),
    user_email: contract.email ?? null,
  });

  // Create praxen entry if not already exists
  const { data: existingPraxis } = await supabase
    .from("praxen")
    .select("id")
    .eq("name", contract.praxis || contract.customer_name)
    .maybeSingle();

  if (!existingPraxis) {
    let leadId: string | null = null;
    if (contract.hfx_customer_number) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("hfx_customer_number", contract.hfx_customer_number)
        .maybeSingle();
      if (lead) leadId = lead.id;
    }

    const praxisData: Record<string, unknown> = {
      name: contract.praxis || contract.customer_name,
      adresse: contract.adresse || null,
      plz: contract.plz || null,
      ort: contract.ort || null,
      telefon: contract.telefon || null,
      email: contract.email || null,
      mp_nr: contract.mp_nr || null,
      produkt: contract.product_name,
      status: "aktiv",
      buchungs_datum: contract.start_date,
      preis: contract.monthly_price,
    };
    if (leadId) {
      praxisData.converted_from_lead_id = leadId;
      await supabase.from("leads").update({ status: "kunde" }).eq("id", leadId);
    }
    await supabase.from("praxen").insert(praxisData);
    log("Praxen entry created for paper contract", { contractId });
  }

  // Send post-payment Vertragsbestätigung email with PDF attachments
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && contract.email) {
    try {
      await sendVertragsbestaetigung(contract, resendKey, supabase);
      log("Vertragsbestätigung email sent", { contractId });
    } catch (mailErr) {
      console.error("[stripe-webhook] Failed to send Vertragsbestätigung:", mailErr);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST-PAYMENT EMAIL: Vertragsbestätigung with summary PDF + AGB PDF
// ────────────────────────────────────────────────────────────────────────────
async function sendVertragsbestaetigung(
  contract: Record<string, any>,
  resendKey: string,
  supabase: ReturnType<typeof createClient>
) {
  const { PDFDocument, rgb, StandardFonts } = await import("npm:pdf-lib");

  const monthlyNet = Number(contract.monthly_price) || 0;
  const monthlyGross = monthlyNet * 1.19;
  const startFormatted = contract.start_date
    ? new Date(contract.start_date + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "–";
  const grossFormatted = monthlyGross.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const netFormatted = monthlyNet.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Generate contract summary PDF ──────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const navy = rgb(0.043, 0.212, 0.498);
  const black = rgb(0.067, 0.067, 0.173);
  const gray = rgb(0.42, 0.44, 0.5);
  const white = rgb(1, 1, 1);

  const { width, height } = page.getSize();
  const margin = 50;

  // Header background
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: navy });
  page.drawText("🦊 HFX Honorarfuchs", { x: margin, y: height - 45, size: 22, font: boldFont, color: white });
  page.drawText("Vertragsbestätigung", { x: margin, y: height - 65, size: 13, font: regularFont, color: rgb(0.85, 0.9, 1) });

  let y = height - 130;
  const lineH = 22;
  const labelX = margin;
  const valueX = margin + 200;

  const drawRow = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: labelX, y, size: 11, font: regularFont, color: gray });
    page.drawText(value || "–", { x: valueX, y, size: 11, font: bold ? boldFont : regularFont, color: black });
    y -= lineH;
  };

  page.drawText("Ihre Vertragsdetails", { x: margin, y, size: 14, font: boldFont, color: navy });
  y -= lineH * 1.5;

  if (contract.hfx_customer_number) drawRow("HFX-Kundennummer", contract.hfx_customer_number, true);
  drawRow("Praxis", contract.praxis || contract.customer_name);
  drawRow("Ansprechpartner", [contract.vorname, contract.nachname].filter(Boolean).join(" ") || "–");
  drawRow("Produkt", contract.product_name);
  if (contract.fachrichtung) drawRow("Fachrichtung", contract.fachrichtung);
  if (contract.rechtsform) drawRow("Rechtsform", contract.rechtsform);
  if (contract.bsnr) drawRow("BSNR", contract.bsnr);
  if (contract.lanr) drawRow("LANR", contract.lanr);

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.85, 0.88, 0.92) });
  y -= lineH;

  page.drawText("Konditionen", { x: margin, y, size: 14, font: boldFont, color: navy });
  y -= lineH * 1.5;

  drawRow("Vertragsbeginn", startFormatted);
  drawRow("Monatspreis netto", `${netFormatted} €`);
  drawRow("Monatspreis brutto (inkl. 19% MwSt.)", `${grossFormatted} €`, true);
   drawRow("Laufzeit", "Unbefristet");
  drawRow("Zahlung", "Automatisch via Stripe (monatlich)");

  y -= 20;
  page.drawText("Mit Ihrer Zahlung haben Sie die AGB der HFX Honorarfuchs GmbH akzeptiert.", {
    x: margin, y, size: 10, font: regularFont, color: gray,
  });
  y -= 16;
  page.drawText("Eine Kündigung ist jederzeit mit 6 Monaten Frist zum Monatsende möglich.", {
    x: margin, y, size: 10, font: regularFont, color: gray,
  });

  // Footer
  page.drawRectangle({ x: 0, y: 0, width, height: 40, color: rgb(0.97, 0.98, 0.99) });
  page.drawText("HFX Honorarfuchs GmbH  ·  info@hfx-honorarfuchs.de  ·  www.hfx-honorarfuchs.de", {
    x: margin, y: 14, size: 9, font: regularFont, color: gray,
  });

  const summaryPdfBytes = await pdfDoc.save();
  const summaryPdfBase64 = btoa(String.fromCharCode(...summaryPdfBytes));

  // ── Fetch AGB PDF ──────────────────────────────────────────────────────────
  const attachments: Array<{ filename: string; content: string }> = [
    { filename: "Vertragsbestaetigung-HFX.pdf", content: summaryPdfBase64 },
  ];

  try {
    let agbBase64: string | undefined;
    let agbFilename = "AGB-HFX-Honorarfuchs.pdf";

    // Look up product-specific AGB (supports legacy labels like "HFX.GOÄ")
    const { data: productsWithAgb } = await supabase
      .from("products")
      .select("name, agb_pdf_path")
      .not("agb_pdf_path", "is", null);

    const matchedProduct = findBestProductMatch((productsWithAgb ?? []) as ProductWithAgb[], [
      contract.product_name,
      ...(Array.isArray(contract.modules) ? contract.modules : []),
    ]);

    if (matchedProduct?.agb_pdf_path) {
      const { data: signed } = await supabase.storage
        .from("contracts")
        .createSignedUrl(matchedProduct.agb_pdf_path, 300);
      if (signed?.signedUrl) {
        const agbRes = await fetch(signed.signedUrl);
        if (agbRes.ok) {
          const agbBytes = new Uint8Array(await agbRes.arrayBuffer());
          agbBase64 = btoa(String.fromCharCode(...agbBytes));
          const safeName = (matchedProduct.name || "Honorarfuchs").replace(/[^a-zA-Z0-9äöüÄÖÜß\-_.]/g, "_");
          agbFilename = `AGB-${safeName}.pdf`;
        }
      }
    }

    // Fallback to generic AGB
    if (!agbBase64) {
      const agbUrl = "https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf";
      const agbRes = await fetch(agbUrl);
      if (agbRes.ok) {
        const agbBytes = new Uint8Array(await agbRes.arrayBuffer());
        agbBase64 = btoa(String.fromCharCode(...agbBytes));
      }
    }

    if (agbBase64) {
      attachments.push({ filename: agbFilename, content: agbBase64 });
    }
  } catch (agbErr) {
    console.error("[stripe-webhook] Could not fetch AGB PDF:", agbErr);
  }

  const greeting = contract.vorname ? `${contract.vorname} ${contract.nachname || ""}`.trim() : contract.customer_name;
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Verdana,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-width:600px;">
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:36px 40px;text-align:center;">
        <p style="color:#fff;font-size:24px;font-weight:700;margin:0;">🦊 HFX Honorarfuchs</p>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">✅ Ihr Vertrag ist jetzt aktiv</p>
      </td></tr>
      <tr><td style="padding:36px 40px 24px;">
        <p style="color:#1a1a2e;font-size:16px;margin:0 0 12px;">Guten Tag ${greeting},</p>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
          vielen Dank für Ihre Buchung! Ihre Zahlung war erfolgreich und Ihr Vertrag ist nun aktiv.<br>
          Im Anhang finden Sie Ihre <strong>Vertragsbestätigung als PDF</strong> sowie die <strong>Allgemeinen Geschäftsbedingungen</strong>.
        </p>
      </td></tr>
      <tr><td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <tr><td style="background:#0b367f;padding:12px 20px;">
            <p style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0;">📋 Ihre Buchungsübersicht</p>
          </td></tr>
          <tr><td style="padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${contract.hfx_customer_number ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:180px;">HFX-Kundennummer</td><td style="font-size:13px;color:#111827;font-family:monospace;font-weight:600;">${contract.hfx_customer_number}</td></tr>` : ""}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Produkt</td><td style="font-size:13px;color:#111827;font-weight:600;">${contract.product_name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Monatspreis brutto</td><td style="font-size:13px;color:#0b367f;font-weight:700;">${grossFormatted} €</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Vertragsbeginn</td><td style="font-size:13px;color:#111827;">${startFormatted}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Kündigung</td><td style="font-size:13px;color:#111827;">Unbefristet · 6 Monate Frist</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 40px 32px;">
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">
          Bei Fragen stehen wir Ihnen gerne unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a> zur Verfügung.<br><br>
          Mit freundlichen Grüßen,<br><strong>Ihr HFX Honorarfuchs Team</strong>
        </p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">HFX Honorarfuchs • Diese E-Mail wurde automatisch generiert.<br>© ${new Date().getFullYear()} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [contract.email],
      subject: `✅ Vertragsbestätigung HFX${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`,
      html,
      attachments: attachments.map(({ filename, content }) => ({
        filename,
        content,
        type: "application/pdf",
      })),
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    throw new Error(`Resend error: ${errText}`);
  }
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
