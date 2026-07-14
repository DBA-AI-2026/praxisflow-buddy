// [REVIEW REQUIRED] — Guardrail-Function (Billing-kritisch)
// -----------------------------------------------------------------------------
// ensureCarrierCustomer — konsolidierter, idempotenter Ensure für die
// 3-Tier-Kundenanlage im Stripe-Webhook (Weg D).
//
// Erzwungene Invarianten für einen sauber aktivierten Trägervertrag:
//   1) customers-Zeile existiert (upsert onConflict hfx_customer_number).
//   2) customers.stripe_customer_id ist gesetzt (aus contract.stripe_customer_id).
//   3) customers.base_fee_contract_id zeigt auf den GOÄ-Trägervertrag
//      (clobber-frei: nur setzen wenn NULL; nie auf einen Nicht-GOÄ-Vertrag).
//   4) contracts.customer_id = customers.id (NULL-only Guard, kein Overwrite).
//
// Phantom-Guard: Wenn contract.customer_id bereits gesetzt ist (z. B. Standort-
// Anlage via locationContext), erfolgt ein No-Op — kein Zweitkunde unter der
// Standort-HFX ({base}-NN).
//
// Fehler werden ausschließlich geloggt (non-blocking). Der Helper wirft nicht.
//
// Rollback: Git-Revert dieser Datei + der Aufrufer-Zeilen im stripe-webhook.
// -----------------------------------------------------------------------------

import { isGoaeProduct } from "./multiLocation.ts";

type SupabaseLike = any;

export interface EnsureCarrierCustomerInput {
  id: string;
  hfx_customer_number: string | null;
  customer_id: string | null;
  stripe_customer_id: string | null;
  product_name?: string | null;
  praxis?: string | null;
  customer_name?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
  adresse?: string | null;
  plz?: string | null;
  ort?: string | null;
  bsnr?: string | null;
  lanr?: string | null;
  mp_nr?: string | null;
}

export interface EnsureCarrierCustomerResult {
  customerId: string | null;
  skippedReason?: "already_linked" | "no_hfx" | "upsert_failed" | "lookup_failed";
}

function warn(tag: string, ...rest: unknown[]) {
  console.warn(`[ensureCarrierCustomer] ${tag}`, ...rest);
}

function info(tag: string, ...rest: unknown[]) {
  console.log(`[ensureCarrierCustomer] ${tag}`, ...rest);
}

export async function ensureCarrierCustomer(
  supabase: SupabaseLike,
  contract: EnsureCarrierCustomerInput,
): Promise<EnsureCarrierCustomerResult> {
  // 1) Phantom-Guard: bestehende Verknüpfung nie überschreiben (Standort-Schutz).
  if (contract.customer_id) {
    info("skip: customer_id already set (phantom guard)", contract.customer_id);
    return { customerId: contract.customer_id, skippedReason: "already_linked" };
  }

  if (!contract.hfx_customer_number) {
    warn("skip: contract has no hfx_customer_number", contract.id);
    return { customerId: null, skippedReason: "no_hfx" };
  }

  const hfx = contract.hfx_customer_number;

  // 2) customers upsert — Stammdaten + stripe_customer_id.
  //    onConflict: hfx_customer_number → re-delivery-sicher (Update statt Insert).
  const upsertPayload: Record<string, unknown> = {
    hfx_customer_number: hfx,
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
  };
  if (contract.stripe_customer_id) {
    upsertPayload.stripe_customer_id = contract.stripe_customer_id;
  }

  const { error: upsertErr } = await supabase
    .from("customers")
    .upsert(upsertPayload, {
      onConflict: "hfx_customer_number",
      ignoreDuplicates: false,
    });

  if (upsertErr) {
    warn("customers upsert failed", upsertErr.message);
    return { customerId: null, skippedReason: "upsert_failed" };
  }
  info("customers upserted", hfx);

  // 3) customers-Zeile zurücklesen (id + aktuelles base_fee_contract_id).
  const { data: custRow, error: lookupErr } = await supabase
    .from("customers")
    .select("id, base_fee_contract_id")
    .eq("hfx_customer_number", hfx)
    .maybeSingle();

  if (lookupErr || !custRow?.id) {
    warn("customers lookup failed after upsert", lookupErr?.message ?? "no row");
    return { customerId: null, skippedReason: "lookup_failed" };
  }

  const customerId = custRow.id as string;
  const currentBaseFee = (custRow as any).base_fee_contract_id as string | null;

  // 4) base_fee_contract_id-Ableitung — GOÄ-gebunden, clobber-frei.
  //    - Schon gesetzt      → nicht anfassen.
  //    - NULL & aktivierter Vertrag ist GOÄ → contract.id.
  //    - NULL & nicht-GOÄ   → GOÄ-Vertrag des Kunden suchen; sonst NULL lassen.
  if (!currentBaseFee) {
    let targetBaseFee: string | null = null;

    if (isGoaeProduct(contract.product_name)) {
      targetBaseFee = contract.id;
    } else {
      // Nicht-GOÄ: nach existierendem GOÄ-Vertrag des Kunden suchen (via
      // customer_id ODER hfx_customer_number, um auch Verträge zu erfassen,
      // deren customer_id gleich vom Ensure gesetzt wird / gerade wurde).
      try {
        const { data: goaeCandidates } = await supabase
          .from("contracts")
          .select("id, product_name")
          .or(
            `customer_id.eq.${customerId},hfx_customer_number.eq.${hfx}`,
          );
        const goae = (goaeCandidates ?? []).find((c: any) =>
          isGoaeProduct(c?.product_name)
        );
        if (goae?.id) targetBaseFee = goae.id as string;
      } catch (searchEx) {
        warn("GOÄ candidate search failed (non-blocking)", String(searchEx));
      }
    }

    if (targetBaseFee) {
      const { error: baseFeeErr } = await supabase
        .from("customers")
        .update({ base_fee_contract_id: targetBaseFee } as any)
        .eq("id", customerId)
        .is("base_fee_contract_id", null);
      if (baseFeeErr) {
        warn("customers.base_fee_contract_id update failed", baseFeeErr.message);
      } else {
        info("customers.base_fee_contract_id set", { customerId, targetBaseFee });
      }
    } else {
      info("customers.base_fee_contract_id left NULL (no GOÄ carrier available)", {
        customerId,
      });
    }
  }

  // 5) contracts.customer_id verknüpfen — NULL-only Guard (L3).
  const { error: linkErr } = await supabase
    .from("contracts")
    .update({ customer_id: customerId } as any)
    .eq("id", contract.id)
    .is("customer_id", null);
  if (linkErr) {
    warn("contracts.customer_id update failed", linkErr.message);
  } else {
    info("contracts.customer_id linked", { contractId: contract.id, customerId });
  }

  return { customerId };
}
