// contract-merge-diagnose
// Read-only diagnostic edge function. Given an HFX customer number, lists all
// contracts for that number, counts FK-references in every dependent table,
// and returns a copy/paste-ready merge plan in the order the DB requires
// (CASCADE first, then SET NULL/NO ACTION, then self-ref, then DELETE).
//
// UNIQUE-conflict detection is generic: for every dependent table we check
// pg_constraint/pg_index for unique constraints/indexes on the FK column.
// If both winner and loser have rows in such a table, the action becomes
// DELETE on the loser row(s) instead of UPDATE, with a warning explaining why.

import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables with FK -> contracts.id, derived from pg_constraint live-query.
// on_delete: 'c' = CASCADE, 'n' = SET NULL, 'a' = NO ACTION, 'd' = SET DEFAULT, 'r' = RESTRICT
const FK_TABLES: Array<{ table: string; column: string; on_delete: "c" | "n" | "a" | "d" | "r" }> = [
  { table: "agb_acceptances",              column: "contract_id",        on_delete: "c" },
  { table: "commission_payouts",           column: "contract_id",        on_delete: "n" },
  { table: "contract_cases",               column: "contract_id",        on_delete: "n" },
  { table: "contract_provider_status",     column: "contract_id",        on_delete: "c" },
  { table: "fibu_events",                  column: "contract_id",        on_delete: "a" },
  { table: "invoices",                     column: "contract_id",        on_delete: "n" },
  { table: "praxis_reservations",          column: "contract_id",        on_delete: "n" },
  { table: "signature_audit_logs",         column: "contract_id",        on_delete: "c" },
  { table: "tippgeber_milestone_tracking", column: "contract_id",        on_delete: "c" },
  { table: "usage_charges",                column: "contract_id",        on_delete: "n" },
  // self-reference handled separately
];

const COMPLETENESS_FIELDS = [
  "praxisanschrift", "adresse", "plz", "ort", "telefon", "email",
  "kontoinhaber", "iban", "bic", "bsnr", "lanr",
  "signature_data", "vertrieb_signature_data", "mandate_accepted_at",
];

