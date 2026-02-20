import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, Plus, Loader2, FlaskConical, ArrowUpRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const statusConfig: Record<string, { label: string; color: string }> = {
  testphase: { label: "Testphase", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  abgelaufen: { label: "Abgelaufen", color: "bg-red-500/10 text-red-700 border-red-500/20" },
  konvertiert: { label: "Konvertiert", color: "bg-green-500/10 text-green-700 border-green-500/20" },
  abgebrochen: { label: "Abgebrochen", color: "bg-muted text-muted-foreground" },
};

export default function DemoTracking() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", contact_name: "", email: "", telefon: "", product_name: "", notes: "" });
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: demos = [], isLoading } = useQuery({
    queryKey: ["demo-downloads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demo_downloads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const testEnd = new Date();
      testEnd.setDate(testEnd.getDate() + 14);
      const { error } = await supabase.from("demo_downloads").insert({
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        telefon: form.telefon || null,
        product_name: form.product_name || null,
        notes: form.notes || null,
        created_by: user?.id,
        test_phase_end: testEnd.toISOString().split("T")[0],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-downloads"] });
      setCreateOpen(false);
      setForm({ company_name: "", contact_name: "", email: "", telefon: "", product_name: "", notes: "" });
      toast({ title: "Demo-Eintrag erstellt", description: "Der Interessent wurde erfasst." });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const filtered = demos.filter((d: any) => {
    const matchSearch =
      d.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.hfx_customer_number?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "alle" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const testphaseCount = demos.filter((d: any) => d.status === "testphase").length;
  const konvertiertCount = demos.filter((d: any) => d.status === "konvertiert").length;

  return (
    <MainLayout title="Demo-Tracking" subtitle="Interessenten und Testphasen verwalten">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-amber-500/10">
              <FlaskConical className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aktive Testphasen</p>
              <p className="text-2xl font-semibold text-foreground">{testphaseCount}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-green-500/10">
              <ArrowUpRight className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Konvertiert</p>
              <p className="text-2xl font-semibold text-foreground">{konvertiertCount}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-primary/10">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gesamt</p>
              <p className="text-2xl font-semibold text-foreground">{demos.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="flex gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Suche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="testphase">Testphase</SelectItem>
              <SelectItem value="konvertiert">Konvertiert</SelectItem>
              <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
              <SelectItem value="abgebrochen">Abgebrochen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Eintrag
        </Button>
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
              Keine Demo-Einträge gefunden.
            </div>
          ) : (
            <table className="data-table">
              <thead className="bg-muted/50">
                <tr>
                  <th>HFX-Nr.</th>
                  <th>Unternehmen</th>
                  <th>Kontakt</th>
                  <th>Produkt</th>
                  <th>Status</th>
                  <th>Testende</th>
                  <th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: any) => {
                  const cfg = statusConfig[d.status] || statusConfig.testphase;
                  return (
                    <tr key={d.id}>
                      <td className="font-mono text-xs">{d.hfx_customer_number || "–"}</td>
                      <td className="font-medium text-foreground">{d.company_name}</td>
                      <td>
                        <div>
                          <span className="text-foreground">{d.contact_name || "–"}</span>
                          {d.email && <span className="block text-xs text-muted-foreground">{d.email}</span>}
                        </div>
                      </td>
                      <td className="text-muted-foreground">{d.product_name || "–"}</td>
                      <td>
                        <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                      </td>
                      <td className="text-muted-foreground">
                        {d.test_phase_end ? format(new Date(d.test_phase_end), "dd.MM.yyyy", { locale: de }) : "–"}
                      </td>
                      <td className="text-muted-foreground">
                        {format(new Date(d.created_at), "dd.MM.yyyy", { locale: de })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Demo-Eintrag erstellen</DialogTitle>
            <DialogDescription>Erfassen Sie einen neuen Interessenten in der Testphase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Unternehmen / Praxis *</Label>
              <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} placeholder="Praxis Dr. Müller" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ansprechpartner</Label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Max Müller" />
              </div>
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="max@praxis.de" type="email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input value={form.telefon} onChange={(e) => setForm((f) => ({ ...f, telefon: e.target.value }))} placeholder="030 12345" />
              </div>
              <div className="space-y-2">
                <Label>Produkt</Label>
                <Input value={form.product_name} onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))} placeholder="HFX GOÄ" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notizen</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Zusätzliche Informationen..." />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.company_name || createMutation.isPending}>
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird erstellt...</> : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
