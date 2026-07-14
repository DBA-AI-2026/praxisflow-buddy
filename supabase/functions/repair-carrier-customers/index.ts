// [REVIEW REQUIRED] — Einmalige, kontrollierte Datenreparatur (Weg C)
// -----------------------------------------------------------------------------
// repair-carrier-customers — repariert halb-aktivierte Kunden, deren
// Trägervertrag zwar aktiv ist, für die aber keine customers-Zeile existiert
// (customer_id IS NULL). Ursache war die inzwischen geschlossene Handler-Lücke
// (Weg D) + ein unvollständiger backfill_webhook_gap-Lauf.
//
// Vorgehen:
//   - Input: Liste von HFX-Nummern (Default: I01079, I01112, I01130) + dryRun.
//   - Pro HFX: aktiven GOÄ-Trägervertrag laden.
//   - dryRun=true (Default): geplante Mutation je Vertrag berichten, keine Writes.
//   - dryRun=false: ensureCarrierCustomer(supabase, contract) aufrufen.
//
// Leitplanken:
//   L1 — Schreibt ausschließlich customers (Upsert via Helper) + contracts.customer_id.
//        Kein invoices-Touch, kein Status-Wechsel, kein Stripe-Call.
//   L2 — Helper-Wiederverwendung: keine duplizierte Kundenanlage-Logik.
//   L3 — Idempotent: Phantom-Guard + NULL-only-Guards → Re-Run ist No-Op.
//   L4 — Begrenzt auf explizit übergebene HFX-Liste.
//
// Rollback (falls doch nötig):
//   DELETE FROM customers WHERE hfx_customer_number IN (…);
//   UPDATE contracts SET customer_id = NULL, base_fee_contract_id-Bezug am
//   customer entfällt automatisch durch DELETE.
//
// Aufruf:
//   POST { "dryRun": true }                        -> Default-HFX, kein Write
//   POST { "dryRun": false }                       -> echter Lauf
//   POST { "dryRun": true, "hfxNumbers": ["HFX-I01079"] }  -> Subset
// -----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureCarrierCustomer } from "../_shared/ensureCarrierCustomer.ts";
import { isGoaeProduct } from "../_shared/multiLocation.ts";

const DEFAULT_HFX = ["HFX-I01079", "HFX-I01112", "HFX-I01130"];

interface RepairReport {
  hfx_customer_number: string;
  contract_id: string | null;
  action: "planned" | "executed" | "skipped" | "error";
  reason?: string;
  planned_customer_fields?: Record<string, unknown>;
  planned_base_fee_contract_id?: string | null;
  planned_customer_link?: string | null;
  result_customer_id?: string | null;
  result_skipped_reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { dryRun?: boolean; hfxNumbers?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // no body → defaults
    }
    const dryRun = body.dryRun !== false; // default true
    const hfxList = Array.isArray(body.hfxNumbers) && body.hfxNumbers.length > 0
      ? body.hfxNumbers
      : DEFAULT_HFX;

    const reports: RepairReport[] = [];

    for (const hfx of hfxList) {
      // Aktiven GOÄ-Trägervertrag laden (voll, für Helper-Input).
      const { data: contracts, error: cErr } = await supabase
        .from("contracts")
        .select(
          "id, hfx_customer_number, customer_id, stripe_customer_id, product_name, praxis, customer_name, vorname, nachname, email, telefon, adresse, plz, ort, bsnr, lanr, mp_nr, status",
        )
        .eq("hfx_customer_number", hfx)
        .eq("status", "aktiv");

      if (cErr) {
        reports.push({
          hfx_customer_number: hfx,
          contract_id: null,
          action: "error",
          reason: `contracts lookup failed: ${cErr.message}`,
        });
        continue;
      }

      const goaeContracts = (contracts ?? []).filter((c: any) =>
        isGoaeProduct(c.product_name)
      );

      if (goaeContracts.length === 0) {
        reports.push({
          hfx_customer_number: hfx,
          contract_id: null,
          action: "skipped",
          reason: "no active GOÄ contract found",
        });
        continue;
      }
      if (goaeContracts.length > 1) {
        reports.push({
          hfx_customer_number: hfx,
          contract_id: null,
          action: "skipped",
          reason:
            `ambiguous: ${goaeContracts.length} active GOÄ contracts — manual review required`,
        });
        continue;
      }

      const contract = goaeContracts[0] as any;

      if (dryRun) {
        reports.push({
          hfx_customer_number: hfx,
          contract_id: contract.id,
          action: "planned",
          planned_customer_fields: {
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
            stripe_customer_id: contract.stripe_customer_id || null,
          },
          planned_base_fee_contract_id: isGoaeProduct(contract.product_name)
            ? contract.id
            : null,
          planned_customer_link: contract.customer_id ? null : contract.id,
        });
        continue;
      }

      // Echter Lauf: Helper wiederverwenden.
      const res = await ensureCarrierCustomer(supabase, contract);
      reports.push({
        hfx_customer_number: hfx,
        contract_id: contract.id,
        action: "executed",
        result_customer_id: res.customerId,
        result_skipped_reason: res.skippedReason,
      });
    }

    return new Response(
      JSON.stringify({ dryRun, count: reports.length, reports }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("[repair-carrier-customers] fatal", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
