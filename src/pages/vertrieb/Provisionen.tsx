import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Euro, TrendingUp, Users, Calendar, Settings, Plus, Pencil, Trash2, Loader2, Percent, CalendarDays } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type CommissionType = "prozent" | "festbetrag" | "monatlich";

interface ProductCommission {
  id: string;
  product_name: string;
  commission_type: CommissionType;
  commission_value: number;
  description: string | null;
  is_active: boolean;
}

const typeLabels: Record<CommissionType, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "Festbetrag / Abschluss",
  monatlich: "€ / Monat",
};

const typeIcons: Record<CommissionType, React.ReactNode> = {
  prozent: <Percent className="h-4 w-4" />,
  festbetrag: <Euro className="h-4 w-4" />,
  monatlich: <CalendarDays className="h-4 w-4" />,
};

const formatValue = (type: CommissionType, value: number) => {
  if (type === "prozent") return `${value}%`;
  return `${value.toFixed(2)} €`;
};

// Mock data for the provision overview (kept from original)
const provisionenData = [
  { id: 1, partner: "Max Mustermann", praxis: "Praxis Dr. Schmidt", produkt: "HFX GOÄ", datum: "2024-01-15", betrag: 250.00, status: "ausgezahlt" },
  { id: 2, partner: "Anna Meyer", praxis: "Zahnarztpraxis Müller", produkt: "HFX GOZ Live-Check", datum: "2024-01-18", betrag: 180.00, status: "ausstehend" },
  { id: 3, partner: "Max Mustermann", praxis: "MVZ Gesundheit", produkt: "HFX EBM", datum: "2024-01-20", betrag: 320.00, status: "ausstehend" },
  { id: 4, partner: "Thomas Weber", praxis: "Praxis am Park", produkt: "HFX Doku", datum: "2024-01-22", betrag: 150.00, status: "ausgezahlt" },
];

const Provisionen = () => {
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductCommission | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<ProductCommission | null>(null);
  const [form, setForm] = useState({
    product_name: "",
    commission_type: "prozent" as CommissionType,
    commission_value: 0,
    description: "",
    is_active: true,
  });

  // Fetch commission rates
  const { data: commissions = [], isLoading: commissionsLoading } = useQuery({
    queryKey: ["product-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_commissions")
        .select("*")
        .order("product_name");
      if (error) throw error;
      return data as ProductCommission[];
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("product_commissions")
          .update({
            product_name: data.product_name,
            commission_type: data.commission_type,
            commission_value: data.commission_value,
            description: data.description || null,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_commissions")
          .insert({
            product_name: data.product_name,
            commission_type: data.commission_type,
            commission_value: data.commission_value,
            description: data.description || null,
            is_active: data.is_active,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-commissions"] });
      setDialogOpen(false);
      toast({ title: "Gespeichert", description: "Provisionssatz wurde gespeichert." });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-commissions"] });
      setDeleteDialogOpen(false);
      toast({ title: "Gelöscht", description: "Provisionssatz wurde entfernt." });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm({ product_name: "", commission_type: "prozent", commission_value: 0, description: "", is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (item: ProductCommission) => {
    setEditingItem(item);
    setForm({
      product_name: item.product_name,
      commission_type: item.commission_type as CommissionType,
      commission_value: item.commission_value,
      description: item.description || "",
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ ...form, id: editingItem?.id });
  };

  // Stats from mock data
  const totalProvisionen = provisionenData.reduce((sum, p) => sum + p.betrag, 0);
  const ausstehend = provisionenData.filter(p => p.status === "ausstehend").reduce((sum, p) => sum + p.betrag, 0);
  const ausgezahlt = provisionenData.filter(p => p.status === "ausgezahlt").reduce((sum, p) => sum + p.betrag, 0);
  const partnerCount = new Set(provisionenData.map(p => p.partner)).size;

  return (
    <MainLayout title="Provisionen" subtitle="Übersicht aller Vertriebsprovisionen">
      <div className="space-y-6">

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Provisionen</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProvisionen.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Alle Provisionen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ausstehend</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{ausstehend.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Noch nicht ausgezahlt</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ausgezahlt</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{ausgezahlt.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Bereits überwiesen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktive Partner</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{partnerCount}</div>
              <p className="text-xs text-muted-foreground">Mit Provisionen</p>
            </CardContent>
          </Card>
        </div>

        {/* Commission Rates per Product (Admin-only editing) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Provisionssätze pro Produkt
              </CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Legen Sie die Provisionssätze für jedes Produkt fest"
                  : "Übersicht der aktuellen Provisionssätze"}
              </CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Neues Produkt
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {commissionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : commissions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Keine Provisionssätze konfiguriert.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Provisionsmodell</TableHead>
                    <TableHead>Satz</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Aktionen</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.product_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {typeIcons[c.commission_type as CommissionType]}
                          <span className="text-sm">{typeLabels[c.commission_type as CommissionType]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatValue(c.commission_type as CommissionType, c.commission_value)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.description || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={c.is_active
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-muted text-muted-foreground"}
                        >
                          {c.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDeletingItem(c); setDeleteDialogOpen(true); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Provisionen Table */}
        <Card>
          <CardHeader>
            <CardTitle>Provisionsübersicht</CardTitle>
            <CardDescription>Alle erfassten Vertriebsprovisionen</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Praxis</TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provisionenData.map((provision) => (
                  <TableRow key={provision.id}>
                    <TableCell className="font-medium">{provision.partner}</TableCell>
                    <TableCell>{provision.praxis}</TableCell>
                    <TableCell>{provision.produkt}</TableCell>
                    <TableCell>{new Date(provision.datum).toLocaleDateString("de-DE")}</TableCell>
                    <TableCell className="text-right font-medium">{provision.betrag.toFixed(2)} €</TableCell>
                    <TableCell>
                      <Badge
                        variant={provision.status === "ausgezahlt" ? "default" : "secondary"}
                        className={provision.status === "ausgezahlt"
                          ? "bg-green-100 text-green-800 hover:bg-green-100"
                          : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                        }
                      >
                        {provision.status === "ausgezahlt" ? "Ausgezahlt" : "Ausstehend"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Provisionssatz bearbeiten" : "Neuer Provisionssatz"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Passen Sie den Provisionssatz für dieses Produkt an." : "Erstellen Sie einen neuen Provisionssatz für ein Produkt."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="product_name">Produktname</Label>
              <Input
                id="product_name"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                placeholder="z.B. HFX GOÄ"
              />
            </div>
            <div className="grid gap-2">
              <Label>Provisionsmodell</Label>
              <Select value={form.commission_type} onValueChange={(v) => setForm({ ...form, commission_type: v as CommissionType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prozent">% vom Umsatz</SelectItem>
                  <SelectItem value="festbetrag">Festbetrag pro Abschluss</SelectItem>
                  <SelectItem value="monatlich">Euro / Monat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commission_value">
                {form.commission_type === "prozent" ? "Prozentsatz (%)" : "Betrag (€)"}
              </Label>
              <Input
                id="commission_value"
                type="number"
                min={0}
                step={form.commission_type === "prozent" ? 0.5 : 1}
                value={form.commission_value}
                onChange={(e) => setForm({ ...form, commission_value: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Beschreibung (optional)</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kurze Beschreibung"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label>Aktiv</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || !form.product_name}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingItem ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Provisionssatz löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie den Provisionssatz für „{deletingItem?.product_name}" wirklich löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Abbrechen</Button>
            <Button
              variant="destructive"
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Provisionen;
