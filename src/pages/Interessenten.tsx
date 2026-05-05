import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
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
import { Search, Eye, CheckCircle2, XCircle, Clock, FileText, AlertTriangle, Send, UserCheck, FilePlus, UserPlus, Upload, RefreshCw, Phone, FileSignature, ArrowRight, Ban, Globe, CalendarCheck } from "lucide-react";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
// UploadPaperContractDialog removed – paper flow decommissioned
import { LeadDetailDialog } from "@/components/leads/LeadDetailDialog";
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
  kein_abschluss: { label: "Kein Abschluss", variant: "destructive" },
  abgelehnt: { label: "Abgelehnt", variant: "destructive" },
  kunde: { label: "Kunde", variant: "default" },
};

type NextStep = {
  label: string;
  icon: React.ReactNode;
  color: string;
  action?: "contact" | "qualify" | "contract" | "paper" | "none";
};

function getNextStep(lead: any): NextStep {
  switch (lead.status) {
    case "neu":
      return { label: "Kontaktieren", icon: <Phone className="h-3 w-3" />, color: "bg-primary/10 text-primary border-primary/30", action: "contact" };
    case "kontaktiert":
      return { label: "Qualifizieren", icon: <UserCheck className="h-3 w-3" />, color: "bg-accent/10 text-accent border-accent/30", action: "qualify" };
    case "qualifiziert":
      return { label: "Vertrag erstellen", icon: <FilePlus className="h-3 w-3" />, color: "bg-success/10 text-success border-success/30", action: "contract" };
    case "vertrag":
      // Paper flow decommissioned – show no next action for 'vertrag' status
      return { label: "Abgeschlossen", icon: <Ban className="h-3 w-3" />, color: "bg-muted text-muted-foreground border-border", action: "none" };
    case "kein_abschluss":
    case "abgelehnt":
      return { label: "Abgeschlossen", icon: <Ban className="h-3 w-3" />, color: "bg-muted text-muted-foreground border-border", action: "none" };
    default:
      return { label: "Kontaktieren", icon: <Phone className="h-3 w-3" />, color: "bg-primary/10 text-primary border-primary/30", action: "contact" };
  }
}

