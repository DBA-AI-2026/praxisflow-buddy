import { useState } from "react";
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
import { Plus, Pencil, Trash2, Loader2, Puzzle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ModuleForm {
  name: string;
  description: string;
  monthly_price: number;
  sort_order: number;
  is_active: boolean;
}

const emptyModule: ModuleForm = {
  name: "",
  description: "",
  monthly_price: 0,
  sort_order: 0,
  is_active: true,
};

interface Props {
  productId: string;
  productName: string;
}

export function ProductModulesSection({ productId, productName }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ModuleForm>(emptyModule);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["product-modules", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_modules")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: ModuleForm) => {
      const payload = { ...data, product_id: productId, description: data.description || null };
      if (editId) {
        const { error } = await supabase.from("product_modules").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_modules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-modules", productId] });
      closeDialog();
      toast({ title: editId ? "Modul aktualisiert" : "Modul erstellt" });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-modules", productId] });
      toast({ title: "Modul gelöscht" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyModule);
  };

  const openEdit = (mod: any) => {
    setEditId(mod.id);
    setForm({
      name: mod.name,
      description: mod.description || "",
      monthly_price: mod.monthly_price,
      sort_order: mod.sort_order,
      is_active: mod.is_active,
    });
    setDialogOpen(true);
  };

  const formatPrice = (val: number) =>
    `${Number(val).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-primary" />
          Zusatzmodule für {productName}
        </h3>
        <Button size="sm" variant="outline" onClick={() => { setForm(emptyModule); setDialogOpen(true); }}>
          <Plus className="h-3 w-3 mr-1" /> Modul
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Module konfiguriert.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modul</TableHead>
              <TableHead>Preis/Monat</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{m.name}</span>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-[350px] line-clamp-2">{m.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>{formatPrice(m.monthly_price)}</TableCell>
                <TableCell>
                  <Badge variant={m.is_active ? "default" : "secondary"}>
                    {m.is_active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(m.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Modul bearbeiten" : "Neues Modul"}</DialogTitle>
          </DialogHeader>
          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); upsertMutation.mutate(form); }} className="space-y-4">
            <div>
              <Label>Modulname *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monatspreis (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.monthly_price} onChange={(e) => setForm(f => ({ ...f, monthly_price: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Reihenfolge</Label>
                <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
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
    </div>
  );
}
