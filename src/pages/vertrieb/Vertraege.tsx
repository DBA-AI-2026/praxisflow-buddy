import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, FileText, MoreHorizontal, Pencil, Trash2, Upload, Download, Loader2, Calendar, PenLine,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import { ContractSigningDialog, type ContractForSigning } from "@/components/contracts/ContractSigningDialog";

const statusConfig: Record<string, { label: string; class: string }> = {
  entwurf: { label: "Entwurf", class: "bg-muted text-muted-foreground" },
  aktiv: { label: "Aktiv", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  gekuendigt: { label: "Gekündigt", class: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  beendet: { label: "Beendet", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

const productOptions = [
  "HFX GOÄ", "HFX EBM", "HFX Benchmark KZV", "HFX Doku",
  "HFX Wingmann", "HFX GOÄ Live-Check", "HFX GOZ Live-Check",
  "HFX Praxismanagement Zahnmedizin",
];

interface ContractFormData {
  customer_name: string;
  sales_partner_name: string;
  mp_nr: string;
  product_name: string;
  
  license_count: number;
  start_date: string;
  duration_months: number;
  cancellation_period_months: number;
  auto_renewal: boolean;
  monthly_price: number;
  one_time_fee: number;
  discount_percent: number;
  payment_interval: string;
  notes: string;
  status: string;
}

const emptyForm: ContractFormData = {
  customer_name: "",
  sales_partner_name: "",
  mp_nr: "",
  product_name: "",
  
  license_count: 1,
  start_date: new Date().toISOString().split("T")[0],
  duration_months: 12,
  cancellation_period_months: 3,
  auto_renewal: true,
  monthly_price: 0,
  one_time_fee: 0,
  discount_percent: 0,
  payment_interval: "monatlich",
  notes: "",
  status: "entwurf",
};

export default function Vertraege() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [signingContract, setSigningContract] = useState<ContractForSigning | null>(null);
  const { user, profile } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const endDate = addMonths(new Date(data.start_date), data.duration_months);
      let documentUrl: string | undefined;
      let documentName: string | undefined;

      // Upload document if provided
      if (file) {
        const filePath = `${user?.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("contracts")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("contracts")
          .getPublicUrl(filePath);
        documentUrl = urlData.publicUrl;
        documentName = file.name;
      }

      const record = {
        customer_name: data.customer_name,
        sales_partner_id: user?.id,
        sales_partner_name: data.sales_partner_name || profile?.full_name || "",
        mp_nr: data.mp_nr || null,
        product_name: data.product_name,
        
        license_count: data.license_count,
        start_date: data.start_date,
        duration_months: data.duration_months,
        end_date: endDate.toISOString().split("T")[0],
        cancellation_period_months: data.cancellation_period_months,
        auto_renewal: data.auto_renewal,
        monthly_price: data.monthly_price,
        one_time_fee: data.one_time_fee,
        discount_percent: data.discount_percent,
        payment_interval: data.payment_interval,
        notes: data.notes || null,
        status: data.status,
        created_by: user?.id,
        ...(documentUrl ? { document_url: documentUrl, document_name: documentName } : {}),
      };

      if (editId) {
        const { error } = await supabase.from("contracts").update(record).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contracts").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      closeDialog();
      toast({ title: editId ? "Vertrag aktualisiert" : "Vertrag erstellt" });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Vertrag gelöscht" });
    },
  });

  const uploadDocument = async (contractId: string, uploadFile: File) => {
    setUploadingId(contractId);
    try {
      const filePath = `${user?.id}/${crypto.randomUUID()}-${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(filePath, uploadFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("contracts")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("contracts")
        .update({ document_url: urlData.publicUrl, document_name: uploadFile.name })
        .eq("id", contractId);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Dokument hochgeladen", description: uploadFile.name });
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
    setFile(null);
  };

  const openEdit = (contract: any) => {
    setEditId(contract.id);
    setForm({
      customer_name: contract.customer_name,
      sales_partner_name: contract.sales_partner_name || "",
      mp_nr: contract.mp_nr || "",
      product_name: contract.product_name,
      
      license_count: contract.license_count,
      start_date: contract.start_date,
      duration_months: contract.duration_months,
      cancellation_period_months: contract.cancellation_period_months,
      auto_renewal: contract.auto_renewal,
      monthly_price: contract.monthly_price,
      one_time_fee: contract.one_time_fee,
      discount_percent: contract.discount_percent,
      payment_interval: contract.payment_interval,
      notes: contract.notes || "",
      status: contract.status,
    });
    setDialogOpen(true);
  };

  const filtered = contracts.filter(
    (c: any) =>
      c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.sales_partner_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate(form);
  };

  const set = (field: keyof ContractFormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <MainLayout title="Vertragserfassung" subtitle="Verträge anlegen und verwalten">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Kunde, Produkt oder Partner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setForm({ ...emptyForm, sales_partner_name: profile?.full_name || "" }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Vertrag
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(["entwurf", "aktiv", "gekuendigt", "beendet"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{statusConfig[s].label}</p>
                <p className="text-2xl font-semibold">{contracts.filter((c: any) => c.status === s).length}</p>
              </div>
              <Badge className={statusConfig[s].class}>{statusConfig[s].label}</Badge>
            </CardContent>
          </Card>
        ))}
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
              Keine Verträge gefunden.
            </div>
          ) : (
            <table className="data-table">
              <thead className="bg-muted/50">
                 <tr>
                   <th>HFX-Nr.</th>
                   <th>Kunde</th>
                   <th>MP-Nr.</th>
                   <th>Produkt</th>
                   <th>Vertriebspartner</th>
                   <th>Laufzeit</th>
                   <th>Monatspreis</th>
                   <th>Status</th>
                   <th>Dokument</th>
                   <th className="w-12"></th>
                 </tr>
              </thead>
              <tbody>
                 {filtered.map((c: any) => (
                   <tr key={c.id}>
                     <td className="text-xs text-muted-foreground font-mono">{c.hfx_customer_number || "–"}</td>
                     <td className="font-medium text-foreground">{c.customer_name}</td>
                     <td className="text-muted-foreground text-sm">{c.mp_nr || "–"}</td>
                    <td className="text-foreground">{c.product_name}</td>
                    <td className="text-muted-foreground">{c.sales_partner_name || "–"}</td>
                    <td className="text-muted-foreground">
                      {c.start_date && format(new Date(c.start_date), "dd.MM.yy", { locale: de })}
                      {" – "}
                      {c.end_date && format(new Date(c.end_date), "dd.MM.yy", { locale: de })}
                      <span className="block text-xs">{c.duration_months} Mon.</span>
                    </td>
                    <td className="font-medium text-foreground">
                      {Number(c.monthly_price).toLocaleString("de-DE")} €
                      {Number(c.discount_percent) > 0 && (
                        <span className="block text-xs text-green-600">-{c.discount_percent}%</span>
                      )}
                    </td>
                    <td>
                      <Badge className={statusConfig[c.status]?.class || ""}>
                        {statusConfig[c.status]?.label || c.status}
                      </Badge>
                    </td>
                    <td>
                      {c.document_url ? (
                        <a href={c.document_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          <span className="truncate max-w-[80px]">{c.document_name || "PDF"}</span>
                        </a>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadDocument(c.id, f);
                              e.target.value = "";
                            }}
                          />
                          {uploadingId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
                              <span>
                                <Upload className="h-3 w-3" />
                                PDF
                              </span>
                            </Button>
                          )}
                        </label>
                      )}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSigningContract(c)}>
                            <PenLine className="h-4 w-4 mr-2" />
                            Unterschreiben
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteMutation.mutate(c.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Löschen
                              </DropdownMenuItem>
                            </>
                          )}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {editId ? "Vertrag bearbeiten" : "Neuen Vertrag erfassen"}
            </DialogTitle>
            <DialogDescription>
              Erfassen Sie alle relevanten Vertragsdetails.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Parteien */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsparteien</h4>
              <div className="grid grid-cols-2 gap-3">
                 <div>
                   <Label>Kunde *</Label>
                   <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} required />
                 </div>
                 <div>
                   <Label>Vertriebspartner</Label>
                   <Input value={form.sales_partner_name} onChange={(e) => set("sales_partner_name", e.target.value)} />
                 </div>
                 <div>
                   <Label>MP-Nummer</Label>
                   <Input value={form.mp_nr} onChange={(e) => set("mp_nr", e.target.value)} placeholder="z.B. MP-12345" />
                 </div>
              </div>
            </div>

            {/* Produkte */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Produkt</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Produkt *</Label>
                  <Select value={form.product_name} onValueChange={(v) => set("product_name", v)}>
                    <SelectTrigger><SelectValue placeholder="Produkt wählen" /></SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lizenzen</Label>
                  <Input type="number" min={1} value={form.license_count} onChange={(e) => set("license_count", Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* Laufzeit */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Laufzeit & Kündigung</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Vertragsbeginn *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
                </div>
                <div>
                  <Label>Laufzeit (Monate)</Label>
                  <Input type="number" min={1} value={form.duration_months} onChange={(e) => set("duration_months", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Kündigungsfrist (Mon.)</Label>
                  <Input type="number" min={0} value={form.cancellation_period_months} onChange={(e) => set("cancellation_period_months", Number(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.auto_renewal} onCheckedChange={(v) => set("auto_renewal", v)} />
                <Label>Automatische Verlängerung</Label>
              </div>
            </div>

            {/* Preise */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preiskonditionen</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monatspreis (€) *</Label>
                  <Input type="number" min={0} step="0.01" value={form.monthly_price} onChange={(e) => set("monthly_price", Number(e.target.value))} required />
                </div>
                <div>
                  <Label>Einmalgebühr (€)</Label>
                  <Input type="number" min={0} step="0.01" value={form.one_time_fee} onChange={(e) => set("one_time_fee", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Rabatt (%)</Label>
                  <Input type="number" min={0} max={100} value={form.discount_percent} onChange={(e) => set("discount_percent", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Zahlungsintervall</Label>
                  <Select value={form.payment_interval} onValueChange={(v) => set("payment_interval", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monatlich">Monatlich</SelectItem>
                      <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                      <SelectItem value="jaehrlich">Jährlich</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Status */}
            {editId && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status</h4>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="gekuendigt">Gekündigt</SelectItem>
                    <SelectItem value="beendet">Beendet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dokument */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsdokument</h4>
              <div className="flex items-center gap-3">
                <Label htmlFor="contract-file" className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent transition-colors text-sm">
                  <Upload className="h-4 w-4" />
                  {file ? file.name : "PDF hochladen"}
                </Label>
                <input
                  id="contract-file"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {/* Notizen */}
            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Zusätzliche Informationen..." />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Abbrechen</Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editId ? "Speichern" : "Vertrag anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Signing Dialog */}
      {signingContract && (
        <ContractSigningDialog
          open={!!signingContract}
          onOpenChange={(open) => { if (!open) setSigningContract(null); }}
          contract={signingContract}
        />
      )}
    </MainLayout>
  );
}
