import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Eye, CheckCircle2, XCircle, Clock, FileText, AlertTriangle, Send, UserCheck, FilePlus, UserPlus, Upload, RefreshCw } from "lucide-react";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { UploadPaperContractDialog } from "@/components/leads/UploadPaperContractDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  neu: { label: "Neu", variant: "default" },
  kontaktiert: { label: "Kontaktiert", variant: "secondary" },
  qualifiziert: { label: "Qualifiziert", variant: "outline" },
  vertrag: { label: "Vertrag", variant: "outline" },
  abgelehnt: { label: "Abgelehnt", variant: "destructive" },
  kunde: { label: "Kunde", variant: "default" },
};

export default function Interessenten() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isSalesLead, isRegionalLead } = useUserRole();

  const canAssign = isAdmin || isSalesLead || isRegionalLead;
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [uploadContractLead, setUploadContractLead] = useState<any>(null);

  // Fetch Gebietsleiter users for assignment
  const { data: gebietsleiter = [] } = useQuery({
    queryKey: ["gebietsleiter-users"],
    enabled: canAssign,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["user", "sales_lead", "regional_lead"]);
      if (!roles?.length) return [];
      // Deduplicate user IDs (a user could have multiple roles)
      const userIds = [...new Set(roles.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds)
        .order("full_name");
      return profiles || [];
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .neq("status", "kunde")
        .order("created_at", { ascending: false });

      if (statusFilter !== "alle") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const [resending, setResending] = useState(false);
  const [syncingQodia, setSyncingQodia] = useState(false);

  const resendCredentials = async (leadId: string) => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: { leadId },
      });
      if (error) throw error;
      toast({ title: "Zugangsdaten versendet", description: data?.message });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const syncToQodia = async (leadId: string) => {
    setSyncingQodia(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lead-qodia", {
        body: { leadId },
      });
      if (error) throw error;
      if (data?.already_synced) {
        toast({ title: "Bereits synchronisiert", description: data.message });
      } else if (data?.success) {
        toast({ title: "Qodia-Sync erfolgreich", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        // Refresh selectedLead if open
        if (selectedLead?.id === leadId) {
          setSelectedLead((prev: any) => prev ? { ...prev, qodia_synced: true } : prev);
        }
      } else {
        toast({ title: "Qodia-Fehler", description: data?.error || "Unbekannter Fehler", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Sync fehlgeschlagen", variant: "destructive" });
    } finally {
      setSyncingQodia(false);
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const assignLeadMutation = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string | null }) => {
      const { error } = await supabase
        .from("leads")
        .update({ assigned_to })
        .eq("id", id);
      if (error) throw error;
      // Send email notification to the newly assigned AD
      if (assigned_to) {
        await supabase.functions.invoke("notify-lead-assignment", {
          body: { leadId: id, assignedToUserId: assigned_to },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Gebietsleiter zugewiesen", description: "AD wurde per E-Mail benachrichtigt." });
    },
  });

  const filtered = leads.filter((l: any) => {
    const s = search.toLowerCase();
    return (
      !s ||
      l.praxis_name?.toLowerCase().includes(s) ||
      l.vorname?.toLowerCase().includes(s) ||
      l.nachname?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.hfx_customer_number?.toLowerCase().includes(s) ||
      l.plz?.includes(s)
    );
  });

  const getAssigneeName = (assigned_to: string | null) => {
    if (!assigned_to) return null;
    const p = gebietsleiter.find((g: any) => g.user_id === assigned_to);
    return p ? p.full_name : "–";
  };

  return (
    <MainLayout title="Interessenten" subtitle="Lead-Übersicht aus Website-Kontaktformular">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen nach Name, Praxis, E-Mail, HFX-Nr..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="neu">Neu</SelectItem>
              <SelectItem value="kontaktiert">Kontaktiert</SelectItem>
              <SelectItem value="qualifiziert">Qualifiziert</SelectItem>
              <SelectItem value="vertrag">Vertrag</SelectItem>
              <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateLeadOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="h-4 w-4" />
            Neuer Interessent
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">Gesamt</p>
            <p className="text-2xl font-bold text-foreground">{leads.length}</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">Neue Leads</p>
            <p className="text-2xl font-bold text-primary">{leads.filter((l: any) => l.status === "neu").length}</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">SF synced</p>
            <p className="text-2xl font-bold text-green-600">{leads.filter((l: any) => l.salesforce_synced).length}</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">Heute</p>
            <p className="text-2xl font-bold text-foreground">
              {leads.filter((l: any) => new Date(l.created_at).toDateString() === new Date().toDateString()).length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="card-elevated overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HFX-Nr.</TableHead>
                <TableHead>Praxis / Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>PLZ</TableHead>
                <TableHead>Abr.-Zentrum</TableHead>
                <TableHead>Status</TableHead>
                {canAssign && <TableHead>AD-Zuteilung</TableHead>}
                        <TableHead className="text-center">SF</TableHead>
                        <TableHead className="text-center">Qodia</TableHead>
                        <TableHead>Datum</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canAssign ? 11 : 10} className="text-center py-8 text-muted-foreground">
                    Lade Interessenten...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canAssign ? 11 : 10} className="text-center py-8 text-muted-foreground">
                    Keine Interessenten gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead: any) => {
                  const sc = statusConfig[lead.status] || statusConfig.neu;
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="font-mono text-sm font-medium">{lead.hfx_customer_number}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div>
                            <p className="font-medium text-foreground">{lead.praxis_name}</p>
                            <p className="text-sm text-muted-foreground">{lead.vorname} {lead.nachname}</p>
                          </div>
                          {(lead.registration_attempts ?? 1) > 1 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full border border-amber-300 cursor-default mt-0.5 shrink-0">
                                    <AlertTriangle className="h-3 w-3" />
                                    {lead.registration_attempts}x
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Hat sich {lead.registration_attempts}× registriert – Zugangsdaten wurden erneut zugesendet.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{lead.email}</TableCell>
                      <TableCell>{lead.plz}</TableCell>
                      <TableCell className="text-sm">{(lead.abrechnungszentrum === "nein" || lead.abrechnungszentrum === "keins") ? "–" : lead.abrechnungszentrum}</TableCell>
                      <TableCell>
                        <Select
                          value={lead.status}
                          onValueChange={(val) => {
                            // Statusübergänge einschränken: kein Sprung zurück auf "neu"
                            const order = ["neu", "kontaktiert", "qualifiziert", "vertrag", "abgelehnt"];
                            const currentIdx = order.indexOf(lead.status);
                            const newIdx = order.indexOf(val);
                            // Rücksprung auf "neu" nur wenn aktuell "kontaktiert"
                            if (val === "neu" && currentIdx > 1) return;
                            updateStatusMutation.mutate({ id: lead.id, status: val });
                          }}
                        >
                          <SelectTrigger className="h-7 w-[130px]">
                            <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig)
                              .filter(([key]) => key !== "kunde") // "kunde" wird automatisch gesetzt
                              .map(([key, cfg]) => (
                                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {canAssign && (
                        <TableCell>
                          <Select
                            value={lead.assigned_to || "none"}
                            onValueChange={(val) =>
                              assignLeadMutation.mutate({ id: lead.id, assigned_to: val === "none" ? null : val })
                            }
                          >
                            <SelectTrigger className="h-7 w-[150px]">
                              <SelectValue>
                                {lead.assigned_to ? (
                                  <span className="flex items-center gap-1 text-xs">
                                    <UserCheck className="h-3 w-3 text-green-600" />
                                    {getAssigneeName(lead.assigned_to)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Nicht zugewiesen</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nicht zugewiesen</SelectItem>
                              {gebietsleiter.map((g: any) => (
                                <SelectItem key={g.user_id} value={g.user_id}>
                                  {g.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        {lead.salesforce_synced ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {lead.qodia_synced ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 mx-auto text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  disabled={syncingQodia}
                                  onClick={() => syncToQodia(lead.id)}
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${syncingQodia ? "animate-spin" : ""}`} />
                                </Button>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {lead.qodia_synced ? "Bei Qodia registriert" : "Noch nicht bei Qodia – klicken zum Synchronisieren"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), "dd.MM.yy HH:mm", { locale: de })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedLead(lead)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {lead.status !== "kunde" && lead.status !== "abgelehnt" && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-primary hover:text-primary"
                                      onClick={() => {
                                        updateStatusMutation.mutate({ id: lead.id, status: "vertrag" });
                                        navigate("/vertrieb/vertraege", {
                                          state: {
                                            fromLead: {
                                              lead_id: lead.id,
                                              hfx_customer_number: lead.hfx_customer_number,
                                              praxis: lead.praxis_name,
                                              vorname: lead.vorname,
                                              nachname: lead.nachname,
                                              email: lead.email,
                                              plz: lead.plz,
                                              ort: lead.ort || "",
                                              adresse: lead.adresse || "",
                                              telefon: lead.mobilnummer,
                                              mp_nr: lead.mp_nummer || "",
                                              nachricht: lead.nachricht || "",
                                            },
                                          },
                                        });
                                      }}
                                    >
                                      <FilePlus className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Digitalen Vertrag erstellen</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-warning hover:text-warning"
                                      onClick={() => setUploadContractLead(lead)}
                                    >
                                      <Upload className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Papiervertrag einreichen</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Interessent: {selectedLead?.hfx_customer_number}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Praxisname</p>
                  <p className="font-medium">{selectedLead.praxis_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedLead.vorname} {selectedLead.nachname}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">E-Mail</p>
                  <p className="font-medium">{selectedLead.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mobilnummer</p>
                  <p className="font-medium">{selectedLead.mobilnummer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">PLZ</p>
                  <p className="font-medium">{selectedLead.plz}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Abrechnungszentrum</p>
                  <p className="font-medium">
                    {(selectedLead.abrechnungszentrum === "nein" || selectedLead.abrechnungszentrum === "keins")
                      ? "–"
                      : selectedLead.abrechnungszentrum}
                  </p>
                </div>
                {selectedLead.mp_nummer && (
                  <div>
                    <p className="text-muted-foreground">MP-Nummer</p>
                    <p className="font-medium">{selectedLead.mp_nummer}</p>
                  </div>
                )}
                {canAssign && (
                  <div>
                    <p className="text-muted-foreground">AD-Zuteilung</p>
                    <p className="font-medium">
                      {selectedLead.assigned_to ? getAssigneeName(selectedLead.assigned_to) : "Nicht zugewiesen"}
                    </p>
                  </div>
                )}
              </div>
              {selectedLead.nachricht && (
                <div>
                  <p className="text-sm text-muted-foreground">Nachricht</p>
                  <p className="text-sm bg-muted p-3 rounded-md mt-1">{selectedLead.nachricht}</p>
                </div>
              )}
              <div className="flex gap-2 text-xs text-muted-foreground pt-2 border-t">
                <span className="flex items-center gap-1">
                  {selectedLead.confirmation_email_sent ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                  E-Mail
                </span>
                <span className="flex items-center gap-1">
                  {selectedLead.salesforce_synced ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                  Salesforce
                </span>
                <span className="flex items-center gap-1">
                  {selectedLead.qodia_synced ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                  Qodia
                </span>
                <span className="flex items-center gap-1">
                  {selectedLead.honorarplus_synced ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                  HonorarPlus
                </span>
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={resending}
                    onClick={() => resendCredentials(selectedLead.id)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {resending ? "Wird gesendet…" : "Zugangsdaten erneut senden"}
                  </Button>
                  {!selectedLead.qodia_synced && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                            disabled={syncingQodia}
                            onClick={() => syncToQodia(selectedLead.id)}
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${syncingQodia ? "animate-spin" : ""}`} />
                            {syncingQodia ? "Synchronisiere…" : "Bei Qodia registrieren"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Lead manuell bei Qodia registrieren (qodia_synced = false)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    const lead = selectedLead;
                    setSelectedLead(null);
                    updateStatusMutation.mutate({ id: lead.id, status: "vertrag" });
                    navigate("/vertrieb/vertraege", {
                      state: {
                        fromLead: {
                          lead_id: lead.id,
                          hfx_customer_number: lead.hfx_customer_number,
                          praxis: lead.praxis_name,
                          vorname: lead.vorname,
                          nachname: lead.nachname,
                          email: lead.email,
                          plz: lead.plz,
                          telefon: lead.mobilnummer,
                          mp_nr: lead.mp_nummer || "",
                        },
                      },
                    });
                  }}
                >
                  <FilePlus className="h-4 w-4 mr-2" />
                  Vertrag erstellen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} />
      <UploadPaperContractDialog
        open={!!uploadContractLead}
        onOpenChange={(open) => { if (!open) setUploadContractLead(null); }}
        lead={uploadContractLead}
      />
    </MainLayout>
  );
}
