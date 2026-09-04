/**
 * useRegionalTeam
 *
 * Liefert die filterbare Personen-Liste für Führungsrollen plus einen
 * `teamFilter`-State und `Select`-fertige Optionen, damit jede Seite dasselbe
 * Dropdown einbauen kann.
 *
 * Zwei Zweige (sales_lead gewinnt bei Doppelrolle; Admin ohne aktive
 * Rollenvorschau läuft wie sales_lead):
 * - sales_lead / Admin ohne Vorschau: alle aktiven Vertriebler
 *   (Rollen sales_partner, user, regional_lead) — Label "Alle Vertriebler".
 * - regional_lead (nur bei aktiver Regionalleiter-Rolle/Vorschau): nur die
 *   eigenen Gebietsleiter aus `user_regional_assignments` — Label
 *   "Alle Teammitglieder".
 *
 * Der eigene Nutzer wird immer aus der Liste ausgefiltert ("Nur ich" deckt ihn ab).
 *
 * `showTeamFilter` ist das Gate für Dropdown-Anzeige UND Filteranwendung.
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
  const { isRegionalLead, isSalesLead } = useUserRole();

  // sales_lead gewinnt bei Doppelrolle
  const useSalesLeadBranch = isSalesLead;
  const showTeamFilter = isRegionalLead || isSalesLead;

  // "alle" = alle Personen der Liste, "own" = nur man selbst, sonst eine user_id
  const [teamFilter, setTeamFilter] = useState<string>("alle");

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["regional-team-members", user?.id, useSalesLeadBranch ? "sales_lead" : "regional_lead"],
    enabled: !!user?.id && showTeamFilter,
    queryFn: async () => {
      let userIds: string[] = [];

      if (useSalesLeadBranch) {
        // Alle aktiven Vertriebler
        const ALLOWED = ["sales_partner", "user", "regional_lead"] as const;
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id, role, is_active")
          .in("role", ALLOWED as unknown as ("sales_partner" | "user" | "regional_lead")[])
          .eq("is_active", true);
        if (error) throw error;
        userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
      } else {
        const { data: assignments, error } = await supabase
          .from("user_regional_assignments")
          .select("user_id")
          .eq("regional_lead_id", user!.id);
        if (error) throw error;
        userIds = (assignments ?? []).map((a) => a.user_id as string);
      }

      // Eigenen Nutzer nie in der Liste zeigen ("Nur ich" deckt das ab)
      userIds = userIds.filter((id) => id !== user?.id);
      if (!userIds.length) return [];

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
    { value: "alle", label: useSalesLeadBranch ? "Alle Vertriebler" : "Alle Teammitglieder" },
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
    isSalesLead,
    showTeamFilter,
    currentUserId: user?.id,
  };
}
