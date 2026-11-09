import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireActiveRole } from "../_shared/auth.ts";

const TABLES = ["leads", "contracts", "customers"] as const;
const UPDATE_URL = "https://auth.qodia.de/api/external/update-user";
const FAILED = "Änderung fehlgeschlagen: Das Login-Konto des Kunden konnte nicht umgestellt werden. Es wurde nichts geändert.";
const ADMIN_ERROR = "Änderung fehlgeschlagen. Bitte Admin informieren.";
const schema = z.object({
  hfx_customer_number: z.string().trim().min(1).max(100).regex(/^HFX-[A-Za-z0-9-]+$/),
  newEmail: z.string().trim().toLowerCase().email().max(255),
});
type Row = { id: string; email: string | null };
type Result = { status: "success" | "error" | "not_found" | "rate_limited" | "unreachable" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function updateLogin(email: string, newEmail: string, apiKey: string): Promise<Result> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(UPDATE_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ email, newEmail }), signal: controller.signal,
    });
    const raw = await response.text();
    if (response.status === 429) return { status: "rate_limited" };
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return { status: "error" }; }
    if (!body || typeof body !== "object") return { status: "error" };
    const message = [body.error, body.message, body.code].filter(v => typeof v === "string").join(" ");
    if (response.status === 404 || /user.?not.?found|user.*nicht gefunden|no.*user.*found|user.*does not exist/i.test(message)) {
      return { status: "not_found" };
    }
    return { status: response.ok && body.success === true && !body.error ? "success" : "error" };
  } catch { return { status: "unreachable" }; }
  finally { clearTimeout(timeout); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const guard = await requireActiveRole(req, ["admin", "sales_lead", "regional_lead", "user"], corsHeaders);
  if (guard instanceof Response) return guard;
  try {
    const input = await req.json().catch(() => null);
    // HFX is checked before accessing any customer data. Email validation follows RLS.
    const hfxParsed = schema.shape.hfx_customer_number.safeParse(input?.hfx_customer_number);
    if (!hfxParsed.success) return json(400, { error: "Ungültige Kundennummer." });
    const hfx = hfxParsed.data;
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return json(500, { error: ADMIN_ERROR });
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    // Responsibility: only caller-JWT/RLS reads, before service-side customer reads.
    const visible = await Promise.all(TABLES.map(table => caller.from(table).select("id").eq("hfx_customer_number", hfx)));
    if (visible.some(r => r.error) || !visible.some(r => (r.data ?? []).length > 0)) return json(403, { error: "Forbidden" });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return json(400, { error: "Ungültige E-Mail-Adresse." });
    const { newEmail } = parsed.data;
    const admin = guard.admin;
    const existing = await Promise.all(TABLES.map(table => admin.from(table).select("id,email").eq("hfx_customer_number", hfx)));
    if (existing.some(r => r.error)) return json(500, { error: ADMIN_ERROR });
    const rows: Row[][] = existing.map(r => r.data ?? []);
    const all = rows.flat();
    const oldEmail = all[0]?.email;
    // 4a: compare EVERY existing row, including NULL/empty; RPC matches raw old email exactly.
    if (!oldEmail || all.some(row => row.email !== oldEmail)) return json(409, {
      error: "Die gespeicherten E-Mails dieses Kunden weichen voneinander ab. Bitte Admin informieren.",
    });
    const escapedEmail = newEmail.replace(/[\\%_]/g, "\\$&");
    const duplicates = await Promise.all(TABLES.map(table => admin.from(table).select("id,hfx_customer_number").ilike("email", escapedEmail)));
    if (duplicates.some(r => r.error)) return json(500, { error: ADMIN_ERROR });
    if (duplicates.some(r => (r.data ?? []).some(row => row.hfx_customer_number !== hfx))) return json(409, {
      error: "Diese E-Mail ist bereits einem anderen Kunden zugeordnet.",
    });
    if (newEmail === oldEmail.trim().toLowerCase()) return json(400, { error: "Die neue E-Mail entspricht der bisherigen E-Mail. Es wurde nichts geändert." });
    const leadId = rows[0][0]?.id ?? null;
    const contractId = rows[1][0]?.id ?? null;
    // customer_events only supports lead/contract entities. Do not invent customer events.
    if (!leadId && !contractId) return json(409, { error: "Protokollierung ohne Interessent oder Vertrag nicht möglich. Bitte Admin informieren." });
    const apiKey = Deno.env.get("QODIA_API_KEY");
    if (!apiKey) return json(500, { error: ADMIN_ERROR });
    const record = async (result: Result, outcome: string, rollback: Result | null = null) => {
      const { error } = await admin.from("customer_events").insert({
        event_type: "LOGIN_EMAIL_CHANGED", entity_type: leadId ? "lead" : "contract",
        entity_id: leadId ?? contractId, lead_id: leadId, contract_id: contractId,
        hfx_customer_number: hfx, created_by: guard.userId,
        event_data: { old_email: oldEmail, new_email: newEmail, changed_by: guard.userId,
          changed_at: new Date().toISOString(), qodia_result: result.status, outcome, rollback_result: rollback?.status ?? null },
      });
      if (error) console.error("[change-login-email] event insert failed");
      return !error;
    };
    const result = await updateLogin(oldEmail, newEmail, apiKey);
    if (result.status !== "success") {
      const logged = await record(result, "provider_failed");
      const error = !logged ? ADMIN_ERROR : result.status === "not_found"
        ? "Für diesen Datensatz besteht kein Login-Konto. Es wurde nichts geändert." : FAILED;
      return json(result.status === "rate_limited" ? 429 : 502, { success: false, error });
    }
    const { error: rpcError } = await admin.rpc("apply_login_email_change", { p_hfx: hfx, p_old: oldEmail, p_new: newEmail });
    if (rpcError) {
      const rollback = await updateLogin(newEmail, oldEmail, apiKey);
      await record(result, "database_failed", rollback);
      return json(500, { success: false, error: ADMIN_ERROR });
    }
    const logged = await record(result, "success");
    if (!logged) return json(500, { success: false, changed: true, error: ADMIN_ERROR });
    return json(200, { success: true });
  } catch {
    console.error("[change-login-email] unexpected failure");
    return json(500, { success: false, error: ADMIN_ERROR });
  }
});