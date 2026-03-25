import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify admin role
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Failed to get user:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin using service role client
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      console.error("User is not admin:", roleError);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get request body
    const { requestId, action, role = "sales_partner" } = await req.json();
    console.log(`Processing ${action} for request ${requestId} with role ${role}`);

    if (!requestId || !action) {
      return new Response(
        JSON.stringify({ error: "Missing requestId or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
          JSON.stringify({ error: `Failed to create user: ${createError.message}` }),
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

      if (roleInsertError) {
        console.error("Failed to assign role:", roleInsertError);
        // Continue anyway, role can be assigned later
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
        console.error("Failed to update request status:", updateError);
        // User was created, so we continue
      }

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
