import { useState, useRef } from "react";
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
import { Search, MoreHorizontal, Pencil, Trash2, Shield, Users, Loader2, UserPlus, FileText, UserCog, Clock, Upload, Download, CheckCircle, Mail, Eye } from "lucide-react";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { RegionalAssignmentDialog } from "@/components/admin/RegionalAssignmentDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRole {
  user_id: string;
  role: AppRole;
  full_name: string;
  email: string;
  created_at: string;
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("user");
  const [uploadingAgreement, setUploadingAgreement] = useState(false);
  const [credentialsPreviewOpen, setCredentialsPreviewOpen] = useState(false);
  const [sendingCredentials, setSendingCredentials] = useState(false);
  const agreementInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch users with roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at");

      if (rolesError) throw rolesError;

      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, last_seen_at");

      if (profilesError) throw profilesError;

      // Merge roles with profiles
      const usersWithRoles: UserWithRole[] = roles.map((role) => {
        const profile = profiles.find((p) => p.user_id === role.user_id);
        return {
          user_id: role.user_id,
          role: role.role,
          full_name: profile?.full_name || "Unbekannt",
          email: profile?.email || "-",
          created_at: role.created_at,
          last_seen_at: (profile as { last_seen_at?: string | null } | undefined)?.last_seen_at ?? null,
        };
      });

      return usersWithRoles;
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Rolle aktualisiert",
        description: "Die Benutzerrolle wurde erfolgreich geändert.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation (removes role, not the auth user)
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Benutzer entfernt",
        description: "Die Rolle wurde erfolgreich entfernt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const adminCount = users.filter((u) => u.role === "admin").length;
  const vertragsabteilungCount = users.filter((u) => u.role === "vertragsabteilung").length;
  const salesLeadCount = users.filter((u) => u.role === "sales_lead").length;
  const regionalLeadCount = users.filter((u) => u.role === "regional_lead").length;
  const salesPartnerCount = users.filter((u) => u.role === "sales_partner").length;
  const tippgeberCount = users.filter((u) => u.role === "tippgeber").length;
  const userCount = users.filter((u) => u.role === "user").length;

  const handleEditClick = (user: UserWithRole) => {
    setSelectedUser(user);
    setSelectedRole(user.role);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (user: UserWithRole) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleAssignClick = (user: UserWithRole) => {
    setSelectedUser(user);
    setAssignDialogOpen(true);
  };

  const handleAgreementClick = (user: UserWithRole) => {
    setSelectedUser(user);
    setAgreementDialogOpen(true);
  };

  const handleSendCredentialsClick = (user: UserWithRole) => {
    setSelectedUser(user);
    setCredentialsPreviewOpen(true);
  };

  const handleSendCredentialsConfirm = async () => {
    if (!selectedUser) return;
    setSendingCredentials(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("create-user", {
        body: {
          email: selectedUser.email,
          fullName: selectedUser.full_name,
          role: selectedUser.role,
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
        <Button onClick={() => setCreateDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Benutzer anlegen
        </Button>
      </div>

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
                  <th>Rolle</th>
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
                      <Badge
                        variant="secondary"
                        className={roleConfig[user.role]?.color || ""}
                      >
                        {roleConfig[user.role]?.label || user.role}
                      </Badge>
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
                          <DropdownMenuItem onClick={() => handleEditClick(user)}>
                             <Pencil className="h-4 w-4 mr-2" />
                             Rolle ändern
                           </DropdownMenuItem>
                           {user.role === "regional_lead" && (
                             <DropdownMenuItem onClick={() => handleAssignClick(user)}>
                               <UserCog className="h-4 w-4 mr-2" />
                               Team zuordnen
                             </DropdownMenuItem>
                           )}
                           {user.role === "tippgeber" && (
                             <DropdownMenuItem onClick={() => handleAgreementClick(user)}>
                               <Upload className="h-4 w-4 mr-2" />
                               Vereinbarung hochladen
                             </DropdownMenuItem>
                           )}
                           <DropdownMenuItem onClick={() => handleSendCredentialsClick(user)}>
                             <Mail className="h-4 w-4 mr-2" />
                             Zugangsdaten zusenden
                           </DropdownMenuItem>
                           <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Entfernen
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

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rolle ändern</DialogTitle>
            <DialogDescription>
              Ändern Sie die Rolle für diesen Benutzer.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>

              <div className="space-y-2">
                <Label>Neue Rolle</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                    <SelectItem value="user">Gebietsleiter</SelectItem>
                    <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                    <SelectItem value="regional_lead">Regionalleiter</SelectItem>
                    <SelectItem value="sales_lead">Vertriebsleitung</SelectItem>
                    <SelectItem value="vertragsabteilung">Vertragsabteilung</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  updateRoleMutation.mutate({
                    userId: selectedUser.user_id,
                    newRole: selectedRole,
                  });
                }
              }}
              disabled={updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                "Speichern"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzer entfernen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie diesen Benutzer entfernen möchten? 
              Die Rolle wird entfernt, der Account bleibt jedoch bestehen.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">{selectedUser.full_name}</p>
              <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedUser) {
                  deleteUserMutation.mutate(selectedUser.user_id);
                }
              }}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird entfernt...
                </>
              ) : (
                "Entfernen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Regional Assignment Dialog */}
      <RegionalAssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        regionalLead={selectedUser}
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
                  <p className="text-xs text-muted-foreground">{selectedUser.email} · {roleConfig[selectedUser.role]?.label}</p>
                </div>
              </div>

              {/* Email Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-Mail-Vorschau</span>
                </div>
                <div className="p-4 bg-[#f9fafb]">
                  {/* Simulated email */}
                  <div style={{ fontFamily: "Arial, sans-serif", maxWidth: "500px", margin: "0 auto" }}>
                    <div style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "white", padding: "24px 20px", borderRadius: "8px 8px 0 0", textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>🦊 Willkommen!</div>
                      <div style={{ margin: "8px 0 0 0", opacity: 0.9, fontSize: "14px" }}>HFX Sales Portal</div>
                    </div>
                    <div style={{ background: "white", padding: "24px 20px", border: "1px solid #e5e7eb", borderTop: "none" }}>
                      <p style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Hallo <strong>{selectedUser.full_name}</strong>,</p>
                      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#555" }}>Ihr Benutzerkonto wurde erfolgreich erstellt. Sie wurden als <strong>{roleConfig[selectedUser.role]?.label}</strong> registriert.</p>
                      <div style={{ background: "#f3f4f6", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "16px", marginBottom: "16px" }}>
                        <div style={{ fontWeight: "bold", color: "#374151", marginBottom: "12px", fontSize: "13px" }}>Ihre Zugangsdaten</div>
                        <div style={{ marginBottom: "10px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Registrierte E-Mail-Adresse</div>
                          <div style={{ fontSize: "13px", background: "white", padding: "8px 10px", borderRadius: "6px", fontFamily: "monospace", border: "1px solid #e5e7eb" }}>{selectedUser.email}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Temporäres Passwort</div>
                          <div style={{ fontSize: "13px", background: "white", padding: "8px 10px", borderRadius: "6px", fontFamily: "monospace", border: "1px dashed #d1d5db", color: "#9ca3af" }}>wird beim Versand generiert</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "center", marginBottom: "16px" }}>
                        <div style={{ display: "inline-block", background: "#f97316", color: "white", padding: "10px 24px", borderRadius: "6px", fontWeight: "bold", fontSize: "13px" }}>Zum Portal anmelden</div>
                      </div>
                      <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", color: "#92400e" }}>
                        ⚠️ <strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.
                      </div>
                    </div>
                    <div style={{ background: "#f9fafb", padding: "14px 20px", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", fontSize: "12px", color: "#6b7280", textAlign: "center" }}>
                      Bei Fragen wenden Sie sich bitte an Ihren Administrator.
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
            <Button onClick={handleSendCredentialsConfirm} disabled={sendingCredentials}>
              {sendingCredentials ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gesendet…</>
              ) : (
                <><Mail className="h-4 w-4 mr-2" />Zugangsdaten jetzt senden</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

