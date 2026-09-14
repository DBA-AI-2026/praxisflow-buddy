/**
 * qodia-update-plan — Phase 1, Schritt 3
 *
 * Hebt das Qodia-Konto eines Vertrags auf den beim Partner hinterlegten
 * Default-Plan (Pro): POST https://auth.qodia.de/api/external/update-plan
 * mit Body { "email": "<konto-mail>" } und x-api-key (QODIA_API_KEY).
 *
 * Bewusste Abweichungen vom bestehenden Qodia-Muster (Auflage 2):
 *   - 10-Sekunden-Timeout über AbortController (Bestandsmuster hat keins),
 *     damit ein hängender Partner-Aufruf keine Aktivierung verzögert.
 *   - KEIN Retry: der Aufruf ist idempotent und der Admin-Button ist jederzeit
 *     wiederholbar. 429 wird als rate_limited festgehalten, nicht nachgefasst.
 *
 * Auflage 3: Es wird immer der Response-BODY ausgewertet, nie nur res.ok —
 * Qodia liefert Fehlschläge auch als HTTP 200 mit success:false.
 *
 * Fester Wertesatz für contract_provider_status.plan_upgrade_status:
 *   success      — Aufruf durch, Body meldet Erfolg
 *   error        — Aufruf durch, Body/Status meldet Fehlschlag
 *   rate_limited — HTTP 429
 *   unreachable  — Timeout oder Netzwerkfehler
 *
 * plan_upgrade_attempted_at wird bei JEDEM Versuch gesetzt,
 * plan_upgraded_at ausschließlich bei success. plan_upgrade_error trägt den
 * Rohtext der Antwort bzw. die Fehlermeldung.
 *
 * Aufrufmodi (POST):
 *   { contractId }                       — Einzelvertrag
 *   { mode: "backfill", dryRun: true }   — Liste der betroffenen aktiven Verträge
 *   { mode: "backfill", dryRun: false }  — Nachzieh-Lauf, 2,5 s Taktung
 *
 * Zugang: interner Aufruf mit Service-Role-Bearer (fire-and-forget aus
 * stripe-webhook) oder eingeloggter Nutzer mit aktiver Rolle "admin".
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER = "qodia";
const QODIA_UPDATE_PLAN_URL = "https://auth.qodia.de/api/external/update-plan";
const TIMEOUT_MS = 10_000;
const BACKFILL_DELAY_MS = 2_500;

type PlanUpgradeStatus = "success" | "error" | "rate_limited" | "unreachable";

interface CallResult {
  status: PlanUpgradeStatus;
  detail: string;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Ein einzelner Qodia-Aufruf. Kein Retry. Body wird immer ausgewertet —
 * auch bei HTTP 200, weil Qodia dort success:false liefern kann.
 */
async function callQodiaUpdatePlan(email: string, apiKey: string): Promise<CallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  let raw: string;
  try {
    res = await fetch(QODIA_UPDATE_PLAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    raw = await res.text();
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const isAbort = /abort/i.test(msg);
    return {
      status: "unreachable",
      detail: isAbort ? `Timeout nach ${TIMEOUT_MS / 1000}s` : `Netzwerkfehler: ${msg}`.slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    return { status: "rate_limited", detail: `HTTP 429: ${raw.slice(0, 400)}` };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    return { status: "error", detail: `HTTP ${res.status}: ${raw.slice(0, 400)}` };
  }

  // HTTP 200 — jetzt zählt ausschließlich der Body.
  if (!parsed || typeof parsed !== "object") {
    return { status: "error", detail: `Antwort ohne auswertbares JSON: ${raw.slice(0, 400)}` };
  }
  if (parsed.success === false || parsed.error) {
    return { status: "error", detail: raw.slice(0, 500) };
  }
  if (parsed.success !== true) {
    return { status: "error", detail: `Body ohne success:true: ${raw.slice(0, 400)}` };
  }
  return { status: "success", detail: raw.slice(0, 500) };
}

async function persist(
  supabase: ReturnType<typeof createClient>,
  contractId: string,
  result: CallResult,
) {
  const now = new Date().toISOString();
  await supabase
    .from("contract_provider_status")
    .upsert(
      { contract_id: contractId, provider: PROVIDER },
      { onConflict: "contract_id,provider", ignoreDuplicates: true },
    );

  const update: Record<string, unknown> = {
    plan_upgrade_attempted_at: now,
    plan_upgrade_status: result.status,
    plan_upgrade_error: result.status === "success" ? null : result.detail,
  };
  if (result.status === "success") update.plan_upgraded_at = now;

  const { error } = await supabase
    .from("contract_provider_status")
    .update(update)
    .eq("contract_id", contractId)
    .eq("provider", PROVIDER);
  if (error) {
    console.error("[qodia-update-plan] Statusschreibung fehlgeschlagen:", error.message);
  }
}

/** Contract-IDs mit vorhandenem Qodia-Provider-Eintrag (SSOT statt Produktname). */
async function qodiaContractIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase
    .from("contract_provider_status")
    .select("contract_id")
    .eq("provider", PROVIDER);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.contract_id as string);
}

