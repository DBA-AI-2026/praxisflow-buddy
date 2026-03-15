import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Package, ChevronDown, ChevronRight, Upload, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ProductModulesSection } from "@/components/admin/ProductModulesSection";
import { AgbUploadSection } from "@/components/admin/AgbUploadSection";

interface ProductForm {
  name: string;
  monthly_price: number;
  one_time_fee: number;
  price_per_unit: number | null;
  price_per_unit_label: string;
  price_per_unit_3m: number | null;
  price_per_unit_6m: number | null;
  price_per_unit_12m: number | null;
  promo_price: number | null;
  promo_price_label: string;
  promo_end_date: string;
  promo_base_fee_end_date: string;
  description: string;
  is_active: boolean;
  licensing_notes: string;
  extra_unit_price: number | null;
  extra_unit_label: string;
}

const emptyForm: ProductForm = {
  name: "",
  monthly_price: 0,
  one_time_fee: 0,
  price_per_unit: null,
  price_per_unit_label: "",
  price_per_unit_3m: null,
  price_per_unit_6m: null,
  price_per_unit_12m: null,
  promo_price: null,
  promo_price_label: "",
  promo_end_date: "",
  promo_base_fee_end_date: "",
  description: "",
  is_active: true,
  licensing_notes: "",
  extra_unit_price: null,
  extra_unit_label: "",
};

