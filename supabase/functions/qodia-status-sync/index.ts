/**
 * qodia-status-sync
 *
 * Cron-driven sync (04:30 UTC) that updates the EXTERNAL provider status fields
 * (sync_status, registration_status, last_sync_at, sync_error_message, metadata)
 * in contract_provider_status for the "qodia" provider.
 *
 * Usage aggregates (counts, first/last usage, usage_status) are NOT touched
 * here — they are computed from usage_charges via the SQL function
 * recompute_contract_provider_usage and the trigger on usage_charges.
 *
 * [REVIEW REQUIRED] — Umstellung 02.09.2026: Sign-up-Probe → Lookup-Endpoint
 *
 *   Bis 02.09.2026 prüfte diese Function die Registrierung per
 *   POST /external/sign-up mit Zufallspasswort (409 = registriert). Der Partner
 *   hat bestätigt, dass dieser Aufruf bei unbekannter Adresse ein Konto ANLEGT
 *   (Geisterkonten mit name = E-Mail). Seitdem: rein lesender Lookup über
 *   POST https://auth.qodia.de/api/external/users (Volllast, limit=50,
 *   seitenweise; In-Memory-Match per email.trim().toLowerCase()).
 *
 *   In dieser Function gibt es KEINEN sign-up-Aufruf mehr — auch nicht als
 *   Fallback. Sign-up rufen nur noch capture-lead, sync-lead-qodia und
 *   register-standort-qodia (bewusste Kontoanlage, keine Probe) auf.
 *
 *   Rollback: `git log -- supabase/functions/qodia-status-sync/index.ts`,
 *   Stand vor dem 02.09.2026 auschecken und die Function neu deployen.
 *   (Nicht empfohlen — die alte Probe legt Konten an.)
 *
 * Status-Ableitung (Leser: QodiaStatusBadges, OnboardingStatus, useProviderStatus —
 * unverändert; keine neue Statusausprägung in diesem Auftrag):
 *   - Treffer im Lookup      → sync_status = "transferred",
 *                              registration_status = "registered",
 *                              metadata.lookup = "found",
 *                              metadata.qodia_name, metadata.qodia_created_at
 *   - kein Treffer           → registration_status = "invited" (wie bisher),
 *                              sync_status = "transferred" bei Lead-Hint, sonst
 *                              "not_started"; metadata.lookup = "not_found"
 *                              (präzise Wahrheit gespeichert; ein eigener
 *                              not_registered-Status ist ein UI-Folgeauftrag)
 *   - Lookup nicht möglich   → sync_status = "error" + sync_error_message,
 *                              registration_status bleibt unverändert
 *   - "active" wird hier NIE gesetzt (kein Account-Status-Endpoint).
 *
 * Rate-Limit: Qodia antwortet nach wenigen schnellen Aufrufen mit 429
 * ("Rate limit exceeded. Retry in N seconds."). Es gibt genau EINEN Retry mit
 * der Wartezeit aus der Fehlermeldung (Fallback 30 s), danach Fehler — keine
 * Endlosschleife, da die Einzel-Trigger (stripe-webhook ?contract_id=) in
 * Serie feuern können.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const PROVIDER = "qodia";
const QODIA_USERS_URL = "https://auth.qodia.de/api/external/users";
const PAGE_LIMIT = 50; // API-Maximum (limit > 50 → 400)
const MAX_PAGES = 200; // harte Obergrenze (10.000 Nutzer) gegen Endlos-Pagination
const RATE_LIMIT_FALLBACK_MS = 30_000;
const RATE_LIMIT_MAX_WAIT_MS = 90_000;

interface ContractRow {
  id: string;
  email: string | null;
  hfx_customer_number: string | null;
  status: string;
  product_name: string;
}

interface QodiaUser {
  email: string;
  name: string | null;
  company?: string | null;
  createdAt: string | null;
}

interface QodiaUsersResponse {
  success?: boolean;
  users?: QodiaUser[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
  message?: string;
}

function parseRetrySeconds(raw: string, retryAfterHeader: string | null): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  const m = raw.match(/retry in (\d+)\s*second/i);
  if (m) return Number(m[1]);
  return RATE_LIMIT_FALLBACK_MS / 1000;
}

/**
 * Lädt EINE Seite der Nutzerliste. Bei 429 genau ein Retry nach der vom
 * Partner genannten Wartezeit; schlägt der Retry ebenfalls fehl → Fehler.
 */
