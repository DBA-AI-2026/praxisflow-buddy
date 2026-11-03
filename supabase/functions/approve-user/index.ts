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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const guard = await requireActiveRole(req, ["admin"], corsHeaders);
    if (guard instanceof Response) return guard;
    const { userId: adminUserId, email: adminEmail, admin: supabaseAdmin } = guard;
    const user = { id: adminUserId };


    const json = (status: number, body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Serverseitiges Protokoll (best effort, darf die Aktion nicht kippen)
    const audit = async (action: string, success: boolean, details: Record<string, unknown>) => {
      const { error } = await supabaseAdmin.from("audit_logs").insert({
        user_id: adminUserId,
        user_email: adminEmail,
        action,
        resource_path: `/admin/access-requests/${details.request_id ?? ""}`,
        user_role: "admin",
        success,
        details: JSON.stringify(details),
      });
      if (error) console.error("audit_logs insert failed:", error);
    };

    const body = await req.json();
    const { requestId, action } = body;
    const rawRole = body.role;

    if (!requestId || !action) {
      return json(400, { error: "Missing requestId or action" });
    }
    if (action !== "approve" && action !== "reject") {
      return json(400, { error: "Invalid action" });
    }

    // Whitelist ohne tippgeber (Tippgeber brauchen eine Partnerzuordnung vor der Rolle)
    const ALLOWED_ROLES = ["user", "sales_partner", "sales_lead", "regional_lead", "admin"] as const;
    type AllowedRole = typeof ALLOWED_ROLES[number];
    let role: AllowedRole | null = null;
    if (action === "approve") {
      if (!ALLOWED_ROLES.includes(rawRole as AllowedRole)) {
        return json(400, { error: "Ungültige oder fehlende Rolle" });
      }
      role = rawRole as AllowedRole;
    }

    // Get the registration request
    const { data: request, error: requestError } = await supabaseAdmin
      .from("registration_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !request) {
      console.error("Registration request not found:", requestError);
      return new Response(
        JSON.stringify({ error: "Registration request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (request.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Request has already been processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject") {
      // Update request status to rejected
      const { error: updateError } = await supabaseAdmin
        .from("registration_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("Failed to reject request:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to reject request" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await audit("ACCESS_REQUEST_REJECT", true, { request_id: requestId, email: request.email });
      console.log(`Request ${requestId} rejected successfully`);
      return new Response(
        JSON.stringify({ success: true, message: "Request rejected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "approve") {
      // Generate a random password
      const password = generatePassword();

      // Create the user with admin client
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: request.email,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: request.full_name,
        },
      });

      if (createError) {
        console.error("Failed to create user:", createError);
        return new Response(
          JSON.stringify({ error: "Benutzer konnte nicht angelegt werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`User created with ID: ${newUser.user.id}`);

      // Assign role to user
      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: newUser.user.id,
          role: role,
        });

      const rollback = async (step: string, err: unknown) => {
        console.error(`approve-user: ${step} failed, rolling back auth user:`, err);
        const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        if (delError) console.error("approve-user: rollback deleteUser failed:", delError);
        await audit("ACCESS_REQUEST_APPROVE", false, {
          request_id: requestId, email: request.email, role, failed_step: step, rolled_back: !delError,
        });
        return json(500, { error: "Freigabe fehlgeschlagen, es wurde kein Konto angelegt" });
      };

      if (roleInsertError) {
        return await rollback("role_insert", roleInsertError);
      }

      // Update request status to approved
      const { error: updateError } = await supabaseAdmin
        .from("registration_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) {
        return await rollback("status_update", updateError);
      }

      await audit("ACCESS_REQUEST_APPROVE", true, {
        request_id: requestId, email: request.email, new_user_id: newUser.user.id, role,
      });
      console.log(`Request ${requestId} approved successfully`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "User created successfully",
          credentials: {
            email: request.email,
            password: password,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
  const length = 16;  // Increased from 12 for better security
  const randomBytes = new Uint8Array(length);
  
  // Use cryptographically secure random number generator
  crypto.getRandomValues(randomBytes);
  
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(randomBytes[i] % chars.length);
  }
  
  return password;
}
