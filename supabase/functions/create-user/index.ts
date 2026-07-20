import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail, renderBrandedButton } from "../_shared/email-templates/baseEmailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Produktivdomain — liefert denselben Build wie die Lovable-Preview.
// In der Zugangsdaten-Mail kundensichtbar (Login-Button).
const PORTAL_URL = "https://sales.hfx-honorarfuchs.de";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  sales_partner: "Vertriebspartner",
  sales_lead: "Vertriebsleitung",
  regional_lead: "Regionalleiter",
  vertragsabteilung: "Vertragsabteilung",
  tippgeber: "Tippgeber",
  user: "Gebietsleiter",
};

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { 
      email, 
      fullName, 
      role = "user", 
      sendEmail = true, 
      checkOnly = false,
      confirmReset = false,
      notifyBeforeReset = false,
    } = await req.json();

    if (!email || !fullName) {
      return new Response(
        JSON.stringify({ error: "Email and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    // If checkOnly mode, just return whether user exists
    if (checkOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          userExists: !!existingUser,
          existingUserName: existingUser?.user_metadata?.full_name || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If user exists but confirmReset is false, return error
    if (existingUser && !confirmReset) {
      return new Response(
        JSON.stringify({ 
          error: "User already exists", 
          userExists: true,
          existingUserName: existingUser?.user_metadata?.full_name,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate secure password
    const password = generatePassword();

    let userId: string;
    let isExistingUser = false;

    if (existingUser) {
      // User exists - update their password
      console.log("User exists, updating password for:", email);
      isExistingUser = true;
      userId = existingUser.id;

      // Send notification email before reset if requested
      if (notifyBeforeReset) {
        try {
          const displayName = existingUser?.user_metadata?.full_name || fullName;
          const resetBodyHtml = `
      <p style="font-size:12pt;color:#333333;margin:0 0 16px 0;">Hallo <strong>${displayName}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">Ihr Passwort für das HFX Sales Portal wurde von einem Administrator zurückgesetzt.</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#fff8e1;border-radius:8px;border:1px solid #f59e0b;margin-bottom:24px;">
        <tr><td style="padding:16px 20px;font-size:11pt;color:#92400e;">
          <strong>Wichtig:</strong> Sie erhalten in Kürze eine weitere E-Mail mit Ihren neuen Zugangsdaten.
        </td></tr>
      </table>
      <p style="font-size:10pt;color:#888888;margin:0 0 8px 0;">Falls Sie diese Änderung nicht angefordert haben, kontaktieren Sie bitte umgehend Ihren Administrator.</p>`;
          const resetBodyText = [
            `Hallo ${displayName},`,
            "",
            "Ihr Passwort für das HFX Sales Portal wurde von einem Administrator zurückgesetzt.",
            "",
            "Wichtig: Sie erhalten in Kürze eine weitere E-Mail mit Ihren neuen Zugangsdaten.",
            "",
            "Falls Sie diese Änderung nicht angefordert haben, kontaktieren Sie bitte umgehend Ihren Administrator.",
          ].join("\n");
          const resetMail = renderBrandedEmail({
            subheadline: "Ihr Passwort wurde zurückgesetzt",
            bodyHtml: resetBodyHtml,
            bodyText: resetBodyText,
          });
          await resend.emails.send({
            from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
            reply_to: "info@hfx-honorarfuchs.de",
            to: [email],
            subject: "Ihr Passwort wurde zurückgesetzt – HFX Sales Portal",
            html: resetMail.html,
            text: resetMail.text,
          });
          console.log("Password reset notification sent to:", email);
        } catch (notifyError) {
          console.error("Failed to send reset notification:", notifyError);
          // Continue anyway
        }
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { full_name: fullName },
      });

      if (updateError) {
        console.error("Error updating user password:", updateError);
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update role if different (multi-role-safe, Variante C)
      const { data: activeRoles, error: rolesLookupError } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (rolesLookupError) {
        console.error("Error loading user roles:", rolesLookupError);
        return new Response(
          JSON.stringify({ error: rolesLookupError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentRoles = (activeRoles ?? []).map((r: { role: string }) => r.role);

      if (currentRoles.length === 0) {
        // No active role → insert desired role
        const { error: insertRoleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (insertRoleError) {
          console.error("Error inserting user role:", insertRoleError);
          return new Response(
            JSON.stringify({ error: insertRoleError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (currentRoles.length === 1) {
        const existing = currentRoles[0];
        if (existing !== role) {
          // Row-precise UPDATE with mandatory role filter
          const { error: updateRoleError } = await supabaseAdmin
            .from("user_roles")
            .update({ role })
            .eq("user_id", userId)
            .eq("role", existing);
          if (updateRoleError) {
            console.error("Error updating user role:", updateRoleError);
            return new Response(
              JSON.stringify({ error: updateRoleError.message }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        // else: identical → no-op
      } else {
        // >1 active roles → refuse to write, surface clear error
        return new Response(
          JSON.stringify({
            error: `Nutzer hat mehrere aktive Rollen (${currentRoles.join(", ")}). Rollen bitte über die Benutzerverwaltung ändern.`,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Assign role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (roleError) {
        console.error("Error assigning role:", roleError);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: "Failed to assign role" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Temporary password is no longer stored in DB for security reasons

    // Send welcome email with credentials
    let emailSent = false;
    if (sendEmail) {
      try {
        const roleLabel = roleLabels[role] || role;

        const welcomeBodyHtml = `
      <p style="font-size:12pt;color:#333333;margin:0 0 12px 0;">Hallo <strong>${fullName}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als <strong>${roleLabel}</strong> registriert.</p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background-color:#f0f4f8;border-radius:8px;border:1px solid #d0d5dd;margin-bottom:24px;">
        <tr><td align="left" valign="top" style="color:#444444;font-family:verdana,geneva,sans-serif;font-size:12pt;line-height:20pt;">
          <strong style="font-size:10pt;color:#0b367f;text-transform:uppercase;letter-spacing:0.5px;">Ihre Zugangsdaten</strong><br><br>
          <strong>Registrierte E-Mail-Adresse:</strong> ${email}<br>
          <strong>Temporäres Passwort:</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px;font-size:13pt;letter-spacing:1px;">${password}</code>
        </td></tr>
      </table>
      ${renderBrandedButton({ href: PORTAL_URL, label: "Zum Portal anmelden" })}
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="background:#fff8e1;border-radius:6px;border:1px solid #f59e0b;">
        <tr><td style="font-size:10pt;color:#92400e;font-family:verdana,geneva,sans-serif;">
          <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung unter Einstellungen → Sicherheit.
        </td></tr>
      </table>`;
        const welcomeBodyText = [
          `Hallo ${fullName},`,
          "",
          `Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als ${roleLabel} registriert.`,
          "",
          "Ihre Zugangsdaten:",
          `Registrierte E-Mail-Adresse: ${email}`,
          `Temporäres Passwort: ${password}`,
          "",
          `Zum Portal anmelden: ${PORTAL_URL}`,
          "",
          "Wichtig: Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung unter Einstellungen → Sicherheit.",
        ].join("\n");
        const welcomeMail = renderBrandedEmail({
          subheadline: "Ihre Zugangsdaten",
          bodyHtml: welcomeBodyHtml,
          bodyText: welcomeBodyText,
        });

        const emailResponse = await resend.emails.send({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          to: [email],
          subject: "Ihre Zugangsdaten für das HFX Sales Portal",
          html: welcomeMail.html,
          text: welcomeMail.text,
        });

        console.log("Welcome email sent successfully:", emailResponse);
        emailSent = true;
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Don't fail the whole operation if email fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        credentials: { email, password },
        user: { id: userId, email, fullName, role },
        emailSent,
        isExistingUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const length = 16;
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(randomBytes[i] % chars.length);
  }
  return password;
}