async function fetchUsersPage(
  page: number,
  apiKey: string,
): Promise<QodiaUsersResponse> {
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(QODIA_USERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ page, limit: PAGE_LIMIT }),
    });
    const raw = await res.text();

    if (res.status === 429 && attempt === 1) {
      const waitSec = Math.min(
        parseRetrySeconds(raw, res.headers.get("retry-after")),
        RATE_LIMIT_MAX_WAIT_MS / 1000,
      );
      console.warn(`[qodia-status-sync] 429 auf Seite ${page}, warte ${waitSec}s (einmaliger Retry)`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Qodia /external/users HTTP ${res.status} (Seite ${page}): ${raw.slice(0, 300)}`);
    }

    let parsed: QodiaUsersResponse;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Qodia /external/users: ungültiges JSON (Seite ${page}): ${raw.slice(0, 300)}`);
    }
    if (!Array.isArray(parsed.users)) {
      throw new Error(`Qodia /external/users: Feld "users" fehlt (Seite ${page}): ${raw.slice(0, 300)}`);
    }
    return parsed;
  }
}

/**
 * Volllast: alle Qodia-Nutzer seitenweise laden und als Map
 * email(lowercase, trimmed) → Nutzer zurückgeben.
 */
async function loadAllQodiaUsers(apiKey: string): Promise<{ byEmail: Map<string, QodiaUser>; total: number; pages: number }> {
  const byEmail = new Map<string, QodiaUser>();
  let page = 1;
  let totalPages = 1;
  let total = 0;

  do {
    const data = await fetchUsersPage(page, apiKey);
    for (const u of data.users ?? []) {
      const key = (u.email ?? "").trim().toLowerCase();
      if (!key) continue;
      // Bei doppelten E-Mails gewinnt der ältere Eintrag (Liste ist createdAt DESC).
      byEmail.set(key, u);
    }
    totalPages = data.pagination?.totalPages ?? 1;
    total = data.pagination?.total ?? byEmail.size;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES);

  return { byEmail, total, pages: page - 1 };
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = req.headers.get("x-cron-secret") ?? "";
    const envCronSecret = Deno.env.get("CRON_SECRET_2") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const validCron = cronSecret !== "" && cronSecret === envCronSecret;
    const validAnon = authHeader === `Bearer ${anonKey}`;
    if (!validCron && !validAnon) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
    if (!qodiaApiKey) {
      return new Response(JSON.stringify({ error: "QODIA_API_KEY nicht konfiguriert" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Optional: limit to a single contract via ?contract_id=...
    const url = new URL(req.url);
    const onlyContractId = url.searchParams.get("contract_id");

    // Find all contracts whose product has provider_flags->>'qodia' = true
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("name, provider_flags");
    if (prodErr) throw prodErr;
    const qodiaProductNames = (products ?? [])
      .filter((p: any) => p.provider_flags && p.provider_flags[PROVIDER])
      .map((p: any) => p.name);

    if (qodiaProductNames.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, note: "no qodia products" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    let contractsQuery = supabase
      .from("contracts")
      .select("id, email, hfx_customer_number, status, product_name")
      .in("product_name", qodiaProductNames)
      .not("email", "is", null);
    if (onlyContractId) {
      contractsQuery = contractsQuery.eq("id", onlyContractId);
    }
    const { data: contracts, error: cErr } = await contractsQuery;
    if (cErr) throw cErr;

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Pre-fetch leads.qodia_synced map for technical hint (NOT authoritative)
    const emails = Array.from(new Set(contracts.map((c: ContractRow) => c.email).filter(Boolean) as string[]));
    const { data: leadHints } = await supabase
      .from("leads")
      .select("email, qodia_synced")
      .in("email", emails);
    const leadHintMap: Record<string, boolean> = {};
    (leadHints ?? []).forEach((l: any) => {
      if (l.email) leadHintMap[l.email.trim().toLowerCase()] = !!l.qodia_synced;
    });

    // Volllast-Lookup (lesend). Schlägt er fehl, werden ALLE betroffenen Verträge
    // auf sync_status=error gesetzt — registration_status bleibt unverändert.
    let lookup: Map<string, QodiaUser> | null = null;
    let lookupError: string | null = null;
    let lookupTotal = 0;
    let lookupPages = 0;
    try {
      const r = await loadAllQodiaUsers(qodiaApiKey);
      lookup = r.byEmail;
      lookupTotal = r.total;
      lookupPages = r.pages;
      console.log(`[qodia-status-sync] Lookup: ${r.byEmail.size} Nutzer (${r.total} laut API) über ${r.pages} Seite(n).`);
    } catch (e) {
      lookupError = String(e instanceof Error ? e.message : e).slice(0, 500);
      console.error("[qodia-status-sync] Lookup fehlgeschlagen:", lookupError);
    }

    let synced = 0;
    let errors = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const c of contracts as ContractRow[]) {
      try {
        if (!c.email) continue;
        const emailKey = c.email.trim().toLowerCase();

        // Ensure a row exists
        await supabase
          .from("contract_provider_status")
          .upsert(
            { contract_id: c.id, provider: PROVIDER },
            { onConflict: "contract_id,provider", ignoreDuplicates: true },
          );

        const hint = leadHintMap[emailKey] === true;

        let newSyncStatus: "not_started" | "transferred" | "error" | "unknown";
        let newRegistrationStatus: "not_registered" | "invited" | "registered" | "active" | null = null;
        let errorMessage: string | null = null;
        let metadataPatch: Record<string, unknown> | null = null;

        if (!lookup) {
          newSyncStatus = "error";
          errorMessage = `Qodia-Lookup nicht möglich: ${lookupError}`;
        } else {
          const match = lookup.get(emailKey);
          if (match) {
            newSyncStatus = "transferred";
            newRegistrationStatus = "registered";
            metadataPatch = {
              lookup: "found",
              qodia_name: match.name ?? null,
              qodia_created_at: match.createdAt ?? null,
              lookup_at: new Date().toISOString(),
            };
          } else {
            // Kein Konto bei Qodia. Mapping bleibt wie bisher ("invited"),
            // die präzise Wahrheit steht in metadata.lookup.
            newSyncStatus = hint ? "transferred" : "not_started";
            newRegistrationStatus = "invited";
            metadataPatch = {
              lookup: "not_found",
              qodia_name: null,
              qodia_created_at: null,
              lookup_at: new Date().toISOString(),
            };
          }
        }

        const update: Record<string, unknown> = {
          sync_status: newSyncStatus,
          last_sync_at: new Date().toISOString(),
          sync_error_message: errorMessage,
        };
        if (newRegistrationStatus) {
          update.registration_status = newRegistrationStatus;
        }
        if (metadataPatch) {
          // Bestehende metadata-Keys erhalten, nur Lookup-Felder überschreiben.
          const { data: existing } = await supabase
            .from("contract_provider_status")
            .select("metadata")
            .eq("contract_id", c.id)
            .eq("provider", PROVIDER)
            .maybeSingle();
          const prev = (existing?.metadata && typeof existing.metadata === "object") ? existing.metadata as Record<string, unknown> : {};
          update.metadata = { ...prev, ...metadataPatch };
        }

        const { error: upErr } = await supabase
          .from("contract_provider_status")
          .update(update)
          .eq("contract_id", c.id)
          .eq("provider", PROVIDER);
        if (upErr) throw upErr;

        // Refresh usage aggregates from usage_charges (idempotent SQL function)
        await supabase.rpc("recompute_contract_provider_usage", {
          _contract_id: c.id,
          _provider: PROVIDER,
        });

        synced++;
        if (onlyContractId) {
          results.push({
            contract_id: c.id,
            hfx_customer_number: c.hfx_customer_number,
            sync_status: newSyncStatus,
            registration_status: newRegistrationStatus,
            metadata: metadataPatch,
            error: errorMessage,
          });
        }
      } catch (e) {
        console.error(`[qodia-status-sync] Fehler bei ${c.id}:`, e);
        errors++;
        await supabase
          .from("contract_provider_status")
          .update({
            sync_status: "error",
            sync_error_message: String(e).slice(0, 500),
            last_sync_at: new Date().toISOString(),
          })
          .eq("contract_id", c.id)
          .eq("provider", PROVIDER);
      }
    }

    console.log(`[qodia-status-sync] Fertig: ${synced} synchronisiert, ${errors} Fehler.`);
    return new Response(
      JSON.stringify({
        success: true,
        synced,
        errors,
        provider: PROVIDER,
        lookup: lookup
          ? { ok: true, users: lookup.size, total: lookupTotal, pages: lookupPages }
          : { ok: false, error: lookupError },
        ...(onlyContractId ? { results } : {}),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[qodia-status-sync] Unbekannter Fehler:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
