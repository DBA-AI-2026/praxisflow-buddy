// ban-ghost-users
// Wartungs-Tool: neutralisiert "Ghost"-Auth-User, die durch frühere
// automatische createUser-Aufrufe (u. a. resend-lead-credentials) entstanden
// sind. Ghost = nie eingeloggt, nicht gebannt, keine Rolle, keine interne
// E-Mail-Domain.
//
// BEWUSST KEIN LÖSCHEN: ein Bann ist reversibel (ban_duration: "none"),
// ein Delete nicht. Idempotent, weil bereits gebannte User (banned_until
// gesetzt) nicht mehr in die Trefferliste kommen.

import { requireActiveRole } from "../_shared/auth.ts";

const ALLOWED_ORIGINS = [
  "https://sales.hfx-honorarfuchs.de",
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Interne Domains bleiben immer unangetastet.
const PROTECTED_DOMAINS = ["@carecapital.de", "@honorarfuchs.de"];

// Schmaler lokaler Typ: banned_until ist im SDK-Typ nicht durchgängig deklariert.
type AuthUserLike = {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
};

const BAN_DURATION = "876000h"; // ~100 Jahre

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const guard = await requireActiveRole(req, ["admin"], corsHeaders);
    if (guard instanceof Response) return guard;
    const { admin } = guard;

    // Fail-safe: unparsbarer Body ⇒ Dry-run.
    let dryRun = true;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === false ? false : true;
    } catch {
      dryRun = true;
    }

    // Rollen-Set: absichtlich OHNE is_active-Filter — wer je eine Rolle
    // hatte, ist kein Ghost.
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("user_id");
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const roleUserIds = new Set((roleRows ?? []).map((r: { user_id: string }) => r.user_id));

    // Alle Auth-User paginiert laden (nicht nur die erste Seite).
    const perPage = 1000;
    let page = 1;
    const allUsers: AuthUserLike[] = [];
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const batch = (data?.users ?? []) as unknown as AuthUserLike[];
      allUsers.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    const ghosts = allUsers.filter((u) => {
      if (u.last_sign_in_at != null) return false;
      if (u.banned_until != null) return false;
      const email = (u.email ?? "").toLowerCase();
      if (PROTECTED_DOMAINS.some((d) => email.endsWith(d))) return false;
      if (roleUserIds.has(u.id)) return false;
      return true;
    });

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          count: ghosts.length,
          emails: ghosts.map((g) => g.email ?? "(ohne E-Mail)"),
          ids: ghosts.map((g) => g.id),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const banned: string[] = [];
    const failed: { id: string; email: string | null; error: string }[] = [];
    for (const g of ghosts) {
      const { error } = await admin.auth.admin.updateUserById(g.id, {
        ban_duration: BAN_DURATION,
      } as unknown as Record<string, unknown>);
      if (error) {
        failed.push({ id: g.id, email: g.email ?? null, error: error.message });
      } else {
        banned.push(g.email ?? g.id);
      }
    }

    return new Response(
      JSON.stringify({ dryRun: false, banned, failed, count: banned.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