interface FkSample { id: string; created_at: string | null; status?: string | null }
interface FkRefBlock {
  count: number;
  rows: FkSample[];
  on_delete: string;
  unique_blocking: boolean;
}
interface ContractDiag {
  id: string;
  created_at: string;
  status: string | null;
  parent_contract_id: string | null;
  completeness_score: number;
  completeness_missing: string[];
  fk_references: Record<string, FkRefBlock>;
  parent_contract_id_self_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth: admin only ───────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const hfx = (body?.hfx_customer_number ?? "").toString().trim();
    if (!hfx) {
      return new Response(JSON.stringify({ error: "hfx_customer_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Load contracts for this HFX ────────────────────────────────────────
    const { data: contracts, error: cErr } = await admin
      .from("contracts").select("*")
      .eq("hfx_customer_number", hfx)
      .order("created_at", { ascending: true });
    if (cErr) throw cErr;
    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({
        hfx_customer_number: hfx, contracts: [], merge_recommendation: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Build per-contract diagnostic ──────────────────────────────────────
    const diags: ContractDiag[] = [];
    for (const c of contracts) {
      const missing: string[] = [];
      let score = 0;
      for (const f of COMPLETENESS_FIELDS) {
        const v = (c as any)[f];
        if (v === null || v === undefined || v === "") missing.push(f);
        else score++;
      }

      const fkBlocks: Record<string, FkRefBlock> = {};
      for (const fk of FK_TABLES) {
        const { data: rows, count } = await admin
          .from(fk.table)
          .select("id, created_at" + (fk.table === "invoices" || fk.table === "contract_cases" || fk.table === "commission_payouts" ? ", status" : ""), { count: "exact" })
          .eq(fk.column, c.id)
          .limit(5);
        fkBlocks[fk.table] = {
          count: count ?? (rows?.length ?? 0),
          rows: (rows ?? []) as FkSample[],
          on_delete: ({ c: "CASCADE", n: "SET NULL", a: "NO ACTION", d: "SET DEFAULT", r: "RESTRICT" })[fk.on_delete],
          unique_blocking: false,
        };
      }

      const { count: childCount } = await admin
        .from("contracts").select("id", { count: "exact", head: true })
        .eq("parent_contract_id", c.id);

      diags.push({
        id: c.id,
        created_at: c.created_at,
        status: c.status,
        parent_contract_id: c.parent_contract_id,
        completeness_score: score,
        completeness_missing: missing,
        fk_references: fkBlocks,
        parent_contract_id_self_count: childCount ?? 0,
      });
    }

    if (diags.length < 2) {
      return new Response(JSON.stringify({
        hfx_customer_number: hfx, contracts: diags, merge_recommendation: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Pick winner: highest completeness_score; tiebreak = newest ─────────
    const sorted = [...diags].sort((a, b) => {
      if (b.completeness_score !== a.completeness_score) return b.completeness_score - a.completeness_score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);

    const reasons: string[] = [];
    reasons.push(
      `Winner ${winner.id} hat completeness_score=${winner.completeness_score}` +
      (winner.completeness_missing.length ? ` (fehlt: ${winner.completeness_missing.join(", ")})` : " (alle Felder gesetzt)")
    );
    for (const l of losers) {
      reasons.push(`Loser ${l.id}: completeness_score=${l.completeness_score}`);
    }

    // ── Generic UNIQUE-conflict detection via RPC (pg_constraint + pg_index) ──
    // The RPC `public.get_fk_unique_columns(table, column)` returns TRUE if the
    // FK column itself carries a single-column UNIQUE constraint/index (1:1
    // relation — UPDATE would crash). For composite UNIQUE constraints we still
    // fall back to value-comparison between winner/loser rows on non-skip
    // fields, since the RPC only answers about single-column uniqueness.
    const warnings: string[] = [];
    const uniqueDeleteTables = new Set<string>();
    for (const fk of FK_TABLES) {
      const winnerHas = winner.fk_references[fk.table].count > 0;
      const anyLoserHas = losers.some((l) => l.fk_references[fk.table].count > 0);
      if (!winnerHas || !anyLoserHas) continue;

      // (1) Ask the DB: is the FK column itself UNIQUE? (1:1 relation)
      const { data: fkColUnique, error: rpcErr } = await admin.rpc("get_fk_unique_columns", {
        p_table: fk.table, p_column: fk.column,
      });
      if (rpcErr) {
        warnings.push(`${fk.table}: get_fk_unique_columns RPC fehlgeschlagen (${rpcErr.message}) — falle auf Heuristik zurück.`);
      }
      if (fkColUnique === true) {
        uniqueDeleteTables.add(fk.table);
        fk_block(diags, fk.table).unique_blocking = true;
        warnings.push(
          `${fk.table}: UNIQUE-Constraint/Index direkt auf '${fk.column}' (1:1-Relation). Loser-Row(s) müssen per DELETE entfernt werden statt UPDATE.`,
        );
        continue;
      }

      // (2) Composite UNIQUE / data-level conflict: vergleiche Row-Werte
      //     paarweise auf gleichlautende Nicht-Skip-Felder.
      for (const l of losers) {
        const loserHas = l.fk_references[fk.table].count > 0;
        if (!loserHas) continue;
        const [{ data: wRows }, { data: lRows }] = await Promise.all([
          admin.from(fk.table).select("*").eq(fk.column, winner.id),
          admin.from(fk.table).select("*").eq(fk.column, l.id),
        ]);
        const skip = new Set(["id", "created_at", "updated_at", fk.column]);
        let conflict = false;
        let conflictKey = "";
        for (const wr of (wRows ?? [])) {
          for (const lr of (lRows ?? [])) {
            for (const k of Object.keys(wr)) {
              if (skip.has(k)) continue;
              if (wr[k] !== null && wr[k] !== undefined && wr[k] === (lr as any)[k]) {
                conflict = true;
                conflictKey = k;
                break;
              }
            }
            if (conflict) break;
          }
          if (conflict) break;
        }
        if (conflict) {
          uniqueDeleteTables.add(fk.table);
          fk_block(diags, fk.table).unique_blocking = true;
          warnings.push(
            `${fk.table}: Winner und Loser haben Rows mit identischem Wert in '${conflictKey}' — vermutlich zusammengesetzter UNIQUE (z.B. (${fk.column}, ${conflictKey})). Action wird DELETE auf Loser-Row statt UPDATE.`,
          );
        }
      }
    }

    // ── Build action list in required order ───────────────────────────────
    type Action = {
      step: number;
      table: string;
      operation: "UPDATE" | "DELETE";
      from_contract_id?: string;
      to_contract_id?: string;
      where?: Record<string, string>;
      row_count: number;
      sql: string;
    };
    const actions: Action[] = [];
    let step = 0;

    const cascadeTables = FK_TABLES.filter((f) => f.on_delete === "c");
    const otherTables   = FK_TABLES.filter((f) => f.on_delete !== "c");

    const emit = (table: string, fkCol: string, loser: ContractDiag, isUniqueDelete: boolean) => {
      const cnt = loser.fk_references[table].count;
      if (cnt === 0) return;
      step++;
      if (isUniqueDelete) {
        actions.push({
          step, table, operation: "DELETE",
          where: { [fkCol]: loser.id },
          row_count: cnt,
          sql: `DELETE FROM public.${table} WHERE ${fkCol} = '${loser.id}';`,
        });
      } else {
        actions.push({
          step, table, operation: "UPDATE",
          from_contract_id: loser.id, to_contract_id: winner.id,
          row_count: cnt,
          sql: `UPDATE public.${table} SET ${fkCol} = '${winner.id}' WHERE ${fkCol} = '${loser.id}';`,
        });
      }
    };

    // 1) CASCADE tables first
    for (const l of losers) for (const fk of cascadeTables) emit(fk.table, fk.column, l, uniqueDeleteTables.has(fk.table));
    // 2) SET NULL / NO ACTION
    for (const l of losers) for (const fk of otherTables)   emit(fk.table, fk.column, l, uniqueDeleteTables.has(fk.table));
    // 3) self-reference parent_contract_id on contracts (addenda)
    for (const l of losers) {
      if (l.parent_contract_id_self_count > 0) {
        step++;
        actions.push({
          step, table: "contracts", operation: "UPDATE",
          from_contract_id: l.id, to_contract_id: winner.id,
          row_count: l.parent_contract_id_self_count,
          sql: `UPDATE public.contracts SET parent_contract_id = '${winner.id}' WHERE parent_contract_id = '${l.id}';`,
        });
      }
    }
    // 4) finally DELETE losers
    for (const l of losers) {
      step++;
      actions.push({
        step, table: "contracts", operation: "DELETE",
        where: { id: l.id },
        row_count: 1,
        sql: `DELETE FROM public.contracts WHERE id = '${l.id}';`,
      });
    }

    return new Response(JSON.stringify({
      hfx_customer_number: hfx,
      contracts: diags,
      merge_recommendation: {
        winner_id: winner.id,
        loser_ids: losers.map((l) => l.id),
        reasons,
        actions,
        warnings,
      },
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function fk_block(diags: ContractDiag[], table: string) {
  for (const d of diags) {
    if (d.fk_references[table]) return d.fk_references[table];
  }
  return { count: 0, rows: [], on_delete: "", unique_blocking: false };
}
