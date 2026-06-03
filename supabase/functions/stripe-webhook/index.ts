import Stripe from "npm:stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_V2") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const log = (step: string, details?: unknown) =>
  console.log(`[stripe-webhook] ${step}${details ? " – " + JSON.stringify(details) : ""}`);

// ─────────────────────────────────────────────────────────────────────────────
// Idempotenz-Hilfsfunktionen
//
// Status-Modell:
//   processing → Event wird gerade verarbeitet (Partial-Unique schützt gegen Race)
//   processed  → Erfolgreich abgeschlossen (finale Duplikat-Sperre)
//   error      → Fehlgeschlagen, kein Unique-Schutz → Retry darf erneut verarbeiten
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Versucht einen Stripe-Event als "processing" zu registrieren.
 *
 * Gibt "new"       zurück → Event ist neu, Verarbeitung soll starten.
 * Gibt "duplicate" zurück → Event ist bereits "processed" oder "processing" → skip.
 * Gibt "retry"     zurück → Event hatte vorher "error" → wurde gelöscht, neu anlegen.
 *
 * Partial-Unique-Index greift nur auf status IN ('processed', 'processing'),
 * sodass "error"-Einträge beim Retry gelöscht und neu angelegt werden können.
 */
async function claimEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  eventType: string,
  meta?: Record<string, unknown>
): Promise<"new" | "duplicate" | "retry"> {
  // Prüfe ob der Event bereits existiert und in welchem Status
  const { data: existing } = await supabase
    .from("processed_stripe_events")
    .select("id, status")
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "processed" || existing.status === "processing") {
      // Echtes Duplikat: bereits erfolgreich verarbeitet oder läuft gerade → skip
      log("Duplicate event ignored (idempotent)", { eventId, eventType, status: existing.status });
      return "duplicate";
    }
    // status === "error": vorheriger Versuch fehlgeschlagen → für Retry löschen
    log("Previous error found – deleting for retry", { eventId, eventType });
    await supabase
      .from("processed_stripe_events")
      .delete()
      .eq("stripe_event_id", eventId)
      .eq("status", "error");
  }

  // Neu anlegen mit status "processing"
  const { error: insertErr } = await supabase
    .from("processed_stripe_events")
    .insert({ stripe_event_id: eventId, event_type: eventType, status: "processing", metadata: meta ?? null });

  if (insertErr) {
    if ((insertErr as any).code === "23505") {
      // Race Condition: anderer Request hat gerade auch processing gesetzt → skip
      log("Race condition: event claimed by parallel execution, skipping", { eventId });
      return "duplicate";
    }
    // Unerwarteter Fehler → trotzdem verarbeiten, aber warnen
    log("WARN: could not register event in processed_stripe_events", { eventId, error: insertErr.message });
  }
  return existing?.status === "error" ? "retry" : "new";
}

/**
 * Markiert den Event als erfolgreich abgeschlossen.
 * Erst jetzt greift der finale Duplikat-Schutz (status=processed).
 */
