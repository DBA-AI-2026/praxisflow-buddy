import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  sales_partner: "Vertriebspartner",
  sales_lead: "Vertriebsleitung",
  user: "Benutzer",
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
          const portalUrl = "https://praxisflow-buddy.lovable.app";
          await resend.emails.send({
            from: "HFX Sales Portal <onboarding@resend.dev>",
            to: [email],
            subject: "Ihr Passwort wurde zurückgesetzt - HFX Sales Portal",
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
                  .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
                  .info-box { background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0; }
                  .button { display: inline-block; background: #f97316; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px; }
                  .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">🔐 Passwort zurückgesetzt</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">HFX Sales Portal</p>
                  </div>
                  <div class="content">
                    <p style="font-size: 16px;">Hallo <strong>${existingUser?.user_metadata?.full_name || fullName}</strong>,</p>
                    <p>Ihr Passwort für das HFX Sales Portal wurde von einem Administrator zurückgesetzt.</p>
                    
                    <div class="info-box">
                      <p style="margin: 0; color: #92400e;">
                        <strong>⚠️ Wichtig:</strong> Sie erhalten in Kürze eine weitere E-Mail mit Ihren neuen Zugangsdaten.
                      </p>
                    </div>
                    
                    <p>Falls Sie diese Änderung nicht angefordert haben, kontaktieren Sie bitte umgehend Ihren Administrator.</p>
                    
                    <div style="text-align: center; margin: 25px 0;">
                      <a href="${portalUrl}" class="button" style="color: white;">Zum Portal</a>
                    </div>
                  </div>
                  <div class="footer">
                    <p style="margin: 0;">Bei Fragen wenden Sie sich bitte an Ihren Administrator.</p>
                    <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
                  </div>
                </div>
              </body>
              </html>
            `,
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

      // Update role if different
      const { data: currentRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (currentRole?.role !== role) {
        if (currentRole) {
          await supabaseAdmin
            .from("user_roles")
            .update({ role })
            .eq("user_id", userId);
        } else {
          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role });
        }
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

    // Store temporary password in profile
    await supabaseAdmin
      .from("profiles")
      .update({ temp_password: password })
      .eq("user_id", userId);

    // Send welcome email with credentials
    let emailSent = false;
    if (sendEmail) {
      try {
        const portalUrl = "https://praxisflow-buddy.lovable.app";
        const roleLabel = roleLabels[role] || role;

        const emailResponse = await resend.emails.send({
          from: "HFX Sales Portal <onboarding@resend.dev>",
          to: [email],
          subject: "Ihre Zugangsdaten für das HFX Sales Portal",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
                .credentials { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0; }
                .field { margin-bottom: 15px; }
                .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
                .value { font-size: 16px; background: #f3f4f6; padding: 10px 12px; border-radius: 6px; font-family: monospace; }
                .button { display: inline-block; background: #f97316; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px; }
                .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
                .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin-top: 15px; font-size: 14px; color: #92400e; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0; font-size: 28px;">🦊 Willkommen!</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">HFX Sales Portal</p>
                </div>
                <div class="content">
                  <p style="font-size: 16px;">Hallo <strong>${fullName}</strong>,</p>
                  <p>Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als <strong>${roleLabel}</strong> registriert.</p>
                  
                  <div class="credentials">
                    <h3 style="margin-top: 0; color: #374151;">Ihre Zugangsdaten</h3>
                    <div class="field">
                      <div class="label">E-Mail</div>
                      <div class="value">${email}</div>
                    </div>
                    <div class="field">
                      <div class="label">Temporäres Passwort</div>
                      <div class="value">${password}</div>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${portalUrl}" class="button" style="color: white;">Zum Portal anmelden</a>
                  </div>
                  
                  <div class="warning">
                    ⚠️ <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.
                  </div>
                </div>
                <div class="footer">
                  <p style="margin: 0;">Bei Fragen wenden Sie sich bitte an Ihren Administrator.</p>
                  <p style="margin: 10px 0 0 0; font-size: 12px;">© Honorarfuchs - HFX Sales Portal</p>
                </div>
              </div>
            </body>
            </html>
          `,
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
