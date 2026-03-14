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
import { supabase } from "@/integrations/supabase/client";
import { PartnerCommissionDialog } from "@/components/vertrieb/PartnerCommissionDialog";
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

interface VertrieblerRow {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  contract_count: number;
}

const Vertriebler = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("alle");
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<VertrieblerRow | null>(null);
  const { isAdmin } = useUserRole();

  // Fetch profiles with their roles
  const { data: vertriebler = [], isLoading } = useQuery({
    queryKey: ["vertriebler-list"],
    queryFn: async () => {
      // Get all user roles for sales-relevant roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", SALES_ROLES);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = [...new Set(roles.map((r) => r.user_id))];

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Get contract counts per sales_partner_id / created_by
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

      // Merge data
      const result: VertrieblerRow[] = [];
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      for (const role of roles) {
        const profile = profileMap.get(role.user_id);
        if (!profile) continue;

        // Avoid duplicates if user has multiple relevant roles - take the first one
        if (result.some((r) => r.user_id === role.user_id)) continue;

        result.push({
          user_id: role.user_id,
          full_name: profile.full_name,
          email: profile.email,
          role: role.role,
          contract_count: contractCounts[role.user_id] || 0,
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
    const matchesRole = roleFilter === "alle" || v.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalContracts = vertriebler.reduce((s, v) => s + v.contract_count, 0);
  const roleCounts = vertriebler.reduce(
    (acc, v) => {
      acc[v.role] = (acc[v.role] || 0) + 1;
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
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="text-center">Verträge</TableHead>
                    {isAdmin && <TableHead className="text-right">Provisionen</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => {
                    const style = roleBadgeStyles[v.role] || roleBadgeStyles["sales_partner"];
                    return (
                      <TableRow key={v.user_id}>
                        <TableCell className="font-medium">{v.full_name}</TableCell>
                        <TableCell>
                          <Badge className={cn("gap-1", style.bg)}>
                            {style.icon}
                            {roleLabels[v.role] || v.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.email || "–"}</TableCell>
                        <TableCell className="text-center font-medium">{v.contract_count}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setSelectedPartner(v)}
                            >
                              <Percent className="h-3.5 w-3.5" />
                              Provisionen
                            </Button>
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
            userRole={selectedPartner.role}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default Vertriebler;