async function markEventProcessed(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<void> {
  await supabase
    .from("processed_stripe_events")
    .update({ status: "processed" })
    .eq("stripe_event_id", eventId);
}

/**
 * Markiert einen Event als fehlgeschlagen.
 * status=error → kein Unique-Schutz → nächster Stripe-Retry darf erneut verarbeiten.
 */
async function markEventFailed(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from("processed_stripe_events")
    .update({ status: "error", error_message: errorMessage })
    .eq("stripe_event_id", eventId);

  // Auch in audit_logs für Admin-Transparenz
  await supabase.from("audit_logs").insert({
    action: "STRIPE_WEBHOOK_ERROR",
    resource_path: `/stripe/events/${eventId}`,
    success: false,
    details: JSON.stringify({ stripe_event_id: eventId, error: errorMessage }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Produkt-Matching Hilfsfunktionen
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Handler
// ─────────────────────────────────────────────────────────────────────────────

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

  // Signatur-Validierung
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
    // Ohne Secret (Dev-Modus) – im Prod-Betrieb sollte STRIPE_WEBHOOK_SECRET immer gesetzt sein
    event = JSON.parse(body) as Stripe.Event;
  }

  log("Event received", { type: event.type, id: event.id });

  // ── Idempotenz-Check ──────────────────────────────────────────────────────
  // "new"       → frischer Event, Verarbeitung starten
  // "retry"     → vorheriger Versuch fehlgeschlagen (status=error gelöscht), erneut verarbeiten
  // "duplicate" → bereits "processed" oder "processing" → sofort 200 zurückgeben
  const claimResult = await claimEvent(supabase, event.id, event.type, { event_type: event.type });
  if (claimResult === "duplicate") {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  log("Processing event", { claimResult, type: event.type, id: event.id });
  // ─────────────────────────────────────────────────────────────────────────

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const source = session.metadata?.source;
      log("checkout.session.completed", { source, sessionId: session.id });

      // DEPRECATED — alte Stripe-Welt, Branch deaktiviert am 08.05.2026 — handleDemoBooking wird nicht mehr aufgerufen
      if (source === "demo_booking") {
        console.warn("[DEPRECATED][stripe-webhook][demo_booking] Event received but ignored", {
          stripeEventId: event.id,
          sessionId: session.id,
          customer: session.customer,
          timestamp: new Date().toISOString(),
        });
      }

      // DEPRECATED — alte Stripe-Welt, Branch deaktiviert am 08.05.2026
      if (source === "contract_activation") {
        console.warn("[DEPRECATED][stripe-webhook][contract_activation] Event received but ignored", {
          stripeEventId: event.id,
          sessionId: session.id,
          customer: session.customer,
          timestamp: new Date().toISOString(),
        });
      }

      if (source === "sepa_mandate_setup") {
        await handleSepaMandateSetup(supabase, stripe, session);
      }
    }

    // DEPRECATED — alte Stripe-Welt, Subscription-Branches deaktiviert am 08.05.2026 — keine aktiven Subscriptions mehr im Live-Mode (verifiziert 08.05.2026)
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      console.warn("[DEPRECATED][stripe-webhook][customer.subscription.*] Event received but ignored", {
        stripeEventId: event.id,
        eventType: event.type,
        subscriptionId: sub.id,
        customer: sub.customer,
        contractId: sub.metadata?.contract_id ?? null,
        timestamp: new Date().toISOString(),
      });
    }

    // ── invoice.paid / invoice.payment_succeeded: update invoice status, create fibu_event ──
    // Stripe sendet beide Events synonym. Beide Pfade laufen identisch; Doppel-FiBu-Events
    // werden vom Partial-Unique-Index auf (source_reference_id, event_type) abgefangen.
    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const stripeInvoiceId = stripeInvoice.id;
      const paymentIntentId = typeof stripeInvoice.payment_intent === "string"
        ? stripeInvoice.payment_intent
        : (stripeInvoice.payment_intent as any)?.id ?? null;
      const stripeCustomerId = typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : (stripeInvoice.customer as any)?.id ?? null;

      // 1. Rechnung nur auf "bezahlt" setzen wenn noch nicht bezahlt
      const { data: inv } = await supabase
        .from("invoices")
        .update({ status: "bezahlt" })
        .eq("stripe_invoice_id", stripeInvoiceId)
        .neq("status", "bezahlt")
        .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number")
        .maybeSingle();

      let existingInv = inv;
      if (!inv) {
        const { data: alreadyPaid } = await supabase
          .from("invoices")
          .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number")
          .eq("stripe_invoice_id", stripeInvoiceId)
          .maybeSingle();
        existingInv = alreadyPaid;
        if (alreadyPaid) {
          log(`${event.type} – invoice already marked bezahlt (idempotent)`, stripeInvoiceId);
        } else {
          log(`${event.type} – no matching HFX invoice found`, stripeInvoiceId);
        }
      }

      // Phase 2: customer_revenues UPDATE entfernt – Zahlungsstatus wird über invoices.status = 'bezahlt' abgebildet.

      // 3. Vertragsdaten für FiBu-Tracing
      let customerId: string | null = null;
      let productName: string | null = null;
      if (existingInv?.contract_id) {
        const { data: ctr } = await supabase
          .from("contracts")
          .select("customer_id, product_name")
          .eq("id", existingInv.contract_id)
          .maybeSingle();
        customerId = ctr?.customer_id ?? null;
        productName = ctr?.product_name ?? null;
      }

      // 4. fibu_event erstellen
      const fibuStatus = existingInv ? "approved" : "draft";
      const { error: fibuErr } = await supabase.from("fibu_events").insert({
        event_type: "payment_received_reference",
        source_module: "stripe",
        source_reference_id: stripeInvoiceId,
        contract_id: existingInv?.contract_id ?? null,
        customer_id: customerId,
        product_name: productName,
        amount_net: existingInv ? Number(existingInv.net_amount) : 0,
        tax_amount: existingInv ? Number(existingInv.tax_amount) : 0,
        amount_gross: existingInv ? Number(existingInv.gross_amount) : 0,
        occurred_at: new Date().toISOString(),
        status: fibuStatus,
        export_status: "open",
        description: `Zahlungseingang Stripe ${stripeInvoiceId}${existingInv?.invoice_number ? ` / ${existingInv.invoice_number}` : " (keine HFX-Rechnung gefunden)"}`,
        metadata: {
          stripe_invoice_id: stripeInvoiceId,
          payment_intent_id: paymentIntentId,
          stripe_customer_id: stripeCustomerId,
          hfx_invoice_number: existingInv?.invoice_number ?? null,
          unmatched: !existingInv,
          stripe_event_type: event.type,
        },
      } as any);

      if (fibuErr) {
        if ((fibuErr as any).code === "23505") {
          log("fibu_event payment_received_reference already exists (idempotent)", stripeInvoiceId);
        } else {
          log(`ERROR: fibu_events insert failed for ${event.type}`, fibuErr.message);
          await markEventFailed(supabase, event.id, `fibu_events insert failed: ${fibuErr.message}`);
        }
      }
      log(`${event.type} processed`, { stripeInvoiceId, found: !!existingInv, fibuStatus, customerId, productName });
    }

    // ── invoice.payment_failed: Rechnung auf "zahlung_fehlgeschlagen" setzen, FiBu-Audit, Buchhaltung benachrichtigen ──
    if (event.type === "invoice.payment_failed") {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const stripeInvoiceId = stripeInvoice.id;
      const paymentIntentId = typeof stripeInvoice.payment_intent === "string"
        ? stripeInvoice.payment_intent
        : (stripeInvoice.payment_intent as any)?.id ?? null;
      const stripeCustomerId = typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : (stripeInvoice.customer as any)?.id ?? null;
      const failureMessage =
        (stripeInvoice as any)?.last_finalization_error?.message ??
        (stripeInvoice as any)?.last_payment_error?.message ??
        null;

      // 1. HFX-Rechnung auf "zahlung_fehlgeschlagen" setzen (nur wenn nicht bereits bezahlt/storniert)
      const { data: failedInv } = await supabase
        .from("invoices")
        .update({ status: "zahlung_fehlgeschlagen" })
        .eq("stripe_invoice_id", stripeInvoiceId)
        .not("status", "in", "(bezahlt,storniert)")
        .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number, customer_name, rechnungs_email")
        .maybeSingle();

      let existingInv = failedInv;
      if (!failedInv) {
        const { data: anyInv } = await supabase
          .from("invoices")
          .select("id, invoice_number, contract_id, net_amount, tax_amount, gross_amount, customer_number, customer_name, rechnungs_email")
          .eq("stripe_invoice_id", stripeInvoiceId)
          .maybeSingle();
        existingInv = anyInv;
        if (anyInv) {
          log("invoice.payment_failed – invoice in finalem Status (bezahlt/storniert), kein Update", stripeInvoiceId);
        } else {
          log("invoice.payment_failed – no matching HFX invoice found", stripeInvoiceId);
        }
      }

      // 2. Vertragsdaten
      let customerId: string | null = null;
      let productName: string | null = null;
      if (existingInv?.contract_id) {
        const { data: ctr } = await supabase
          .from("contracts")
          .select("customer_id, product_name")
          .eq("id", existingInv.contract_id)
          .maybeSingle();
        customerId = ctr?.customer_id ?? null;
        productName = ctr?.product_name ?? null;
      }

      // 3. fibu_event Audit-Eintrag (Beträge der Rechnung, nicht 0)
      const fibuStatus = existingInv ? "approved" : "draft";
      const { error: fibuErr } = await supabase.from("fibu_events").insert({
        event_type: "payment_failed_reference",
        source_module: "stripe",
        source_reference_id: stripeInvoiceId,
        contract_id: existingInv?.contract_id ?? null,
        customer_id: customerId,
        product_name: productName,
        amount_net: existingInv ? Number(existingInv.net_amount) : 0,
        tax_amount: existingInv ? Number(existingInv.tax_amount) : 0,
        amount_gross: existingInv ? Number(existingInv.gross_amount) : 0,
        occurred_at: new Date().toISOString(),
        status: fibuStatus,
        export_status: "open",
        description: `Zahlung fehlgeschlagen Stripe ${stripeInvoiceId}${existingInv?.invoice_number ? ` / ${existingInv.invoice_number}` : " (keine HFX-Rechnung gefunden)"}${failureMessage ? ` – ${failureMessage}` : ""}`,
        metadata: {
          stripe_invoice_id: stripeInvoiceId,
          payment_intent_id: paymentIntentId,
          stripe_customer_id: stripeCustomerId,
          hfx_invoice_number: existingInv?.invoice_number ?? null,
          unmatched: !existingInv,
          failure_message: failureMessage,
        },
      } as any);

      if (fibuErr) {
        if ((fibuErr as any).code === "23505") {
          log("fibu_event payment_failed_reference already exists (idempotent)", stripeInvoiceId);
        } else {
          log("ERROR: fibu_events insert failed for invoice.payment_failed", fibuErr.message);
          await markEventFailed(supabase, event.id, `fibu_events insert failed: ${fibuErr.message}`);
        }
      }

      // 4. Mail an Buchhaltung – nur bei FINAL fehlgeschlagener Zahlung.
      //    Stripe retryt SEPA-Lastschriften mehrfach (next_payment_attempt != null).
      //    Solange ein weiterer Versuch ansteht, wird die Buchhaltung nicht alarmiert.
      const nextAttempt = (stripeInvoice as any)?.next_payment_attempt ?? null;
      const attemptCount = (stripeInvoice as any)?.attempt_count ?? 0;
      const isFinalFailure = nextAttempt === null || attemptCount >= 3;

      if (!isFinalFailure) {
        log("invoice.payment_failed – nicht final, Stripe retryt (keine Mail)", {
          stripeInvoiceId,
          nextAttempt,
          attemptCount,
        });
      } else try {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (!resendKey) {
          log("WARN: RESEND_API_KEY not configured, skipping payment_failed notification", stripeInvoiceId);
        } else {
          const subject = `Stripe-Lastschrift fehlgeschlagen – ${existingInv?.invoice_number ?? stripeInvoiceId}`;
          const html = `
            <h2>Stripe-Lastschrift fehlgeschlagen</h2>
            <p>Eine Lastschrift wurde von Stripe als fehlgeschlagen gemeldet.</p>
            <table style="border-collapse:collapse">
              <tr><td><b>HFX-Rechnung:</b></td><td>${existingInv?.invoice_number ?? "—"}</td></tr>
              <tr><td><b>Stripe-Invoice-ID:</b></td><td>${stripeInvoiceId}</td></tr>
              <tr><td><b>Kunde:</b></td><td>${existingInv?.customer_name ?? "—"} (${existingInv?.customer_number ?? "—"})</td></tr>
              <tr><td><b>Brutto:</b></td><td>${existingInv ? Number(existingInv.gross_amount).toFixed(2) : "—"} €</td></tr>
              <tr><td><b>Stripe-Customer:</b></td><td>${stripeCustomerId ?? "—"}</td></tr>
              <tr><td><b>Fehler:</b></td><td>${failureMessage ?? "—"}</td></tr>
            </table>
            <p>HFX-Rechnungsstatus wurde auf <b>zahlung_fehlgeschlagen</b> gesetzt (sofern nicht bereits bezahlt/storniert).</p>
          `;
          const mailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "HFX Sales Portal <noreply@hfx-honorarfuchs.de>",
              reply_to: "info@hfx-honorarfuchs.de",
              to: ["buchhaltung@hfx-honorarfuchs.de"],
              subject,
              html,
            }),
          });
          if (!mailRes.ok) {
            const txt = await mailRes.text();
            log("WARN: Resend payment_failed mail failed", { status: mailRes.status, body: txt });
          } else {
            log("invoice.payment_failed mail sent to buchhaltung", stripeInvoiceId);
          }
        }
      } catch (mailErr) {
        log("WARN: payment_failed mail exception", String(mailErr));
      }

      log("invoice.payment_failed processed", { stripeInvoiceId, found: !!existingInv, fibuStatus, customerId, productName });
    }

    // ── Erfolgreiche Verarbeitung: Status auf "processed" setzen ─────────────
    // Ab jetzt greift der finale Duplikat-Schutz (Partial-Unique auf status=processed).
    // Weitere Stripe-Retries werden sauber geblockt.
    await markEventProcessed(supabase, event.id);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = String(err);
    log("FATAL: uncaught error processing event", errMsg);
    // markEventFailed setzt status auf "error" → kein Unique-Schutz mehr
    // → nächster Stripe-Retry (after 500) wird als "retry" behandelt und erneut verarbeitet
    await markEventFailed(supabase, event.id, errMsg);
    // 500 → Stripe stellt den Event erneut zu
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEMO BOOKING: create contract + praxen entry after successful checkout
// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — wird seit 08.05.2026 nicht mehr aufgerufen, kann nach 2-3 Wochen Beobachtung entfernt werden
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

  const { data: demo, error: demoErr } = await supabase
    .from("demo_downloads")
    .select("*")
    .eq("id", demoId)
    .maybeSingle();
  if (demoErr || !demo) {
    console.error("[stripe-webhook] demo not found:", demoId, demoErr);
    return;
  }

  // Idempotenz: Vertrag bereits erstellt?
  const { data: existingContract } = await supabase
    .from("contracts")
    .select("id")
    .eq("hfx_customer_number", demo.hfx_customer_number)
    .eq("status", "aktiv")
    .maybeSingle();
  if (existingContract) {
    log("demo_booking: contract already exists (idempotent skip)", existingContract.id);
    return;
  }

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
  log("demo_booking: contract created", contract.id);

  // Praxis-Eintrag (idempotent via name-Check)
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

  await supabase.from("demo_downloads").update({ status: "kunde" }).eq("id", demoId);

  if (demo.hfx_customer_number) {
    await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", demo.hfx_customer_number);
  }

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
      invoiceNumber: (contract as any).invoice_number ?? null,
    });
    const emailResult = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        to: [demo.email],
        subject: `✅ Buchungsbestätigung: ${productLabel}`,
        html,
      }),
    });
    if (!emailResult.ok) {
      const errBody = await emailResult.text();
      log("WARN: confirmation email failed", { status: emailResult.status, body: errBody });
    } else {
      log("Confirmation email sent", demo.email);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT ACTIVATION
// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — wird seit 08.05.2026 nicht mehr aufgerufen, kann nach 2-3 Wochen Beobachtung entfernt werden
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

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();

  // Idempotenz: Vertrag bereits aktiv? (z.B. durch schnelle Doppel-Delivery)
  if (contract?.status === "aktiv" && contract?.stripe_subscription_id === stripeSubscriptionId) {
    log("contract_activation: already active with same subscription (idempotent skip)", contractId);
    return;
  }

  const { error } = await supabase
    .from("contracts")
    .update({
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      status: "aktiv",
      approved_at: new Date().toISOString(),
    } as any)
    .eq("id", contractId);

  // Multi-Standort Self-Heal: customers.stripe_customer_id idempotent (NULL-only)
  if (!error && contract?.customer_id && stripeCustomerId) {
    try {
      await supabase
        .from("customers")
        .update({ stripe_customer_id: stripeCustomerId } as any)
        .eq("id", contract.customer_id)
        .is("stripe_customer_id", null);
    } catch (healEx) {
      log("WARN: customers self-heal (contract_activation) failed", String(healEx));
    }
  }

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

  log("Contract activated via Stripe", contractId);

  // ── customer_events: spiegele Status-Wechsel (Business-Event, additiv) ──
  // Quelle ist immer "eingegangen" → "aktiv" über diesen Flow. Fire-and-forget.
  try {
    const { error: ceError } = await supabase.from("customer_events").insert({
      event_type: "CONTRACT_STATUS_CHANGED",
      entity_type: "contract",
      entity_id: contractId,
      hfx_customer_number: contract?.hfx_customer_number ?? null,
      contract_id: contractId,
      event_data: {
        old_status: "eingegangen",
        new_status: "aktiv",
        source: "stripe_webhook",
        stripe_session_id: session.id,
        stripe_subscription_id: stripeSubscriptionId,
      },
      created_by: null,
    });
    if (ceError) {
      console.warn("[stripe-webhook] customer_events insert failed (non-blocking):", ceError.message);
    }
  } catch (ceEx) {
    console.warn("[stripe-webhook] customer_events exception (non-blocking):", String(ceEx));
  }


  // ── Ensure default_payment_method is set on the Stripe customer ──
  if (stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
      const currentDefault = customer.invoice_settings?.default_payment_method;
      if (!currentDefault) {
        const pms = await stripe.paymentMethods.list({
          customer: stripeCustomerId,
          type: "sepa_debit",
        });
        if (pms.data.length === 1) {
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: pms.data[0].id },
          });
          log("Set SEPA default_payment_method after contract activation", {
            stripeCustomerId,
            pmId: pms.data[0].id,
          });
        } else if (pms.data.length > 1) {
          log("WARN: multiple SEPA PMs, cannot auto-set default", {
            stripeCustomerId,
            count: pms.data.length,
          });
        }
      }
    } catch (pmErr) {
      log("WARN: could not ensure default_payment_method", String(pmErr));
    }
  }

  // 3-Tier: customers-Eintrag sicherstellen
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
      log("WARN: customers upsert failed", custErr.message);
    } else {
      log("customers record ensured", contract.hfx_customer_number);

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

  // 3-Tier: contract_case (UNIQUE Index auf neuabschluss macht dies idempotent)
  const { error: caseErr } = await supabase
    .from("contract_cases")
    .insert({
      contract_id: contractId,
      customer_id: contract?.customer_id ?? null,
      case_type: "neuabschluss",
      status: "abgeschlossen",
      title: `Neuabschluss – ${contract?.product_name ?? "Produkt"}`,
      notes: `Automatisch erstellt bei digitalem Vertragsabschluss via Stripe (Session: ${session.id})`,
    } as any);

  if (caseErr) {
    if ((caseErr as any).code === "23505") {
      log("contract_case neuabschluss already exists (idempotent skip)", contractId);
    } else {
      log("WARN: contract_cases insert failed", caseErr.message);
    }
  } else {
    log("contract_case neuabschluss created", contractId);
  }

  // Audit-Log: erfolgreiche Aktivierung
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

// ─────────────────────────────────────────────────────────────────────────────
// SEPA MANDATE SETUP
// ─────────────────────────────────────────────────────────────────────────────
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

  // Idempotenz: stripe_customer_id bereits gesetzt?
  const { data: existing } = await supabase
    .from("contracts")
    .select("stripe_customer_id, status, email, confirmation_email_sent_at")
    .eq("id", contractId)
    .maybeSingle();

  const alreadyLinked = existing?.stripe_customer_id === stripeCustomerId;

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
      log("WARN: could not set default payment method", String(err));
    }
  }

  if (!alreadyLinked) {
    const { error } = await supabase
      .from("contracts")
      .update({ stripe_customer_id: stripeCustomerId } as any)
      .eq("id", contractId);
    if (error) {
      log("ERROR: failed to save stripe_customer_id after mandate setup", error.message);
    }
  } else {
    log("sepa_mandate_setup: stripe_customer_id already set (idempotent)", contractId);
  }

  // Multi-Standort Self-Heal: customers.stripe_customer_id idempotent (NULL-only)
  // Kunde wird aus dem gerade geschriebenen Vertrag abgeleitet — nie breit über
  // WHERE stripe_customer_id = X auf customers.
  try {
    const { data: linkedContract } = await supabase
      .from("contracts").select("customer_id").eq("id", contractId).maybeSingle();
    const linkedCustomerId = (linkedContract as any)?.customer_id ?? null;
    if (linkedCustomerId && stripeCustomerId) {
      await supabase
        .from("customers")
        .update({ stripe_customer_id: stripeCustomerId } as any)
        .eq("id", linkedCustomerId)
        .is("stripe_customer_id", null);
    }
  } catch (healEx) {
    log("WARN: customers self-heal (sepa_mandate_setup) failed", String(healEx));
  }

  // Status-Update auf "aktiv" — nur aus eingegangen/wartend_auf_mandat heraus
  const activatableStatuses = new Set(["eingegangen", "wartend_auf_mandat"]);
  if (existing && activatableStatuses.has(String(existing.status))) {
    const { error: statusErr } = await supabase
      .from("contracts")
      .update({ status: "aktiv" } as any)
      .eq("id", contractId)
      .in("status", Array.from(activatableStatuses));
    if (statusErr) {
      log("ERROR: failed to activate contract after mandate", statusErr.message);
    } else {
      log("Contract activated after SEPA mandate", { contractId, prev: existing.status });
    }
  } else {
    log("sepa_mandate_setup: status not changed (current)", existing?.status);
  }

  // Mail 2 (Vertragsbestätigung) — idempotent über confirmation_email_sent_at
  if (existing && !existing.confirmation_email_sent_at && existing.email) {
    try {
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-contract-confirmation`;
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ contract_id: contractId }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        log("WARN: send-contract-confirmation failed", t);
      } else {
        log("send-contract-confirmation triggered", { contractId });
      }
    } catch (err) {
      log("WARN: error triggering send-contract-confirmation", String(err));
    }
  } else {
    log("sepa_mandate_setup: skip Mail 2 (already sent or no email)", contractId);
  }

  // Fire-and-forget: Provider-Status-Sync triggern (Qodia), idempotent
  try {
    const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qodia-status-sync?contract_id=${contractId}`;
    fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: "{}",
    }).catch((e) => log("WARN: qodia-status-sync trigger failed", String(e)));
    log("qodia-status-sync triggered (fire-and-forget)", { contractId });
  } catch (e) {
    log("WARN: could not trigger qodia-status-sync", String(e));
  }

  log("SEPA mandate setup completed", { contractId, stripeCustomerId });
}

// ─────────────────────────────────────────────────────────────────────────────
// E-Mail-Template (Demo-Buchungsbestätigung)
// ─────────────────────────────────────────────────────────────────────────────
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
