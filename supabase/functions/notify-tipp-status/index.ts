import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_LABELS: Record<string, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  abgeschlossen: "Abgeschlossen",
  abgelehnt: "Abgelehnt",
};

const STATUS_COLORS: Record<string, string> = {
  neu: "#3b82f6",
  in_bearbeitung: "#f59e0b",
  abgeschlossen: "#10b981",
  abgelehnt: "#ef4444",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    // Auth: validate calling user is admin or sales_lead
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Check role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const userRoles = roles?.map((r: any) => r.role) ?? [];
    if (!userRoles.includes("admin") && !userRoles.includes("sales_lead")) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tippLeadId, newStatus } = body;
    if (!tippLeadId || !newStatus) {
      return new Response(JSON.stringify({ error: "tippLeadId und newStatus sind erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the tipp_lead
    const { data: tip, error: tipError } = await supabase
      .from("tipp_leads")
      .select("*")
      .eq("id", tippLeadId)
      .single();
    if (tipError || !tip) {
      return new Response(JSON.stringify({ error: "Tipp nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status
    const { error: updateError } = await supabase
      .from("tipp_leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", tippLeadId);
    if (updateError) throw updateError;

    // Load tippgeber profile for email
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", tip.created_by)
      .single();

    const tippgeberEmail = profile?.email ?? null;
    const tippgeberName = profile?.full_name ?? "Tippgeber";

    if (!tippgeberEmail || !RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ success: true, email_sent: false, reason: "Keine E-Mail-Adresse hinterlegt" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
    const statusColor = STATUS_COLORS[newStatus] ?? "#6b7280";

    const statusNote: Record<string, string> = {
      in_bearbeitung: "Unser Vertriebsteam hat Ihren Tipp aufgenommen und bearbeitet ihn aktuell.",
      abgeschlossen: "Der Lead wurde erfolgreich bearbeitet und abgeschlossen. Vielen Dank für Ihre wertvolle Empfehlung!",
      abgelehnt: "Der Lead konnte leider nicht weiterverfolgt werden. Bei Fragen kontaktieren Sie uns gerne.",
      neu: "Der Status wurde auf Neu zurückgesetzt.",
    };

    const emailHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Status Ihres Lead-Tipps aktualisiert</h1>
        <p style="margin:8px 0 0;color:#c7d7f5;font-size:14px;">HFX Honorarfuchs Vertriebsportal</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo <strong>${tippgeberName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          der Status Ihres Lead-Tipps für <strong style="color:#111827;">${tip.praxis_name}</strong> wurde aktualisiert.
        </p>
        <!-- Status badge -->
        <div style="text-align:center;margin:0 0 24px;">
          <span style="display:inline-block;background:${statusColor}1a;color:${statusColor};border:1px solid ${statusColor}33;border-radius:20px;padding:8px 24px;font-size:15px;font-weight:700;">
            ${statusLabel}
          </span>
        </div>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;text-align:center;">
          ${statusNote[newStatus] ?? ""}
        </p>
        <!-- Lead details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Ihr Lead</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:140px;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.arzt_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.praxis_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.plz}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Geschäftsbereich</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.geschaeftsbereich}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "noreply@hfx-honorarfuchs.de",
        to: [tippgeberEmail],
        subject: `Status Ihres Tipps für ${tip.praxis_name}: ${statusLabel}`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailRes.ok }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("notify-tipp-status error:", err);
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
