import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Euro, Check, ChevronsUpDown, Star, UserPlus, Search, Percent, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { PartnerCommissionDialog } from "@/components/vertrieb/PartnerCommissionDialog";
import { CreatePartnerDialog } from "@/components/vertrieb/CreatePartnerDialog";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  sales_partner: "Vertriebspartner",
  sales_lead: "Vertriebsleitung",
  regional_lead: "Regionalleiter",
  vertragsabteilung: "Vertragsabteilung",
  tippgeber: "Tippgeber",
  user: "Gebietsleiter",
};

const roleBadgeStyles: Record<string, { bg: string; icon: React.ReactNode }> = {
  sales_partner: { bg: "bg-primary/10 text-primary border-primary/20", icon: <Star className="h-3 w-3" /> },
  user: { bg: "bg-blue-500/10 text-blue-700 border-blue-500/20", icon: <Users className="h-3 w-3" /> },
  tippgeber: { bg: "bg-amber-500/10 text-amber-700 border-amber-500/20", icon: <UserPlus className="h-3 w-3" /> },
  regional_lead: { bg: "bg-violet-500/10 text-violet-700 border-violet-500/20", icon: <Users className="h-3 w-3" /> },
  sales_lead: { bg: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", icon: <Star className="h-3 w-3" /> },
  admin: { bg: "bg-red-500/10 text-red-700 border-red-500/20", icon: <Star className="h-3 w-3" /> },
  vertragsabteilung: { bg: "bg-gray-500/10 text-gray-700 border-gray-500/20", icon: <Users className="h-3 w-3" /> },
};

// Relevant sales-related roles to display
const SALES_ROLES = ["sales_partner", "user", "tippgeber", "regional_lead", "sales_lead"] as const;
type SalesRole = (typeof SALES_ROLES)[number];

// Priority mirrors useUserRole.ts — highest privilege first.
// Only sales-relevant roles appear in this list; sales_lead sits at the top here.
const ROLE_PRIORITY: SalesRole[] = [
  "sales_lead",
  "regional_lead",
  "sales_partner",
  "user",
  "tippgeber",
];

function sortByPriority(roles: SalesRole[]): SalesRole[] {
  return [...roles].sort(
    (a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)
  );
}

interface VertrieblerRow {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: SalesRole[];        // all active sales roles, priority-sorted
  primaryRole: SalesRole;    // top-priority role for icon/label fallback
  is_active: boolean;
  contract_count: number;
  assigned_partner_name?: string | null;
}

const Vertriebler = () => {
  const [createPartnerOpen, setCreatePartnerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("alle");
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<VertrieblerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VertrieblerRow | null>(null);
  const { isAdmin, isSalesLead } = useUserRole();
  // Provisionsbearbeitung: nur admin und sales_lead
  const canEditCommissions = isAdmin || isSalesLead;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // URA counts for regional_leads (to guard against deactivation)
  const { data: uraCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["ura-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_regional_assignments")
        .select("regional_lead_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        const id = (r as { regional_lead_id: string }).regional_lead_id;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Bulk soft-delete over ALL role rows of this person — desired behaviour.
      // Per-role management happens in the Benutzerverwaltung (Users.tsx).
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: false })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      const name = deleteTarget?.full_name || "Vertriebler";
      queryClient.invalidateQueries({ queryKey: ["vertriebler-list"] });
      queryClient.invalidateQueries({ queryKey: ["sales-profiles-with-roles"] });
      toast({ title: "Vertriebler deaktiviert", description: `${name} wurde deaktiviert. Historische Zuordnungen bleiben erhalten.` });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const attemptDeactivate = (v: VertrieblerRow) => {
    // Regional-Lead-Guard: block if the person still leads team members.
    if (v.roles.includes("regional_lead")) {
      const count = uraCounts[v.user_id] ?? 0;
      if (count > 0) {
        toast({
          title: "Nicht möglich",
          description: `Der Regionalleiter führt noch ${count} Teammitglied${count === 1 ? "" : "er"}. Bitte zuerst die Zuordnungen im Team-Dialog auflösen.`,
          variant: "destructive",
        });
        return;
      }
    }
    setDeleteTarget(v);
  };

  // Fetch profiles with their roles
  const { data: vertriebler = [], isLoading } = useQuery({
    queryKey: ["vertriebler-list"],
    queryFn: async () => {
      // Get all ACTIVE sales-relevant role rows.
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, is_active")
        .eq("is_active", true)
        .in("role", SALES_ROLES);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      // Aggregate: one entry per user_id with ALL their active sales roles.
      const rolesMap: Record<string, SalesRole[]> = {};
      for (const r of roles) {
        const role = r.role as SalesRole;
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        if (!rolesMap[r.user_id].includes(role)) rolesMap[r.user_id].push(role);
      }

      const userIds = Object.keys(rolesMap);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Get contract counts per sales_partner_id
      const { data: contracts } = await supabase
        .from("contracts")
        .select("sales_partner_id, created_by")
        .in("sales_partner_id", userIds);

      const contractCounts: Record<string, number> = {};
      contracts?.forEach((c) => {
        if (c.sales_partner_id) {
          contractCounts[c.sales_partner_id] = (contractCounts[c.sales_partner_id] || 0) + 1;
        }
      });

      // Get Tippgeber → Vertriebspartner assignments
      const { data: assignments } = await supabase
        .from("tippgeber_partner_assignments")
        .select("tippgeber_user_id, partner_user_id");

      const assignmentMap: Record<string, string> = {};
      (assignments || []).forEach((a: any) => {
        assignmentMap[a.tippgeber_user_id] = a.partner_user_id;
      });

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const result: VertrieblerRow[] = [];

      for (const userId of userIds) {
        const profile = profileMap.get(userId);
        if (!profile) continue;

        const sortedRoles = sortByPriority(rolesMap[userId]);
        const primaryRole = sortedRoles[0];

        // Resolve assigned partner name for Tippgeber (only if user is a Tippgeber)
        let assignedPartnerName: string | null = null;
        if (sortedRoles.includes("tippgeber") && assignmentMap[userId]) {
          const partnerProfile = profileMap.get(assignmentMap[userId]);
          assignedPartnerName = partnerProfile?.full_name || null;
        }

        result.push({
          user_id: userId,
          full_name: profile.full_name,
          email: profile.email,
          roles: sortedRoles,
          primaryRole,
          is_active: true, // query already filters is_active=true
          contract_count: contractCounts[userId] || 0,
          assigned_partner_name: assignedPartnerName,
        });
      }

      return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const filtered = vertriebler.filter((v) => {
    const matchesSearch =
      !searchTerm ||
      v.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.email || "").toLowerCase().includes(searchTerm.toLowerCase());
    // Multi-role: person matches if ANY of their active roles equals the filter.
    const matchesRole =
      roleFilter === "alle" || v.roles.includes(roleFilter as SalesRole);
    return matchesSearch && matchesRole;
  });

  const totalContracts = vertriebler.reduce((s, v) => s + v.contract_count, 0);
  // Person-based role counts: a person with sales_lead + regional_lead is
  // counted once in each of those buckets.
  const roleCounts = vertriebler.reduce(
    (acc, v) => {
      for (const r of v.roles) {
        acc[r] = (acc[r] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );


  return (
    <MainLayout title="Vertriebler" subtitle="Übersicht aller Vertriebspartner und Teammitglieder">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vertriebler.length}</div>
              <p className="text-xs text-muted-foreground">Vertriebsmitglieder</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vertriebspartner</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{roleCounts["sales_partner"] || 0}</div>
              <p className="text-xs text-muted-foreground">Direktvertrieb</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gebietsleiter</CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{roleCounts["user"] || 0}</div>
              <p className="text-xs text-muted-foreground">Regionale Betreuung</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verträge</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalContracts}</div>
              <p className="text-xs text-muted-foreground">Gesamt</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Vertriebler</CardTitle>
                <CardDescription>Alle Vertriebsmitglieder im Überblick</CardDescription>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button onClick={() => setCreatePartnerOpen(true)} className="gap-1.5">
                    <UserPlus className="h-4 w-4" />
                    Partner anlegen
                  </Button>
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 w-[200px]"
                  />
                </div>
                <Popover open={roleFilterOpen} onOpenChange={setRoleFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[180px] justify-between">
                      {roleFilter === "alle" ? "Alle Rollen" : roleLabels[roleFilter] || roleFilter}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            value="alle"
                            onSelect={() => {
                              setRoleFilter("alle");
                              setRoleFilterOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", roleFilter === "alle" ? "opacity-100" : "opacity-0")} />
                            Alle Rollen
                          </CommandItem>
                          {SALES_ROLES.map((role) => (
                            <CommandItem
                              key={role}
                              value={role}
                              onSelect={() => {
                                setRoleFilter(role);
                                setRoleFilterOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", roleFilter === role ? "opacity-100" : "opacity-0")} />
                              {roleLabels[role] || role}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Keine Vertriebler gefunden.
              </div>
            ) : (
              <Table>
                <TableHeader>
                   <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Zuordnung</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="text-center">Verträge</TableHead>
                     {(isAdmin || isSalesLead) && <TableHead className="text-right">Aktionen</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => {
                    const primaryStyle =
                      roleBadgeStyles[v.primaryRole] || roleBadgeStyles["sales_partner"];
                    const extraRoles = v.roles.slice(1);
                    return (
                      <TableRow key={v.user_id} className={!v.is_active ? "opacity-50" : undefined}>
                        <TableCell className="font-medium">{v.full_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge className={cn("gap-1", primaryStyle.bg)}>
                              {primaryStyle.icon}
                              {roleLabels[v.primaryRole] || v.primaryRole}
                            </Badge>
                            {extraRoles.length > 0 && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                                title={extraRoles
                                  .map((r) => roleLabels[r] || r)
                                  .join(", ")}
                              >
                                +{extraRoles.length}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.is_active ? "default" : "secondary"} className={v.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}>
                            {v.is_active ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {v.roles.includes("tippgeber") && v.assigned_partner_name
                            ? `von ${v.assigned_partner_name}`
                            : v.roles.includes("tippgeber")
                              ? <span className="text-xs text-destructive">Nicht zugeordnet</span>
                              : "–"}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">{v.email || "–"}</TableCell>
                        <TableCell className="text-center font-medium">{v.contract_count}</TableCell>
                        {(isAdmin || isSalesLead) && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Provisionen: admin + sales_lead */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setSelectedPartner(v)}
                              >
                                <Percent className="h-3.5 w-3.5" />
                                Provisionen
                              </Button>
                              {/* Deaktivieren / Reaktivieren: nur admin */}
                              {isAdmin && v.is_active && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteTarget(v)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isAdmin && !v.is_active && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-success hover:text-success hover:bg-success/10"
                                  onClick={() => reactivateMutation.mutate(v.user_id)}
                                  disabled={reactivateMutation.isPending}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Commission Dialog */}
        {selectedPartner && (
          <PartnerCommissionDialog
            open={!!selectedPartner}
            onOpenChange={(open) => !open && setSelectedPartner(null)}
            userId={selectedPartner.user_id}
            userName={selectedPartner.full_name}
            userRole={selectedPartner.primaryRole}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Vertriebler deaktivieren?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.full_name}</strong> ({deleteTarget?.email || "–"}) wird deaktiviert und ist in neuen Formularen nicht mehr auswählbar.
                Bestehende Verträge und historische Zuordnungen bleiben erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deactivateMutation.isPending}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deactivateMutation.isPending}
                onClick={() => deleteTarget && deactivateMutation.mutate(deleteTarget.user_id)}
              >
                {deactivateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Deaktivieren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Partner Dialog */}
        <CreatePartnerDialog
          open={createPartnerOpen}
          onOpenChange={setCreatePartnerOpen}
        />
      </div>
    </MainLayout>
  );
};

export default Vertriebler;