export default function AdminProducts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const payload = {
        ...data,
        price_per_unit: data.price_per_unit || null,
        price_per_unit_label: data.price_per_unit_label || null,
        price_per_unit_3m: data.price_per_unit_3m || null,
        price_per_unit_6m: data.price_per_unit_6m || null,
        price_per_unit_12m: data.price_per_unit_12m || null,
        promo_price: data.promo_price || null,
        promo_price_label: data.promo_price_label || null,
        promo_end_date: data.promo_end_date || null,
        promo_base_fee_end_date: data.promo_base_fee_end_date || null,
        licensing_notes: data.licensing_notes || null,
        extra_unit_price: data.extra_unit_price || null,
        extra_unit_label: data.extra_unit_label || null,
      };
      if (editId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeDialog();
      toast({ title: editId ? "Produkt aktualisiert" : "Produkt erstellt" });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Produkt gelöscht" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openEdit = (product: any) => {
    setEditId(product.id);
    setForm({
      name: product.name,
      monthly_price: product.monthly_price,
      one_time_fee: product.one_time_fee,
      price_per_unit: product.price_per_unit ?? null,
      price_per_unit_label: product.price_per_unit_label || "",
      price_per_unit_3m: product.price_per_unit_3m ?? null,
      price_per_unit_6m: product.price_per_unit_6m ?? null,
      price_per_unit_12m: product.price_per_unit_12m ?? null,
      promo_price: product.promo_price ?? null,
      promo_price_label: product.promo_price_label || "",
      promo_end_date: product.promo_end_date || "",
      promo_base_fee_end_date: product.promo_base_fee_end_date || "",
      description: product.description || "",
      is_active: product.is_active,
      licensing_notes: product.licensing_notes || "",
      extra_unit_price: product.extra_unit_price ?? null,
      extra_unit_label: product.extra_unit_label || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate(form);
  };

  const set = (field: keyof ProductForm, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const activeCount = products.filter((p: any) => p.is_active).length;

  const formatPrice = (val: number | null | undefined) =>
    val != null ? `${Number(val).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "–";

  return (
    <MainLayout title="Produktverwaltung" subtitle="Produkte und Preise verwalten">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Aktive Produkte</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Produkt
        </Button>
      </div>

      <div className="card-elevated overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Monatspreis</TableHead>
                <TableHead>Einmalgebühr</TableHead>
                <TableHead>Stückpreis</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p: any) => (
                <>
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {expandedId === p.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div>
                          <span className="font-medium">{p.name}</span>
                          {p.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-[250px] truncate">{p.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatPrice(p.monthly_price)}</TableCell>
                    <TableCell>{formatPrice(p.one_time_fee)}</TableCell>
                    <TableCell>
                      {p.price_per_unit != null ? (
                        <div>
                          <span>{formatPrice(p.price_per_unit)}/{p.price_per_unit_label || "Stk."}</span>
                          {(p.price_per_unit_3m != null || p.price_per_unit_6m != null || p.price_per_unit_12m != null) && (
                            <p className="text-xs text-muted-foreground">
                              {p.price_per_unit_3m != null && `3M: ${formatPrice(p.price_per_unit_3m)} `}
                              {p.price_per_unit_6m != null && `6M: ${formatPrice(p.price_per_unit_6m)} `}
                              {p.price_per_unit_12m != null && `12M: ${formatPrice(p.price_per_unit_12m)}`}
                            </p>
                          )}
                        </div>
                      ) : "–"}
                    </TableCell>
                    <TableCell>
                      {p.promo_price != null ? (
                        <div>
                          <span className="text-green-600 dark:text-green-400 font-medium">{formatPrice(p.promo_price)}</span>
                          {p.promo_price_label && (
                            <p className="text-xs text-muted-foreground max-w-[200px] truncate">{p.promo_price_label}</p>
                          )}
                          {p.promo_end_date && (
                            <p className="text-xs text-muted-foreground">Abschluss bis {new Date(p.promo_end_date).toLocaleDateString("de-DE")}</p>
                          )}
                          {p.promo_base_fee_end_date && (
                            <p className="text-xs text-muted-foreground">Grundgebühr frei bis {new Date(p.promo_base_fee_end_date).toLocaleDateString("de-DE")}</p>
                          )}
                        </div>
                      ) : "–"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === p.id && (
                    <TableRow key={`${p.id}-details`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-4">
                        <div className="space-y-4">
                          {/* Licensing info */}
                          {p.licensing_notes && (
                            <div className="rounded-md border p-3 bg-background">
                              <h4 className="text-sm font-medium mb-1">Lizenzmodell</h4>
                              <p className="text-sm text-muted-foreground">{p.licensing_notes}</p>
                              {p.extra_unit_price != null && (
                                <p className="text-sm mt-1">
                                  <span className="font-medium">{formatPrice(p.extra_unit_price)}</span>{" "}
                                  <span className="text-muted-foreground">{p.extra_unit_label}</span>
                                </p>
                              )}
                            </div>
                          )}
                          {/* AGB PDF */}
                          <AgbUploadSection productId={p.id} currentPath={p.agb_pdf_path} onUploaded={() => queryClient.invalidateQueries({ queryKey: ["products"] })} />
                          {/* Modules */}
                          <ProductModulesSection productId={p.id} productName={p.name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
          </DialogHeader>
          <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Produktname *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="z.B. HFX GOÄ" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monatspreis (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.monthly_price} onChange={(e) => set("monthly_price", Number(e.target.value))} />
              </div>
              <div>
                <Label>Einmalgebühr (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.one_time_fee} onChange={(e) => set("one_time_fee", Number(e.target.value))} />
              </div>
            </div>

            {/* Stückpreis */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stückpreis (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.price_per_unit ?? ""} onChange={(e) => set("price_per_unit", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 1,20" />
              </div>
              <div>
                <Label>Stückpreis-Label</Label>
                <Input value={form.price_per_unit_label} onChange={(e) => set("price_per_unit_label", e.target.value)} placeholder="z.B. pro geprüfter Rechnung" />
              </div>
            </div>

            {/* Laufzeitabhängige Preise */}
            {form.price_per_unit != null && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Laufzeitabhängige Stückpreise (optional)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>3 Monate (€)</Label>
                    <Input type="number" min={0} step="0.01" value={form.price_per_unit_3m ?? ""} onChange={(e) => set("price_per_unit_3m", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 159" />
                  </div>
                  <div>
                    <Label>6 Monate (€)</Label>
                    <Input type="number" min={0} step="0.01" value={form.price_per_unit_6m ?? ""} onChange={(e) => set("price_per_unit_6m", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 149" />
                  </div>
                  <div>
                    <Label>12 Monate (€)</Label>
                    <Input type="number" min={0} step="0.01" value={form.price_per_unit_12m ?? ""} onChange={(e) => set("price_per_unit_12m", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 139" />
                  </div>
                </div>
              </div>
            )}

            {/* Aktionspreis */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aktionspreis (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.promo_price ?? ""} onChange={(e) => set("promo_price", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 0,99" />
              </div>
              <div>
                <Label>Aktions-Label</Label>
                <Input value={form.promo_price_label} onChange={(e) => set("promo_price_label", e.target.value)} placeholder="z.B. Beschreibung der Aktion" />
              </div>
              <div>
                <Label>Abschluss-Deadline</Label>
                <Input type="date" value={form.promo_end_date} onChange={(e) => set("promo_end_date", e.target.value)} />
              </div>
              <div>
                <Label>Grundgebühr-Befreiung bis</Label>
                <Input type="date" value={form.promo_base_fee_end_date} onChange={(e) => set("promo_base_fee_end_date", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Beschreibung</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Optionale Beschreibung..." />
            </div>

            {/* Lizenzmodell */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Lizenzmodell (optional)</Label>
              <div>
                <Label>Lizenz-Hinweise</Label>
                <Textarea value={form.licensing_notes} onChange={(e) => set("licensing_notes", e.target.value)} rows={2} placeholder="z.B. 1 BSNR + 3 LANR inkl." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Zusatzpreis (€)</Label>
                  <Input type="number" min={0} step="0.01" value={form.extra_unit_price ?? ""} onChange={(e) => set("extra_unit_price", e.target.value ? Number(e.target.value) : null)} placeholder="z.B. 22" />
                </div>
                <div>
                  <Label>Zusatz-Label</Label>
                  <Input value={form.extra_unit_label} onChange={(e) => set("extra_unit_label", e.target.value)} placeholder="z.B. pro zusätzl. LANR" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Aktiv</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Abbrechen</Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editId ? "Speichern" : "Erstellen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
