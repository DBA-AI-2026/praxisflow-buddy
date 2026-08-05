import { useState, useRef, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, MoreHorizontal, Pencil, Trash2, Shield, Users, Loader2, UserPlus, FileText, UserCog, Clock, Upload, Download, CheckCircle, Mail, Eye, ShieldOff, Plus, X, Ghost } from "lucide-react";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { RegionalAssignmentDialog } from "@/components/admin/RegionalAssignmentDialog";
import { useUserRole } from "@/hooks/useUserRole";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import {
  ROLE_PRIORITY,
  sortRolesByPriority,
  pickPrimaryRole,
  type AppRole,
} from "@/lib/roles";

// ALL_ROLES: inhaltlich identisch zu ROLE_PRIORITY — daselbe Set in derselben
// Anzeige-Reihenfolge. Bewusst als Alias belassen, damit Aufrufstellen (Add-
// Role-Select, "fehlende Rolle finden") klar lesbar bleiben.
const ALL_ROLES: readonly AppRole[] = ROLE_PRIORITY;

interface UserGrouped {
  user_id: string;
  full_name: string;
  email: string;
  roles: AppRole[]; // active roles, sorted by priority
  created_at: string; // earliest role creation
  last_seen_at: string | null;
}

const roleConfig: Record<AppRole, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-primary/10 text-primary" },
  vertragsabteilung: { label: "Vertragsabteilung", color: "bg-emerald-100 text-emerald-800" },
  sales_lead: { label: "Vertriebsleitung", color: "bg-violet-100 text-violet-800" },
  regional_lead: { label: "Regionalleiter", color: "bg-orange-100 text-orange-800" },
  sales_partner: { label: "Vertriebspartner", color: "bg-blue-100 text-blue-800" },
  tippgeber: { label: "Tippgeber", color: "bg-yellow-100 text-yellow-800" },
  user: { label: "Gebietsleiter", color: "bg-secondary text-secondary-foreground" },
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserGrouped | null>(null);
  const [addRoleValue, setAddRoleValue] = useState<AppRole>("user");
  const [uploadingAgreement, setUploadingAgreement] = useState(false);
  const [credentialsPreviewOpen, setCredentialsPreviewOpen] = useState(false);
  const [sendingCredentials, setSendingCredentials] = useState(false);
  const [mfaResetDialogOpen, setMfaResetDialogOpen] = useState(false);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [confirmLastRoleRemoval, setConfirmLastRoleRemoval] = useState<AppRole | null>(null);
  const agreementInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();

  // Ghost-Accounts (Wartung): Dry-run beim Öffnen, scharfer Lauf nur nach Bestätigung.
  const [ghostDialogOpen, setGhostDialogOpen] = useState(false);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostBanning, setGhostBanning] = useState(false);
  const [ghostPreview, setGhostPreview] = useState<{ count: number; emails: string[] } | null>(null);
  const [ghostResult, setGhostResult] = useState<{ banned: string[]; failed: { email: string | null; error: string }[] } | null>(null);

  const loadGhostPreview = async () => {
    setGhostLoading(true);
    setGhostPreview(null);
    setGhostResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ban-ghost-users", {
        body: { dryRun: true },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setGhostPreview({ count: data.count ?? 0, emails: data.emails ?? [] });
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGhostLoading(false);
    }
  };

  const runGhostBan = async () => {
    setGhostBanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ban-ghost-users", {
        body: { dryRun: false },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setGhostResult({ banned: data.banned ?? [], failed: data.failed ?? [] });
      setGhostPreview(null);
      toast({ title: "Ghost-Accounts gebannt", description: `${data.count ?? 0} Konto(en) neutralisiert.` });
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGhostBanning(false);
    }
  };

  // Fetch active roles + profiles, group by user_id
  const { data: users = [], isLoading } = useQuery<UserGrouped[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at, is_active")
        .eq("is_active", true);
      if (rolesError) throw rolesError;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, last_seen_at");
      if (profilesError) throw profilesError;

      const map = new Map<string, UserGrouped>();
      for (const row of roles ?? []) {
        const profile = profiles?.find((p) => p.user_id === row.user_id);
        const existing = map.get(row.user_id);
        if (existing) {
          if (!existing.roles.includes(row.role as AppRole)) {
            existing.roles.push(row.role as AppRole);
          }
          if (row.created_at < existing.created_at) existing.created_at = row.created_at;
        } else {
          map.set(row.user_id, {
            user_id: row.user_id,
            full_name: profile?.full_name || "Unbekannt",
            email: profile?.email || "-",
            roles: [row.role as AppRole],
            created_at: row.created_at,
            last_seen_at:
              (profile as { last_seen_at?: string | null } | undefined)?.last_seen_at ?? null,
          });
        }
      }

      const list = Array.from(map.values()).map((u) => ({
        ...u,
        roles: sortRolesByPriority(u.roles),
      }));
      return list;
    },
  });

  // URA counts for regional_leads (to guard against removal)
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

  // Add role
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Pre-check: tippgeber requires partner assignment
      if (role === "tippgeber") {
        const { data, error } = await supabase
          .from("tippgeber_partner_assignments")
          .select("id")
          .eq("tippgeber_user_id", userId)
          .eq("is_active", true)
          .limit(1);
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "Tippgeber müssen einem Vertriebspartner zugeordnet sein. Bitte zuerst eine Zuordnung in den Tippgeber-Partnerzuordnungen anlegen."
          );
        }
      }
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Rolle hinzugefügt" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  // Remove single role (row-precise soft delete)
  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Rolle entzogen" });
      setConfirmLastRoleRemoval(null);
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  // Bulk soft-delete: alle Rollen entziehen
  const removeAllRolesMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Alle Rollen entzogen",
        description: "Der Benutzer hat keinen Systemzugriff mehr.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  // Duplikat-Erkennung auf gruppierten Personen (verschiedene user_id)
  const duplicates = useMemo(() => {
    const nameCounts: Record<string, Set<string>> = {};
    const emailCounts: Record<string, Set<string>> = {};
    users.forEach((u) => {
      const name = u.full_name.toLowerCase().trim();
      const email = u.email.toLowerCase().trim();
      if (name && name !== "unbekannt") {
        (nameCounts[name] ||= new Set()).add(u.user_id);
      }
      if (email && email !== "-") {
        (emailCounts[email] ||= new Set()).add(u.user_id);
      }
    });
    const dupNames = Object.entries(nameCounts)
      .filter(([, ids]) => ids.size > 1)
      .map(
        ([name]) =>
          users.find((u) => u.full_name.toLowerCase().trim() === name)?.full_name || name
      );
    const dupEmails = Object.entries(emailCounts)
      .filter(([, ids]) => ids.size > 1)
      .map(([email]) => email);
    return { names: dupNames, emails: dupEmails };
  }, [users]);

  // Personenbasierte Zählung (distinct user_id mit dieser aktiven Rolle)
  const countRole = (role: AppRole) =>
    users.filter((u) => u.roles.includes(role)).length;
  const adminCount = countRole("admin");
  const vertragsabteilungCount = countRole("vertragsabteilung");
  const salesLeadCount = countRole("sales_lead");
  const regionalLeadCount = countRole("regional_lead");
  const salesPartnerCount = countRole("sales_partner");
  const tippgeberCount = countRole("tippgeber");
  const userCount = countRole("user");

  const handleManageClick = (user: UserGrouped) => {
    setSelectedUser(user);
    // preselect first role not yet held
    const missing = ALL_ROLES.find((r) => !user.roles.includes(r));
    setAddRoleValue(missing ?? "user");
    setManageDialogOpen(true);
  };

  const handleDeleteClick = (user: UserGrouped) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleAssignClick = (user: UserGrouped) => {
    setSelectedUser(user);
    setAssignDialogOpen(true);
  };

  const handleAgreementClick = (user: UserGrouped) => {
    setSelectedUser(user);
    setAgreementDialogOpen(true);
  };

  const handleSendCredentialsClick = (user: UserGrouped) => {
    setSelectedUser(user);
    setCredentialsPreviewOpen(true);
  };

  const handleMfaResetClick = (user: UserGrouped) => {
    setSelectedUser(user);
    setMfaResetDialogOpen(true);
  };

  const handleMfaResetConfirm = async () => {
    if (!selectedUser) return;
    setResettingMfa(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-user-mfa", {
        body: { targetUserId: selectedUser.user_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.reset ? "2FA zurückgesetzt" : "Kein 2FA aktiv",
        description: data?.message || "Die 2FA wurde erfolgreich zurückgesetzt.",
      });
      setMfaResetDialogOpen(false);
    } catch (e: unknown) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResettingMfa(false);
    }
  };

  const handleSendCredentialsConfirm = async () => {
    if (!selectedUser) return;
    // Guard: Multi-Role → Passwort-Reset über create-user nicht möglich (409)
    if (selectedUser.roles.length > 1) {
      toast({
        title: "Nicht möglich",
        description:
          "Person hat mehrere aktive Rollen, Passwort-Reset über diesen Weg nicht möglich.",
        variant: "destructive",
      });
      return;
    }
    const primary = pickPrimaryRole(selectedUser.roles);
    if (!primary) {
      toast({
        title: "Nicht möglich",
        description: "Person hat keine aktive Rolle.",
        variant: "destructive",
      });
      return;
    }
    setSendingCredentials(true);
    try {
      const response = await supabase.functions.invoke("create-user", {
        body: {
          email: selectedUser.email,
          fullName: selectedUser.full_name,
          role: primary,
          sendEmail: true,
          confirmReset: true,
        },
      });

      if (response.error) throw new Error(response.error.message);

      toast({
        title: "Zugangsdaten gesendet",
        description: `Ein neues Passwort wurde generiert und an ${selectedUser.email} gesendet.`,
      });
      setCredentialsPreviewOpen(false);
    } catch (e: unknown) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSendingCredentials(false);
    }
  };

  const handleAgreementUpload = async (file: File) => {
    if (!selectedUser) return;
    setUploadingAgreement(true);
    try {
      const filePath = `${selectedUser.user_id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("tippgeber-agreements")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("tippgeber_agreements" as any).insert({
        user_id: selectedUser.user_id,
        file_name: file.name,
        file_path: filePath,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (dbError) throw dbError;

      toast({ title: "Vereinbarung hochgeladen", description: `${file.name} wurde erfolgreich gespeichert.` });
      setAgreementDialogOpen(false);
    } catch (e: unknown) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploadingAgreement(false);
    }
  };

  // Attempt to remove a specific role — enforces guards
  const attemptRemoveRole = (user: UserGrouped, role: AppRole) => {
    // Guard 2: regional_lead with URA rows → BLOCK
    if (role === "regional_lead") {
      const count = uraCounts[user.user_id] ?? 0;
      if (count > 0) {
        toast({
          title: "Rolle kann nicht entzogen werden",
          description: `Der Regionalleiter führt noch ${count} Teammitglied${count === 1 ? "" : "er"}. Bitte zuerst die Zuordnungen im Team-Dialog auflösen.`,
          variant: "destructive",
        });
        return;
      }
    }
    // Guard 1: last active role → confirm
    if (user.roles.length === 1) {
      setConfirmLastRoleRemoval(role);
      return;
    }
    removeRoleMutation.mutate({ userId: user.user_id, role });
  };

  // Bulk removal guard
  const attemptRemoveAllRoles = (user: UserGrouped) => {
    if (user.roles.includes("regional_lead")) {
      const count = uraCounts[user.user_id] ?? 0;
      if (count > 0) {
        toast({
          title: "Nicht möglich",
          description: `Der Regionalleiter führt noch ${count} Teammitglied${count === 1 ? "" : "er"}. Bitte zuerst die Zuordnungen im Team-Dialog auflösen.`,
          variant: "destructive",
        });
        return;
      }
    }
    removeAllRolesMutation.mutate(user.user_id);
  };

  const availableRolesToAdd = selectedUser
    ? ALL_ROLES.filter((r) => !selectedUser.roles.includes(r))
    : [];

  const hasAnyRegionalOrSalesLead = (u: UserGrouped) =>
    u.roles.includes("regional_lead") || u.roles.includes("sales_lead");

  return (
    <MainLayout title="Benutzerverwaltung" subtitle="Benutzer und Rollen verwalten">
      {/* Rollenübersicht */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
        {[
          { icon: Shield, label: "Admin", count: adminCount, iconBg: "bg-primary/10", iconColor: "text-primary", badge: "bg-primary/10 text-primary", desc: "Vollzugriff: Benutzerverwaltung, Einstellungen, Rechnungen, Audit-Logs, Produkt- & Preiskonfiguration." },
          { icon: FileText, label: "Vertragsabteilung", count: vertragsabteilungCount, iconBg: "bg-emerald-100", iconColor: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800", desc: "Verträge einsehen, prüfen und freigeben. Zugriff auf Kunden, Lizenzen und Umsätze." },
          { icon: Users, label: "Vertriebsleitung", count: salesLeadCount, iconBg: "bg-violet-100", iconColor: "text-violet-700", badge: "bg-violet-100 text-violet-800", desc: "Sieht alle Daten aller Partner & Regionalleiter. Zugriff auf Provisionen, Kalender, Export, Integrationen." },
          { icon: Users, label: "Regionalleiter", count: regionalLeadCount, iconBg: "bg-orange-100", iconColor: "text-orange-700", badge: "bg-orange-100 text-orange-800", desc: "Sieht eigene und Team-Daten. Verwaltet Reservierungen, Interessenten und Provisionen des Teams." },
          { icon: Users, label: "Vertriebspartner", count: salesPartnerCount, iconBg: "bg-blue-100", iconColor: "text-blue-700", badge: "bg-blue-100 text-blue-800", desc: "Eigene Reservierungen, Interessenten, Demo-Downloads. Sieht nur eigene Kunden, Tickets, Umsätze." },
          { icon: Users, label: "Tippgeber", count: tippgeberCount, iconBg: "bg-yellow-100", iconColor: "text-yellow-700", badge: "bg-yellow-100 text-yellow-800", desc: "Reicht Empfehlungen ein. Sieht eigene Tipps mit 30-Tage-Reservierung. Kein Zugriff auf Vertriebsdaten." },
          { icon: Users, label: "Gebietsleiter", count: userCount, iconBg: "bg-secondary", iconColor: "text-secondary-foreground", badge: "bg-secondary text-secondary-foreground", desc: "Basiszugang: Dashboard, Kunden, Tickets, Lizenzen, Umsätze und Verträge einsehen." },
        ].map((r) => (
          <div key={r.label} className="stat-card flex items-start gap-3 py-3">
            <div className={`rounded-lg p-2.5 ${r.iconBg} shrink-0 mt-0.5`}>
              <r.icon className={`h-4 w-4 ${r.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">{r.label}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.badge}`}>{r.count}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name oder E-Mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {users.length} Personen · {users.reduce((n, u) => n + u.roles.length, 0)} aktive Rollen
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                setGhostDialogOpen(true);
                loadGhostPreview();
              }}
            >
              <Ghost className="h-4 w-4 mr-2" />
              Ghost-Accounts
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Benutzer anlegen
          </Button>
        </div>
      </div>

      {/* Duplikat-Warnung */}
      {(duplicates.names.length > 0 || duplicates.emails.length > 0) && (
        <Alert className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Mögliche Duplikate gefunden:</span>
            {duplicates.names.length > 0 && (
              <span className="block mt-1 text-sm">
                Gleicher Name: {duplicates.names.join(", ")}
              </span>
            )}
            {duplicates.emails.length > 0 && (
              <span className="block mt-1 text-sm">
                Gleiche E-Mail: {duplicates.emails.join(", ")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Benutzer gefunden.
            </div>
          ) : (
            <table className="data-table">
              <thead className="bg-muted/50">
                <tr>
                  <th>Benutzer</th>
                  <th>Rollen</th>
                  <th>Zuletzt online</th>
                  <th>Erstellt am</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {user.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">
                            {user.full_name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <Badge
                            key={r}
                            variant="secondary"
                            className={roleConfig[r]?.color || ""}
                          >
                            {roleConfig[r]?.label || r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-muted-foreground">
                      {user.last_seen_at ? (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(user.last_seen_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">–</span>
                      )}
                    </td>
                    <td className="text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("de-DE")}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleManageClick(user)}>
                             <Pencil className="h-4 w-4 mr-2" />
                             Rollen verwalten
                           </DropdownMenuItem>
                           {hasAnyRegionalOrSalesLead(user) && (
                             <DropdownMenuItem onClick={() => handleAssignClick(user)}>
                               <UserCog className="h-4 w-4 mr-2" />
                               Team zuordnen
                             </DropdownMenuItem>
                           )}
                           {user.roles.includes("tippgeber") && (
                             <DropdownMenuItem onClick={() => handleAgreementClick(user)}>
                               <Upload className="h-4 w-4 mr-2" />
                               Vereinbarung hochladen
                             </DropdownMenuItem>
                           )}
                           <DropdownMenuItem onClick={() => handleSendCredentialsClick(user)}>
                             <Mail className="h-4 w-4 mr-2" />
                              Zugangsdaten zusenden
                           </DropdownMenuItem>
                            {isAdmin && (
                            <DropdownMenuItem onClick={() => handleMfaResetClick(user)}>
                               <ShieldOff className="h-4 w-4 mr-2" />
                               2FA zurücksetzen
                            </DropdownMenuItem>
                            )}
                           <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Alle Rollen entziehen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manage Roles Dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rollen verwalten</DialogTitle>
            <DialogDescription>
              Rollen einzeln hinzufügen oder entziehen. Mehrfachrollen sind möglich.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>

              <div className="space-y-2">
                <Label>Aktive Rollen</Label>
                {selectedUser.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine aktive Rolle.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.roles.map((r) => {
                      const isRegionalWithTeam =
                        r === "regional_lead" && (uraCounts[selectedUser.user_id] ?? 0) > 0;
                      return (
                        <div
                          key={r}
                          className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-1 text-xs font-medium ${roleConfig[r].color}`}
                        >
                          <span>{roleConfig[r].label}</span>
                          <button
                            type="button"
                            title={
                              isRegionalWithTeam
                                ? `Führt noch ${uraCounts[selectedUser.user_id]} Teammitglied(er) — Zuordnungen zuerst auflösen.`
                                : "Rolle entziehen"
                            }
                            className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={
                              isRegionalWithTeam || removeRoleMutation.isPending
                            }
                            onClick={() => attemptRemoveRole(selectedUser, r)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {availableRolesToAdd.length > 0 && (
                <div className="space-y-2">
                  <Label>Rolle hinzufügen</Label>
                  <div className="flex gap-2">
                    <Select
                      value={addRoleValue}
                      onValueChange={(v) => setAddRoleValue(v as AppRole)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRolesToAdd.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleConfig[r].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() =>
                        addRoleMutation.mutate({
                          userId: selectedUser.user_id,
                          role: addRoleValue,
                        })
                      }
                      disabled={addRoleMutation.isPending}
                    >
                      {addRoleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Hinzufügen
                        </>
                      )}
                    </Button>
                  </div>
                  {addRoleValue === "tippgeber" && (
                    <p className="text-xs text-muted-foreground">
                      Hinweis: Tippgeber müssen einem Vertriebspartner zugeordnet sein.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageDialogOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last-role removal confirmation */}
      <Dialog
        open={confirmLastRoleRemoval !== null}
        onOpenChange={(open) => !open && setConfirmLastRoleRemoval(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Letzte Rolle entziehen?
            </DialogTitle>
            <DialogDescription>
              Dies ist die einzige aktive Rolle dieser Person. Nach dem Entzug hat der Benutzer
              keinen Systemzugriff mehr.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmLastRoleRemoval(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedUser && confirmLastRoleRemoval) {
                  removeRoleMutation.mutate({
                    userId: selectedUser.user_id,
                    role: confirmLastRoleRemoval,
                  });
                }
              }}
              disabled={removeRoleMutation.isPending}
            >
              {removeRoleMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird entzogen…</>
              ) : (
                "Rolle entziehen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk soft-delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Alle Rollen entziehen
            </DialogTitle>
            <DialogDescription>
              Alle aktiven Rollen dieser Person werden deaktiviert (Soft-Delete). Der
              Auth-Account bleibt bestehen, historische Zuordnungen ebenfalls.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-3">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedUser.roles.map((r) => (
                    <Badge key={r} variant="secondary" className={roleConfig[r].color}>
                      {roleConfig[r].label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>
                  <strong>Achtung:</strong> Die Person hat danach keinen Systemzugriff mehr.
                  Rollen können später wieder hinzugefügt werden.
                </span>
              </div>
              {selectedUser.roles.includes("regional_lead") &&
                (uraCounts[selectedUser.user_id] ?? 0) > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                    <span className="text-base leading-none mt-0.5">⛔</span>
                    <span>
                      Der Regionalleiter führt noch {uraCounts[selectedUser.user_id]} Teammitglied
                      {(uraCounts[selectedUser.user_id] ?? 0) === 1 ? "" : "er"}. Bitte zuerst
                      die Zuordnungen im Team-Dialog auflösen.
                    </span>
                  </div>
                )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedUser && attemptRemoveAllRoles(selectedUser)}
              disabled={
                removeAllRolesMutation.isPending ||
                (selectedUser?.roles.includes("regional_lead") &&
                  (uraCounts[selectedUser?.user_id ?? ""] ?? 0) > 0)
              }
            >
              {removeAllRolesMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird entzogen…</>
              ) : (
                "Alle Rollen entziehen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Ghost-Accounts: Wartungs-Dialog (nur Admin) */}
      <Dialog open={ghostDialogOpen} onOpenChange={setGhostDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ghost-Accounts</DialogTitle>
            <DialogDescription>
              Konten ohne Login, ohne Rolle und ohne interne E-Mail-Domain. Ein Bann ist
              reversibel — es wird nichts gelöscht.
            </DialogDescription>
          </DialogHeader>

          {ghostLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Prüfe Konten …
            </div>
          )}

          {!ghostLoading && ghostPreview && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{ghostPreview.count} Ghost-Account(s) gefunden</p>
              <div className="max-h-64 overflow-y-auto rounded border p-2 text-xs space-y-1">
                {ghostPreview.emails.length === 0 ? (
                  <span className="text-muted-foreground">Keine Treffer.</span>
                ) : (
                  ghostPreview.emails.map((e) => <div key={e}>{e}</div>)
                )}
              </div>
            </div>
          )}

          {!ghostLoading && ghostResult && (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{ghostResult.banned.length} Konto(en) gebannt</p>
              <div className="max-h-48 overflow-y-auto rounded border p-2 text-xs space-y-1">
                {ghostResult.banned.map((e) => <div key={e}>{e}</div>)}
              </div>
              {ghostResult.failed.length > 0 && (
                <div className="text-xs text-destructive">
                  {ghostResult.failed.length} Fehler:{" "}
                  {ghostResult.failed.map((f) => `${f.email ?? "?"} (${f.error})`).join(", ")}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGhostDialogOpen(false)}>
              Schließen
            </Button>
            {ghostPreview && ghostPreview.count > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={ghostBanning}>
                    {ghostBanning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Bannen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {ghostPreview.count} Ghost-Accounts dauerhaft bannen?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Die Konten können sich danach nicht mehr anmelden. Der Bann ist
                      reversibel, es werden keine Daten gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={runGhostBan}>Bannen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Regional Assignment Dialog */}
      <RegionalAssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        regionalLead={
          selectedUser
            ? {
                user_id: selectedUser.user_id,
                full_name: selectedUser.full_name,
                email: selectedUser.email,
              }
            : null
        }
      />

      {/* Tippgebervereinbarung Upload Dialog */}
      <Dialog open={agreementDialogOpen} onOpenChange={setAgreementDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Tippgebervereinbarung hochladen
            </DialogTitle>
            <DialogDescription>
              Laden Sie die unterzeichnete Vereinbarung für diesen Tippgeber hoch (PDF, max. 10 MB).
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>

              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => agreementInputRef.current?.click()}
              >
                {uploadingAgreement ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Wird hochgeladen…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-foreground">Datei auswählen oder hierher ziehen</p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX – max. 10 MB</p>
                  </div>
                )}
                <input
                  ref={agreementInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleAgreementUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreementDialogOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Preview & Send Dialog */}
      <Dialog open={credentialsPreviewOpen} onOpenChange={setCredentialsPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Zugangsdaten zusenden
            </DialogTitle>
            <DialogDescription>
              Es wird ein neues Passwort generiert und folgende E-Mail an den Benutzer gesendet.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary shrink-0">
                  {selectedUser.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p className="font-medium text-sm">{selectedUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedUser.email} ·{" "}
                    {selectedUser.roles.map((r) => roleConfig[r]?.label).join(", ") || "–"}
                  </p>
                </div>
              </div>

              {selectedUser.roles.length > 1 && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                  <span className="text-base leading-none mt-0.5">⛔</span>
                  <span>
                    Person hat mehrere aktive Rollen, Passwort-Reset über diesen Weg nicht möglich.
                    Bitte Rollen zuerst über „Rollen verwalten" bereinigen.
                  </span>
                </div>
              )}

              {/* Email Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-Mail-Vorschau</span>
                </div>
                <div className="p-4 bg-[#f5f5f5]">
                  <div style={{ fontFamily: "verdana, geneva, sans-serif", maxWidth: "500px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                    <div style={{ backgroundColor: "#0b367f", padding: "24px 32px", textAlign: "center" }}>
                      <div style={{ color: "#ffffff", fontSize: "20px", fontWeight: "bold", margin: 0 }}>🦊 Willkommen!</div>
                      <div style={{ color: "#c8d8f0", fontSize: "12px", marginTop: "6px" }}>HFX Sales Portal · das Portal für den Vertrieb</div>
                    </div>
                    <div style={{ padding: "24px 32px" }}>
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#333" }}>Hallo <strong>{selectedUser.full_name}</strong>,</p>
                      <p style={{ margin: "0 0 18px 0", fontSize: "12px", color: "#555" }}>
                        Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als{" "}
                        <strong>
                          {roleConfig[pickPrimaryRole(selectedUser.roles) ?? "user"]?.label}
                        </strong>{" "}
                        registriert.
                      </p>
                      <div style={{ backgroundColor: "#f0f4f8", borderRadius: "8px", border: "1px solid #d0d5dd", padding: "14px 16px", marginBottom: "18px", lineHeight: "22px" }}>
                        <div style={{ fontSize: "10px", fontWeight: "bold", color: "#0b367f", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Ihre Zugangsdaten</div>
                        <div style={{ fontSize: "12px", color: "#444" }}>
                          <strong>Registrierte E-Mail-Adresse:</strong> {selectedUser.email}
                        </div>
                        <div style={{ fontSize: "12px", color: "#444", marginTop: "6px" }}>
                          <strong>Temporäres Passwort:</strong> <span style={{ background: "#fff", padding: "1px 8px", borderRadius: "4px", fontFamily: "monospace", fontSize: "13px", border: "1px solid #e5e7eb", color: "#9ca3af" }}>wird beim Versand generiert</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "center", marginBottom: "16px" }}>
                        <div style={{ display: "inline-block", backgroundColor: "#0b367f", color: "white", padding: "10px 28px", borderRadius: "6px", fontWeight: "bold", fontSize: "12px" }}>Zum Portal anmelden</div>
                      </div>
                      <div style={{ background: "#fff8e1", border: "1px solid #f59e0b", padding: "10px 12px", borderRadius: "6px", fontSize: "11px", color: "#92400e" }}>
                        ⚠️ <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung unter Einstellungen → Sicherheit.
                      </div>
                    </div>
                    <div style={{ backgroundColor: "#f8f8f8", padding: "12px 32px", borderTop: "1px solid #eeeeee", textAlign: "center", fontSize: "11px", color: "#aaaaaa" }}>
                      © Honorarfuchs GmbH · Bei Fragen: info@honorarfuchs.de
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>Es wird ein <strong>neues Passwort</strong> generiert und das bisherige überschrieben. Der Benutzer erhält das neue Passwort per E-Mail.</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCredentialsPreviewOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSendCredentialsConfirm}
              disabled={sendingCredentials || (selectedUser?.roles.length ?? 0) > 1}
            >
              {sendingCredentials ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gesendet…</>
              ) : (
                <><Mail className="h-4 w-4 mr-2" />Zugangsdaten jetzt senden</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MFA Reset Confirmation Dialog */}
      <Dialog open={mfaResetDialogOpen} onOpenChange={setMfaResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" />
              2FA zurücksetzen
            </DialogTitle>
            <DialogDescription>
              Die Zwei-Faktor-Authentifizierung für diesen Benutzer wird vollständig entfernt. 
              Bei der nächsten Anmeldung muss der Benutzer 2FA neu einrichten (sofern für seine Rolle Pflicht).
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedUser.email} ·{" "}
                  {selectedUser.roles.map((r) => roleConfig[r]?.label).join(", ") || "–"}
                </p>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>Diese Aktion wird im Audit-Log protokolliert. Der Benutzer wird beim nächsten Login durch das 2FA-Setup geführt.</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMfaResetDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleMfaResetConfirm} disabled={resettingMfa}>
              {resettingMfa ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird zurückgesetzt…</>
              ) : (
                <><ShieldOff className="h-4 w-4 mr-2" />2FA jetzt zurücksetzen</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
