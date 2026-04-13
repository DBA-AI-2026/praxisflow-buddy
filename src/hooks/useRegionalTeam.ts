/**
 * useRegionalTeam
 *
 * Returns the list of Gebietsleiter (user role) that belong to the
 * currently logged-in Regionalleiter, plus the Regionalleiter themselves.
 *
 * Also exposes a `teamFilter` state and a `Select`-ready list of options
 * so every page can just drop in the same filter dropdown.
 *
 * Only active when the current user has the `regional_lead` role.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string | null;
}

export function useRegionalTeam() {
  const { user } = useAuth();
  const { isRegionalLead } = useUserRole();

  // "alle" = all team members, "own" = only the RL themselves, or a specific user_id
  const [teamFilter, setTeamFilter] = useState<string>("alle");

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["regional-team-members", user?.id],
    enabled: !!user?.id && isRegionalLead,
    queryFn: async () => {
      // Get user_ids that are assigned to this regional lead
      const { data: assignments, error } = await supabase
        .from("user_regional_assignments")
        .select("user_id")
        .eq("regional_lead_id", user!.id);

      if (error) throw error;
      if (!assignments?.length) return [];

      const userIds = assignments.map((a) => a.user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds)
        .order("full_name");

      return (profiles ?? []) as TeamMember[];
    },
  });

  /**
   * Given a field value (user_id from sales_partner_id / created_by / assigned_to),
   * returns true if it matches the current teamFilter.
   */
  const matchesTeamFilter = (userId: string | null | undefined): boolean => {
    if (teamFilter === "alle") return true;
    if (teamFilter === "own") return userId === user?.id;
    return userId === teamFilter;
  };

  /** Options for a Select dropdown */
  const teamFilterOptions: { value: string; label: string }[] = [
    { value: "alle", label: "Alle Teammitglieder" },
    { value: "own", label: "Nur ich" },
    ...teamMembers.map((m) => ({ value: m.user_id, label: m.full_name })),
  ];

  return {
    teamMembers,
    isLoading,
    teamFilter,
    setTeamFilter,
    matchesTeamFilter,
    teamFilterOptions,
    isRegionalLead,
    currentUserId: user?.id,
  };
}
