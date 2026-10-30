// Phase 2 contract responsibility check for user-path calls.
// admin/sales_lead: all contracts; user: created_by or sales_partner_id = self;
// regional_lead: same as user plus team (is_in_regional_lead_team). Team errors → deny.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function canAccessContract(
  admin: SupabaseClient,
  userId: string,
  roles: string[],
  contract: { created_by?: string | null; sales_partner_id?: string | null },
): Promise<boolean> {
  if (roles.includes("admin") || roles.includes("sales_lead")) return true;
  const owners = [contract.created_by, contract.sales_partner_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const isUser = roles.includes("user");
  const isRl = roles.includes("regional_lead");
  if ((isUser || isRl) && owners.includes(userId)) return true;
  if (isRl) {
    for (const owner of owners) {
      const { data, error } = await admin.rpc("is_in_regional_lead_team", {
        _regional_lead_id: userId,
        _user_id: owner,
      });
      if (!error && data === true) return true;
    }
  }
  return false;
}