export default function Interessenten() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [poolOnly, setPoolOnly] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isSalesLead, isRegionalLead, isTippgeber, isSalesPartner } = useUserRole();
  const { user } = useAuth();
  const { teamFilter, setTeamFilter, matchesTeamFilter, teamFilterOptions } = useRegionalTeam();

  // Backend-Policy lässt UPDATE assigned_to nur für admin und sales_lead zu.
  // Regional Leads haben kein UPDATE-Recht — Dropdown daher ausblenden, um Silent Failures zu vermeiden.
  const canAssign = isAdmin || isSalesLead;
  // Tippgeber can create leads but cannot update status or assign
  const canOnlyViewOwn = isTippgeber || isSalesPartner;
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  // uploadContractLead state removed – paper flow decommissioned

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

  // Pool-Counter (nur Admin/Sales Lead): Zahl unzugewiesener, nicht-Kunde Leads
  const { data: poolCount = 0 } = useQuery({
    queryKey: ["leads-pool-count"],
    enabled: isAdmin || isSalesLead,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("assigned_to", null)
        .neq("status", "kunde");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Deep-Link: ?lead=<id> → Lead automatisch öffnen (auch wenn nicht in aktueller Liste)
  const leadIdFromUrl = searchParams.get("lead");
  useEffect(() => {
    if (!leadIdFromUrl) return;
    if (selectedLead?.id === leadIdFromUrl) return;
    const inList = leads.find((l: any) => l.id === leadIdFromUrl);
    if (inList) {
      setSelectedLead(inList);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadIdFromUrl)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast({
          title: "Interessent nicht gefunden",
          description: "Der verknüpfte Interessent ist nicht (mehr) sichtbar.",
          variant: "destructive",
        });
        const next = new URLSearchParams(searchParams);
        next.delete("lead");
        setSearchParams(next, { replace: true });
        return;
      }
      setSelectedLead(data);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadIdFromUrl, leads]);

  const closeLeadDialog = () => {
    setSelectedLead(null);
    if (searchParams.has("lead")) {
      const next = new URLSearchParams(searchParams);
      next.delete("lead");
      setSearchParams(next, { replace: true });
    }
  };

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
      queryClient.invalidateQueries({ queryKey: ["leads-pool-count"] });
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
      queryClient.invalidateQueries({ queryKey: ["leads-pool-count"] });
      toast({ title: "Gebietsleiter zugewiesen", description: "AD wurde per E-Mail benachrichtigt." });
    },
  });

  const filtered = leads.filter((l: any) => {
    // Tippgeber and sales_partner can only see their own leads
    if (canOnlyViewOwn && l.assigned_to !== user?.id && l.tippgeber_id !== user?.id) {
      // sales_partner: assigned_to === user; tippgeber: tippgeber_id === user
      if (isTippgeber && l.tippgeber_id !== user?.id) return false;
      if (isSalesPartner && l.assigned_to !== user?.id) return false;
    }
    if (!matchesTeamFilter(l.assigned_to)) return false;
    if (poolOnly && l.assigned_to !== null) return false;
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
              <SelectItem value="kein_abschluss">Kein Abschluss</SelectItem>
              <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
            </SelectContent>
          </Select>
          {isRegionalLead && teamFilterOptions.length > 1 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamFilterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
        <div className="card-elevated overflow-hidden overflow-x-auto text-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HFX-Nr.</TableHead>
                <TableHead>Praxis / Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>PLZ</TableHead>
                <TableHead>Abr.-Zentrum</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead>Anfrageeingang</TableHead>
                <TableHead>Statusänderung</TableHead>
                <TableHead className="text-center">&lt;10T</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nächster Schritt</TableHead>
                {canAssign && <TableHead>AD-Zuteilung</TableHead>}
                <TableHead className="text-center">SF</TableHead>
                <TableHead className="text-center">Qodia</TableHead>
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
                    <TableRow key={lead.id} className="cursor-pointer" onClick={() => setSelectedLead(lead)}>
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
                      <TableCell>{(lead.abrechnungszentrum === "nein" || lead.abrechnungszentrum === "keins") ? "–" : lead.abrechnungszentrum}</TableCell>
                      <TableCell>
                        {(() => {
                          const src = lead.source;
                          if (src === "reservation_conversion") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-warning/10 text-warning-foreground border-warning/30">
                                <CalendarCheck className="h-3 w-3" />
                                Reservierung
                              </span>
                            );
                          }
                          if (src === "manual") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-accent/10 text-accent border-accent/30">
                                <UserPlus className="h-3 w-3" />
                                Manuell
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30">
                              <Globe className="h-3 w-3" />
                              Homepage
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(lead.created_at), "dd.MM.yy HH:mm", { locale: de })}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(lead.updated_at), "dd.MM.yy HH:mm", { locale: de })}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const daysSinceUpdate = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                          const isStale = daysSinceUpdate >= 10 && !["kunde", "kein_abschluss", "abgelehnt"].includes(lead.status);
                          return isStale ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Seit {daysSinceUpdate} Tagen keine Statusänderung</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {canOnlyViewOwn ? (
                          <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                        ) : (
                          <Select
                            value={lead.status}
                            onValueChange={(val) => {
                              const order = ["neu", "kontaktiert", "qualifiziert", "vertrag", "kein_abschluss", "abgelehnt"];
                              const currentIdx = order.indexOf(lead.status);
                              if (val === "neu" && currentIdx > 1) return;
                              updateStatusMutation.mutate({ id: lead.id, status: val });
                            }}
                          >
                            <SelectTrigger className="h-7 w-[130px]">
                              <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusConfig)
                                .filter(([key]) => key !== "kunde")
                                .map(([key, cfg]) => (
                                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const step = getNextStep(lead);
                          if (step.action === "none") {
                            return (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${step.color}`}>
                                {step.icon}
                                {step.label}
                              </span>
                            );
                          }
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border cursor-pointer transition-opacity hover:opacity-80 ${step.color}`}
                                    onClick={() => {
                                      if (step.action === "contact") {
                                        updateStatusMutation.mutate({ id: lead.id, status: "kontaktiert" });
                                      } else if (step.action === "qualify") {
                                        updateStatusMutation.mutate({ id: lead.id, status: "qualifiziert" });
                                      } else if (step.action === "contract") {
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
                                      }
                                     }}
                                  >
                                    {step.icon}
                                    {step.label}
                                    <ArrowRight className="h-2.5 w-2.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {step.action === "contact" && "Status auf 'Kontaktiert' setzen"}
                                  {step.action === "qualify" && "Status auf 'Qualifiziert' setzen"}
                                  {step.action === "contract" && "Digitalen Vertrag erstellen"}
                                  {step.action === "paper" && "Papiervertrag einreichen"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                      </TableCell>
                      {canAssign && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {lead.salesforce_synced ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
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
                          {lead.qodia_conflict && !lead.qodia_synced && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-0 leading-4 cursor-default">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    E-Mail Konflikt
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Qodia meldet: E-Mail-Adresse bereits vorhanden (409).<br />Das Konto existiert in Qodia, aber der Sync ist fehlgeschlagen.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  disabled={resending}
                                  onClick={() => resendCredentials(lead.id)}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Zugangsdaten senden</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                              {/* Papiervertrag-Button removed – paper flow decommissioned */}
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

      {/* Detail Dialog – replaced by dedicated LeadDetailDialog component */}
      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead}
          onClose={closeLeadDialog}
          gebietsleiter={gebietsleiter}
          canAssign={canAssign}
        />
      )}

      <CreateLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} />
      {/* UploadPaperContractDialog removed – paper flow decommissioned */}
    </MainLayout>
  );
}

