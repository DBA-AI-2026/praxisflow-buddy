import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Plus,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Hash,
  User,
  ClipboardList,
} from "lucide-react";

// TODO Etappe 6 Cleanup: Duplikat von CONTRACT_STATUS_CONFIG aus @/lib/statusConfig — konsolidieren.
const contractStatusConfig: Record<string, { label: string; color: string }> = {
  entwurf: { label: "Entwurf", color: "bg-muted text-muted-foreground" },
  eingegangen: { label: "Versendet, wartet auf Mandat", color: "bg-warning/10 text-warning" },
  gezeichnet: { label: "Gezeichnet", color: "bg-primary/10 text-primary" },
  aktiv: { label: "Aktiv", color: "bg-success/10 text-success" },
  gekuendigt: { label: "Gekündigt", color: "bg-warning/10 text-warning" },
  beendet: { label: "Beendet", color: "bg-destructive/10 text-destructive" },
  gesperrt: { label: "Gesperrt", color: "bg-destructive/20 text-destructive" },
};

const caseTypeLabels: Record<string, string> = {
  neuabschluss: "Neuabschluss",
  aenderung: "Änderung",
  upgrade: "Upgrade",
  kuendigung: "Kündigung",
  verlaengerung: "Verlängerung",
  support: "Support",
};