/** Führt einen Vertrag aus: prüft E-Mail, ruft Qodia, schreibt Status. */
async function processContract(
  supabase: ReturnType<typeof createClient>,
  contractId: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, email, status, product_name, hfx_customer_number")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw error;
  if (!contract) return { contract_id: contractId, skipped: "contract_not_found" };


  const email = ((contract as any).email ?? "").trim();
  if (!email) {
    // Kein Improvisieren: Fehlschlag wird sichtbar festgehalten, nicht geraten.
    const result: CallResult = {
      status: "error",
      detail: "Keine Konto-E-Mail am Vertrag hinterlegt — Plan-Upgrade nicht möglich.",
    };
    await persist(supabase, contractId, result);
    return { contract_id: contractId, status: result.status, error: result.detail };
  }

  const result = await callQodiaUpdatePlan(email, apiKey);
  await persist(supabase, contractId, result);
  console.log(`[qodia-update-plan] ${contractId} (${email}) → ${result.status}`);
  return {
    contract_id: contractId,
    hfx_customer_number: (contract as any).hfx_customer_number,
    email,
    status: result.status,
    detail: result.detail,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const internal = authHeader === `Bearer ${serviceKey}`;

  if (!internal) {
    // Admin-Button ist admin-only; die Aktivierungspfade laufen aber auch unter
    // vertragsabteilung/sales_lead — sonst würde ein Upgrade dort still 403en.
    const guard = await requireActiveRole(
      req,
      ["admin", "vertragsabteilung", "sales_lead"],
      corsHeaders,
    );
    if (guard instanceof Response) return guard;
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const apiKey = Deno.env.get("QODIA_API_KEY");
  if (!apiKey) return json(500, { success: false, error: "QODIA_API_KEY nicht konfiguriert" });

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.mode === "backfill") {
      const dryRun = body?.dryRun !== false;
      // Auswahlkriterium: Status aktiv UND vorhandener Qodia-Eintrag in
      // contract_provider_status. Kein Produktname, kein ilike — Verträge mit
      // mehreren Produkten in einem Textfeld selektieren sonst falsch herum.
      const ids = await qodiaContractIds(supabase);
      if (ids.length === 0) {
        return json(200, { success: true, mode: "backfill", dryRun, count: 0, contracts: [] });
      }
      const { data: contracts, error } = await supabase
        .from("contracts")
        .select("id, hfx_customer_number, customer_name, product_name, email")
        .eq("status", "aktiv")
        .in("id", ids)
        .order("hfx_customer_number", { ascending: true });
      if (error) throw error;

      if (dryRun) {
        return json(200, {
          success: true,
          mode: "backfill",
          dryRun: true,
          count: (contracts ?? []).length,
          contracts,
        });
      }

      const results: Array<Record<string, unknown>> = [];
      for (let i = 0; i < (contracts ?? []).length; i++) {
        const c: any = contracts![i];
        try {
          results.push(await processContract(supabase, c.id, apiKey, productNames));
        } catch (e) {
          results.push({ contract_id: c.id, status: "error", detail: String(e).slice(0, 300) });
        }
        if (i < contracts!.length - 1) {
          await new Promise((r) => setTimeout(r, BACKFILL_DELAY_MS));
        }
      }
      return json(200, { success: true, mode: "backfill", dryRun: false, count: results.length, results });
    }

    const contractId = body?.contractId;
    if (!contractId || typeof contractId !== "string") {
      return json(400, { success: false, error: "contractId fehlt" });
    }
    const result = await processContract(supabase, contractId, apiKey, productNames);
    return json(200, { success: true, ...result });
  } catch (err) {
    console.error("[qodia-update-plan] Unbekannter Fehler:", err);
    return json(500, { success: false, error: String(err).slice(0, 500) });
  }
});
