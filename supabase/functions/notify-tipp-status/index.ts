import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";


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
  neu: "#1d4ed8",
  in_bearbeitung: "#b45309",
  abgeschlossen: "#047857",
  abgelehnt: "#b91c1c",
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

    // Check email notification settings
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .eq("setting_key", "tipp_status_notification");
    const tippStatusEnabled = (emailSettings?.[0]?.is_enabled) !== false;

    if (!tippgeberEmail || !RESEND_API_KEY || !tippStatusEnabled) {
      const reason = !tippStatusEnabled ? "E-Mail-Benachrichtigung deaktiviert" : "Keine E-Mail-Adresse hinterlegt";
      return new Response(
        JSON.stringify({ success: true, email_sent: false, reason }),
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

    const bodyHtml = `
        <p style="margin:0 0 16px 0;font-size:11pt;color:#333333;">Hallo <strong>${tippgeberName}</strong>,</p>
        <p style="margin:0 0 24px 0;font-size:11pt;color:#555555;line-height:1.6;">
          der Status Ihres Lead-Tipps für <strong style="color:#111827;">${tip.praxis_name}</strong> wurde aktualisiert.
        </p>
        <div style="text-align:center;margin:0 0 24px 0;">
          <span style="display:inline-block;background:${statusColor};color:#ffffff;border-radius:20px;padding:8px 24px;font-size:13pt;font-weight:700;font-family:verdana,geneva,sans-serif;">
            ${statusLabel}
          </span>
        </div>
        <p style="margin:0 0 24px 0;font-size:11pt;color:#555555;line-height:1.6;text-align:center;">
          ${statusNote[newStatus] ?? ""}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 8px 0;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-family:verdana,geneva,sans-serif;">Ihr Lead</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:10pt;color:#6b7280;width:140px;font-family:verdana,geneva,sans-serif;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-weight:500;font-family:verdana,geneva,sans-serif;">${tip.arzt_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#6b7280;font-family:verdana,geneva,sans-serif;">Praxis</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-weight:500;font-family:verdana,geneva,sans-serif;">${tip.praxis_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#6b7280;font-family:verdana,geneva,sans-serif;">PLZ</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-family:verdana,geneva,sans-serif;">${tip.plz}</td></tr>
              <tr><td style="padding:4px 0;font-size:10pt;color:#6b7280;font-family:verdana,geneva,sans-serif;">Geschäftsbereich</td><td style="padding:4px 0;font-size:10pt;color:#111827;font-family:verdana,geneva,sans-serif;">${tip.geschaeftsbereich}</td></tr>
            </table>
          </td></tr>
        </table>
    `;

    const bodyText = [
      `Hallo ${tippgeberName},`,
      "",
      `der Status Ihres Lead-Tipps für ${tip.praxis_name} wurde aktualisiert.`,
      "",
      `Neuer Status: ${statusLabel}`,
      statusNote[newStatus] ?? "",
      "",
      `Arzt / Ärztin: ${tip.arzt_name}`,
      `Praxis: ${tip.praxis_name}`,
      `PLZ: ${tip.plz}`,
      `Geschäftsbereich: ${tip.geschaeftsbereich}`,
    ].filter(Boolean).join("\n");

    const { html, text } = renderBrandedEmail({
      subheadline: "Status-Update zu Ihrem Lead-Tipp",
      bodyHtml,
      bodyText,
    });

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [tippgeberEmail],
        subject: `Status Ihres Tipps für ${tip.praxis_name}: ${statusLabel}`,
        html,
        text,
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