const caseStatusLabels: Record<string, { label: string; color: string }> = {
  offen: { label: "Offen", color: "bg-warning/10 text-warning" },
  in_bearbeitung: { label: "In Bearbeitung", color: "bg-primary/10 text-primary" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-success/10 text-success" },
};

// ─── Customer Detail View ──────────────────────────────────────────────
function CustomerDetail({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState({ case_type: "neuabschluss", contract_id: "", title: "", notes: "" });
  const [savingCase, setSavingCase] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers" as any)
        .select("*")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["customer-contracts", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_number, product_name, monthly_price, status, start_date, hfx_customer_number")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["customer-cases", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_cases" as any)
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
  });

  const handleCreateCase = async () => {
    if (!user?.id) return;
    setSavingCase(true);
    try {
      const payload: any = {
        customer_id: customerId,
        case_type: newCaseForm.case_type,
        title: newCaseForm.title || caseTypeLabels[newCaseForm.case_type],
        notes: newCaseForm.notes || null,
        created_by: user.id,
        status: "offen",
      };
      if (newCaseForm.contract_id) payload.contract_id = newCaseForm.contract_id;

      const { error } = await supabase.from("contract_cases" as any).insert(payload);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer-cases", customerId] });
      toast({ title: "✅ Vorgang angelegt" });
      setNewCaseOpen(false);
      setNewCaseForm({ case_type: "neuabschluss", contract_id: "", title: "", notes: "" });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setSavingCase(false);
    }
  };

  const handleSaveCustomer = async () => {
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("customers" as any)
        .update({
          praxis_name: editForm.praxis_name,
          vorname: editForm.vorname,
          nachname: editForm.nachname,
          email: editForm.email,
          telefon: editForm.telefon,
          adresse: editForm.adresse,
          plz: editForm.plz,
          ort: editForm.ort,
          mp_nr: editForm.mp_nr,
          bsnr: editForm.bsnr,
          lanr: editForm.lanr,
          notes: editForm.notes,
        })
        .eq("id", customerId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "✅ Kundendaten gespeichert" });
      setEditingCustomer(false);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Kunde nicht gefunden.
        <Button variant="link" onClick={() => navigate("/pipeline?tab=kunden")}>Zurück zur Übersicht</Button>
      </div>
    );
  }

  const c = customer as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pipeline?tab=kunden")} className="mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">{c.praxis_name || `${c.vorname} ${c.nachname}`}</h2>
            <Badge variant="secondary" className="font-mono text-xs">{c.hfx_customer_number}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{c.ort ? `${c.plz} ${c.ort}` : ""}</p>
        </div>
      </div>

      <Tabs defaultValue="stammdaten">
        <TabsList>
          <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
          <TabsTrigger value="vertraege">
            Verträge
            {contracts.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/15 text-primary rounded-full px-1.5 py-0.5">{contracts.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vorgaenge">
            Vorgänge
            {cases.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/15 text-primary rounded-full px-1.5 py-0.5">{cases.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Stammdaten ── */}
        <TabsContent value="stammdaten" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Stammdaten</CardTitle>
              {isAdmin && !editingCustomer && (
                <Button size="sm" variant="outline" onClick={() => { setEditForm({ ...c }); setEditingCustomer(true); }}>
                  Bearbeiten
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingCustomer && editForm ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Praxisname</Label>
                      <Input value={editForm.praxis_name || ""} onChange={e => setEditForm((f: any) => ({ ...f, praxis_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>MP-Nummer</Label>
                      <Input value={editForm.mp_nr || ""} onChange={e => setEditForm((f: any) => ({ ...f, mp_nr: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Vorname</Label>
                      <Input value={editForm.vorname || ""} onChange={e => setEditForm((f: any) => ({ ...f, vorname: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Nachname</Label>
                      <Input value={editForm.nachname || ""} onChange={e => setEditForm((f: any) => ({ ...f, nachname: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>E-Mail</Label>
                      <Input type="email" value={editForm.email || ""} onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Telefon</Label>
                      <Input value={editForm.telefon || ""} onChange={e => setEditForm((f: any) => ({ ...f, telefon: e.target.value }))} />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label>Adresse</Label>
                      <Input value={editForm.adresse || ""} onChange={e => setEditForm((f: any) => ({ ...f, adresse: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>PLZ</Label>
                      <Input value={editForm.plz || ""} onChange={e => setEditForm((f: any) => ({ ...f, plz: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Ort</Label>
                      <Input value={editForm.ort || ""} onChange={e => setEditForm((f: any) => ({ ...f, ort: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>BSNR</Label>
                      <Input value={editForm.bsnr || ""} onChange={e => setEditForm((f: any) => ({ ...f, bsnr: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>LANR</Label>
                      <Input value={editForm.lanr || ""} onChange={e => setEditForm((f: any) => ({ ...f, lanr: e.target.value }))} />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label>Notizen</Label>
                      <Textarea rows={3} value={editForm.notes || ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveCustomer} disabled={savingEdit}>
                      {savingEdit && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Speichern
                    </Button>
                    <Button variant="outline" onClick={() => setEditingCustomer(false)}>Abbrechen</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {c.praxis_name && (
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Praxis</p>
                        <p className="text-sm font-medium">{c.praxis_name}</p>
                      </div>
                    </div>
                  )}
                  {(c.vorname || c.nachname) && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Kontakt</p>
                        <p className="text-sm font-medium">{[c.vorname, c.nachname].filter(Boolean).join(" ")}</p>
                      </div>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">E-Mail</p>
                        <p className="text-sm font-medium">{c.email}</p>
                      </div>
                    </div>
                  )}
                  {c.telefon && (
                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Telefon</p>
                        <p className="text-sm font-medium">{c.telefon}</p>
                      </div>
                    </div>
                  )}
                  {(c.adresse || c.plz || c.ort) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Adresse</p>
                        <p className="text-sm font-medium">{[c.adresse, c.plz, c.ort].filter(Boolean).join(", ")}</p>
                      </div>
                    </div>
                  )}
                  {c.mp_nr && (
                    <div className="flex items-start gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">MP-Nummer</p>
                        <p className="text-sm font-mono font-medium">{c.mp_nr}</p>
                      </div>
                    </div>
                  )}
                  {c.bsnr && (
                    <div className="flex items-start gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">BSNR</p>
                        <p className="text-sm font-mono font-medium">{c.bsnr}</p>
                      </div>
                    </div>
                  )}
                  {c.lanr && (
                    <div className="flex items-start gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">LANR</p>
                        <p className="text-sm font-mono font-medium">{c.lanr}</p>
                      </div>
                    </div>
                  )}
                  {c.notes && (
                    <div className="col-span-2 flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Notizen</p>
                        <p className="text-sm">{c.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: Verträge ── */}
        <TabsContent value="vertraege" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Verträge</CardTitle>
              <Button size="sm" variant="outline" onClick={() => window.open(`/vertrieb/vertraege`, "_self")}>
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Neuer Vertrag
              </Button>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Verträge vorhanden.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Vertragsnr.</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Produkt</th>
                        <th className="text-right text-xs font-medium text-muted-foreground pb-2 pr-4">Monatspreis</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2">Start</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(contracts as any[]).map((ct) => {
                        const sc = contractStatusConfig[ct.status] ?? { label: ct.status, color: "bg-muted text-muted-foreground" };
                        return (
                          <tr key={ct.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 pr-4 font-mono text-xs text-primary font-semibold whitespace-nowrap">{ct.contract_number || "–"}</td>
                            <td className="py-2.5 pr-4 font-medium">{ct.product_name}</td>
                            <td className="py-2.5 pr-4 text-right font-mono">{Number(ct.monthly_price).toFixed(2)} €</td>
                            <td className="py-2.5 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs">{ct.start_date ? format(new Date(ct.start_date), "dd.MM.yyyy", { locale: de }) : "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Vorgänge ── */}
        <TabsContent value="vorgaenge" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Vorgänge</CardTitle>
              <Button size="sm" onClick={() => setNewCaseOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Neuer Vorgang
              </Button>
            </CardHeader>
            <CardContent>
              {(cases as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Vorgänge vorhanden.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Vorgangsnr.</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Typ</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Titel</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Status</th>
                        <th className="text-left text-xs font-medium text-muted-foreground pb-2">Erstellt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(cases as any[]).map((cc) => {
                        const sc = caseStatusLabels[cc.status] ?? { label: cc.status, color: "bg-muted text-muted-foreground" };
                        return (
                          <tr key={cc.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 pr-4 font-mono text-xs text-primary font-semibold whitespace-nowrap">{cc.case_number}</td>
                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">{caseTypeLabels[cc.case_type] || cc.case_type}</td>
                            <td className="py-2.5 pr-4 font-medium">{cc.title || "–"}</td>
                            <td className="py-2.5 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs">{format(new Date(cc.created_at), "dd.MM.yyyy", { locale: de })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Case Dialog */}
      <Dialog open={newCaseOpen} onOpenChange={setNewCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Neuer Vorgang
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Typ *</Label>
              <Select value={newCaseForm.case_type} onValueChange={v => setNewCaseForm(f => ({ ...f, case_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(caseTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vertragsbezug</Label>
              <Select value={newCaseForm.contract_id || "none"} onValueChange={v => setNewCaseForm(f => ({ ...f, contract_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Kein Bezug" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Bezug</SelectItem>
                  {(contracts as any[]).map(ct => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.contract_number || ct.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Titel</Label>
              <Input placeholder="z.B. Upgrade auf Premium-Paket" value={newCaseForm.title} onChange={e => setNewCaseForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notizen</Label>
              <Textarea rows={3} placeholder="Details zum Vorgang..." value={newCaseForm.notes} onChange={e => setNewCaseForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCaseOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreateCase} disabled={savingCase}>
              {savingCase && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Vorgang anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Customer List ─────────────────────────────────────────────────────
function CustomerList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers" as any)
        .select("*")
        .order("hfx_customer_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contractCounts = {} } = useQuery({
    queryKey: ["customer-contract-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("customer_id, status")
        .not("customer_id", "is", null);
      if (error) throw error;
      const counts: Record<string, { total: number; active: number }> = {};
      for (const c of data || []) {
        if (!c.customer_id) continue;
        if (!counts[c.customer_id]) counts[c.customer_id] = { total: 0, active: 0 };
        counts[c.customer_id].total++;
        if (c.status === "aktiv") counts[c.customer_id].active++;
      }
      return counts;
    },
  });

  const filtered = (customers as any[]).filter(c =>
    !search ||
    c.hfx_customer_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.praxis_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.ort?.toLowerCase().includes(search.toLowerCase()) ||
    `${c.vorname} ${c.nachname}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Suche nach Kundennummer, Praxis, Ort..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {search ? "Keine Kunden gefunden." : "Noch keine Kunden vorhanden."}
            </div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr className="bg-accent/5">
                  <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Kundennr.</th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Praxis / Name</th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">E-Mail</th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Ort</th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 text-center">Verträge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((c: any) => {
                  const cc = (contractCounts as any)[c.id] || { total: 0, active: 0 };
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/kunden/${c.id}`)}
                    >
                      <td className="py-3.5 px-4 font-mono text-xs text-primary font-semibold whitespace-nowrap">
                        {c.hfx_customer_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-foreground leading-tight">{c.praxis_name || `${c.vorname || ""} ${c.nachname || ""}`.trim() || "–"}</p>
                        {c.praxis_name && (c.vorname || c.nachname) && (
                          <p className="text-xs text-muted-foreground">{[c.vorname, c.nachname].filter(Boolean).join(" ")}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-sm text-muted-foreground">{c.email || "–"}</td>
                      <td className="py-3.5 px-4 text-sm text-muted-foreground">{c.ort ? `${c.plz || ""} ${c.ort}`.trim() : "–"}</td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-sm font-semibold">{cc.total}</span>
                          {cc.active > 0 && (
                            <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded-full">{cc.active} aktiv</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────
export default function Kunden() {
  const { id } = useParams<{ id?: string }>();

  return (
    <MainLayout
      title={id ? "Kundendetail" : "Kunden"}
      subtitle={id ? "Stammdaten, Verträge und Vorgänge" : "Kundenstamm – alle Praxen und Vertragspartner"}
    >
      {id ? <CustomerDetail customerId={id} /> : <CustomerList />}
    </MainLayout>
  );
}
