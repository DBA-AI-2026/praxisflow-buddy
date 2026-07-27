import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_QODIA_UNIT_PRICE } from "../_shared/promoStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

// Products that are available for the digital booking flow.
// SYNCHRONIZE: campaign-start → CAMPAIGN_PRODUCT hartkodiert denselben
// String. Bei Produktnamens-Wechsel BEIDE Stellen anfassen (dieselbe
// Regel wie bei der Kündigungsfrist-Ableitung: kein stiller Drift).
const VALID_PRODUCTS = [
  "HFX GOÄ - die KI für ihre Privatabrechnung",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Validate API key
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("QODIA_API_KEY");
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized – invalid or missing API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { hfx_customer_number, product_name, skip_mail } = body;

    // 2. Validate required fields
    if (!hfx_customer_number || !product_name) {
      return new Response(
        JSON.stringify({ error: "hfx_customer_number and product_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validate product is in our known list
    if (!VALID_PRODUCTS.includes(product_name)) {
      return new Response(
        JSON.stringify({
          error: `No Stripe price configured for product "${product_name}". Valid products: ${VALID_PRODUCTS.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Find lead by hfx_customer_number
    const { data: lead, error: leadError } = await adminClient
      .from("leads")
      .select("*")
      .eq("hfx_customer_number", hfx_customer_number)
      .maybeSingle();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: `Lead with HFX number "${hfx_customer_number}" not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[qodia-initiate-booking] Found lead ${lead.id} for ${hfx_customer_number}`);

    // 5. Check for already active contract for this product
    const { data: activeContract } = await adminClient
      .from("contracts")
      .select("id, status")
      .eq("hfx_customer_number", hfx_customer_number)
      .eq("product_name", product_name)
      .eq("status", "aktiv")
      .maybeSingle();

    if (activeContract) {
      return new Response(
        JSON.stringify({
          error: `An active contract for product "${product_name}" already exists for this customer`,
          contract_id: activeContract.id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Check for an existing open (eingegangen) contract to reuse
    const { data: openContract } = await adminClient
      .from("contracts")
      .select("id")
      .eq("hfx_customer_number", hfx_customer_number)
      .eq("product_name", product_name)
      .eq("status", "eingegangen")
      .maybeSingle();

    let contractId: string;

    if (openContract) {
      contractId = openContract.id;
      console.log(`[qodia-initiate-booking] Reusing existing contract ${contractId}`);
    } else {
      // 7. Create a new contract from lead data
      // Look up the product price
      const { data: product } = await adminClient
        .from("products")
        .select("monthly_price, one_time_fee, promo_base_fee_end_date, promo_price, promo_end_date, price_per_unit")
        .eq("name", product_name)
        .maybeSingle();

      // [REVIEW REQUIRED] qodia_unit_price produktgetrieben einstempeln.
      // SYNCHRONIZE mit src/pages/Vertraege.tsx (Ableitung: hasPromo ? promo_price : price_per_unit,
      // Default nur wenn gar kein Stückpreis am Produkt hinterlegt ist) und
      // supabase/functions/_shared/promoStatus.ts (DEFAULT_QODIA_UNIT_PRICE).
      // Hintergrund: Ohne diesen Stempel greift der DB-Default 0 →
      // qodia-auto-usage-sync markiert die Umsätze als "ungeklaert" (Datenfehler).
      // Regel: Aktive Produkt-Promo (promo_price + promo_end_date >= heute) gewinnt.
      // Sonst regulärer price_per_unit. Nur wenn beide Felder fehlen: DEFAULT_QODIA_UNIT_PRICE.
      // Rollback: bei Regression diesen Block + Zeile im Insert entfernen — dann greift
      // wieder DB-Default 0 (Symptom: ungeklaert-Buchungen).
      const nowTs = new Date();
      const hasActivePromo =
        product?.promo_price != null &&
        !!product?.promo_end_date &&
        new Date(product.promo_end_date) >= nowTs;
      const qodiaUnitPrice = hasActivePromo
        ? Number(product!.promo_price)
        : product?.price_per_unit != null
          ? Number(product.price_per_unit)
          : DEFAULT_QODIA_UNIT_PRICE;



      // Grundgebühr-Waiver aus Produkt ableiten.
      // [REVIEW REQUIRED] promo_base_fee_end_date ist per Definition das
      // Grundgebühr-Befreiungs-Enddatum (Migration 20260213083330,
      // "Add column for base fee waiver end date"; Onboarding-Checkliste:
      // "Grundgebühr-Befreiung bis"). qodia-initiate-booking ist der erste
      // Code-Konsument dieses Feldes — keine neue Semantik, nur erste Nutzung.
      // Regel: Trägt das Produkt ein Enddatum, wird der Vertrag mit
      // base_fee_waived=true und base_fee_waived_until=<Datum> gemintet.
      // Ohne Enddatum: keine Waiver-Felder setzen (DB-Defaults greifen).
      // monthly_price bleibt regulär; die Waiver-Anwendung erfolgt in auto-invoice.
      // set-once-at-creation. Reuse-Zweig (openContract) bleibt unberührt.
      // Rollback: bei Regression waiverFields wieder aus dem Insert entfernen,
      // dann werden Verträge ohne Waiver geminted (Vollpreis ab 1. Rechnung).
      const waiverFields: { base_fee_waived?: boolean; base_fee_waived_until?: string } =
        product?.promo_base_fee_end_date
          ? {
              base_fee_waived: true,
              base_fee_waived_until: product.promo_base_fee_end_date,
            }
          : {};


      // Kündigungsfrist produktgetrieben ableiten.
      // [REVIEW REQUIRED] Diese Regel spiegelt getCancellationPeriodForProducts()
      // aus src/lib/contractLifecycle.ts (SYNCHRONIZE). Deno kann den TS-Helper
      // nicht importieren, deshalb inline. Exakter Name-Match (kein ILIKE),
      // MAX über Treffer, Fallback 6. set-once-at-creation.
      // Rollback: bei Regression Zeilen 125–140 löschen, dann greift der
      // DB-Default (contracts.cancellation_period_months DEFAULT 3).
      const FALLBACK_CANCELLATION_MONTHS = 6;
      const { data: cancellationRows } = await adminClient
        .from("products")
        .select("cancellation_period_months")
        .in("name", [product_name]);
      const matchedPeriods = (cancellationRows ?? [])
        .map((r) => r.cancellation_period_months)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const cancellationPeriod = matchedPeriods.length
        ? Math.max(...matchedPeriods)
        : FALLBACK_CANCELLATION_MONTHS;

      const today = new Date().toISOString().split("T")[0];
      const customerName = [lead.vorname, lead.nachname].filter(Boolean).join(" ") || lead.praxis_name;

      const { data: newContract, error: insertError } = await adminClient
        .from("contracts")
        .insert({
          status: "eingegangen",
          product_name,
          customer_name: customerName,
          vorname: lead.vorname,
          nachname: lead.nachname,
          email: lead.email,
          telefon: lead.mobilnummer || null,
          adresse: lead.adresse || null,
          plz: lead.plz || null,
          ort: lead.ort || null,
          praxis: lead.praxis_name,
          mp_nr: lead.mp_nummer || null,
          hfx_customer_number: lead.hfx_customer_number,
          monthly_price: product?.monthly_price ?? 0,
          one_time_fee: product?.one_time_fee ?? 0,
          start_date: today,
          end_date: "2099-12-31",
          duration_months: 0,
          cancellation_period_months: cancellationPeriod,
          payment_interval: "monatlich",
          qodia_unit_price: qodiaUnitPrice,
          ...waiverFields,
        })

        .select("id")
        .single();

      if (insertError || !newContract) {
        throw new Error(`Failed to create contract: ${insertError?.message}`);
      }

      contractId = newContract.id;
      console.log(`[qodia-initiate-booking] Created new contract ${contractId} (cancellation=${cancellationPeriod}m, waiver_until=${(waiverFields as any).base_fee_waived_until ?? "none"}, qodia_unit_price=${qodiaUnitPrice}, promo=${hasActivePromo})`);
    }

    // [REVIEW REQUIRED] skip_mail-Schalter: bewusst kein Mailversand.
    // Regel: skip_mail === true → Schritt 8 überspringen, Vertrag bleibt angelegt.
    // Rückgabe enthält mail_skipped: true, damit Aufrufer (z. B. Mint-Runner)
    // schwarz auf weiß sieht, dass hier keine Mail rausging.
    // Default: skip_mail fehlend/false → bisheriges Verhalten (Mail senden).
    // Rollback: bei Regression diesen Block entfernen → es wird immer gesendet.
    if (skip_mail === true) {
      console.log(`[qodia-initiate-booking] skip_mail=true; Mandat-Setup-Mail nicht gesendet für Vertrag ${contractId}`);
      return new Response(
        JSON.stringify({ success: true, contract_id: contractId, mail_skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Trigger Mandat-Setup-Mail (Mail 1) via send-mandate-setup mit Service-Role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fnUrl = `${supabaseUrl}/functions/v1/send-mandate-setup`;

    const emailRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ contract_id: contractId }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error(`[qodia-initiate-booking] send-mandate-setup returned ${emailRes.status}: ${errBody}`);
      return new Response(
        JSON.stringify({
          success: true,
          contract_id: contractId,
          warning: "Contract created but mandate-setup email could not be sent. Please resend manually.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[qodia-initiate-booking] Mandat-Setup gestartet für Vertrag ${contractId}`);

    // 9. Return success
    return new Response(
      JSON.stringify({ success: true, contract_id: contractId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[qodia-initiate-booking] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
