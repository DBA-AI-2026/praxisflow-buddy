import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Loader2, MapPin } from "lucide-react";

interface PlzMapping {
  id: string;
  plz_prefix: string;
  gebietsleiter_id: string | null;
  gebietsleiter_name: string;
  notes: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
  email: string | null;
}

const emptyForm = {
  plz_prefix: "",
  gebietsleiter_id: "",
  gebietsleiter_name: "",
  notes: "",
  priority: 0,
  is_active: true,
};

export default function PlzMapping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<PlzMapping | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["plz-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plz_gebietsleiter_mapping")
        .select("*")
        .order("plz_prefix", { ascending: true });
      if (error) throw error;
      return data as PlzMapping[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["gebietsleiter-profiles"],
    queryFn: async () => {
    // Get users with roles that can be Gebietsleiter (user, sales_partner, sales_lead, regional_lead)
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["user", "sales_partner", "sales_lead", "regional_lead"]);
      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profs, error: profError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds)
        .order("full_name");
      if (profError) throw profError;
      return profs as Profile[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: typeof emptyForm & { id?: string }) => {
      const payload = {
        plz_prefix: values.plz_prefix.trim(),
        gebietsleiter_id: values.gebietsleiter_id || null,
        gebietsleiter_name: values.gebietsleiter_name.trim(),
        notes: values.notes?.trim() || null,
        priority: Number(values.priority),
        is_active: values.is_active,
      };
      if (values.id) {
        const { error } = await supabase
          .from("plz_gebietsleiter_mapping")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("plz_gebietsleiter_mapping")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plz-mappings"] });
      toast({ title: editEntry ? "Eintrag aktualisiert" : "Eintrag erstellt" });
      handleCloseDialog();
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("plz_gebietsleiter_mapping")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plz-mappings"] });
      toast({ title: "Eintrag gelöscht" });
      setDeleteId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditEntry(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (entry: PlzMapping) => {
    setEditEntry(entry);
    setForm({
      plz_prefix: entry.plz_prefix,
      gebietsleiter_id: entry.gebietsleiter_id || "",
      gebietsleiter_name: entry.gebietsleiter_name,
      notes: entry.notes || "",
      priority: entry.priority,
      is_active: entry.is_active,
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditEntry(null);
    setForm(emptyForm);
  };

  const handleGlSelect = (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);
    setForm((f) => ({
      ...f,
      gebietsleiter_id: userId,
      gebietsleiter_name: profile?.full_name || f.gebietsleiter_name,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.plz_prefix || !form.gebietsleiter_name) return;
    upsertMutation.mutate(editEntry ? { ...form, id: editEntry.id } : form);
  };

  const filtered = mappings.filter(
    (m) =>
      m.plz_prefix.includes(search) ||
      m.gebietsleiter_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.notes?.toLowerCase() || "").includes(search.toLowerCase())
  );

  return (
    <MainLayout title="PLZ-Gebietsleiter-Zuordnung" subtitle="Automatische Lead-Zuweisung nach Postleitzahl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">PLZ-Gebietsleiter-Zuordnung</h1>
              <p className="text-sm text-muted-foreground">
                Zuordnung von Postleitzahl-Präfixen zu Gebietsleitern für automatische Lead-Zuweisung
              </p>
            </div>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Zuordnung
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">{mappings.length}</span>
            <span className="text-sm text-muted-foreground">Einträge gesamt</span>
          </div>
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">{mappings.filter((m) => m.is_active).length}</span>
            <span className="text-sm text-muted-foreground">Aktiv</span>
          </div>
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-2">
            <span className="text-2xl font-bold">{new Set(mappings.map((m) => m.gebietsleiter_name)).size}</span>
            <span className="text-sm text-muted-foreground">Gebietsleiter zugeordnet</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Suche nach PLZ, Gebietsleiter oder Notiz..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">PLZ-Präfix</TableHead>
                  <TableHead>Gebietsleiter</TableHead>
                  <TableHead className="w-16 text-center">Priorität</TableHead>
                  <TableHead>Notizen</TableHead>
                  <TableHead className="w-20 text-center">Status</TableHead>
                  <TableHead className="w-24 text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                      Keine Einträge gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-base font-bold">
                          {entry.plz_prefix}*
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.gebietsleiter_name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={entry.priority > 0 ? "default" : "secondary"}>
                          {entry.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.notes || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.is_active ? (
                          <Badge variant="outline" className="border-primary/30 text-primary">Aktiv</Badge>
                        ) : (
                          <Badge variant="secondary">Inaktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(entry)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? "Zuordnung bearbeiten" : "Neue Zuordnung anlegen"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plz_prefix">PLZ-Präfix *</Label>
              <Input
                id="plz_prefix"
                value={form.plz_prefix}
                onChange={(e) => setForm((f) => ({ ...f, plz_prefix: e.target.value }))}
                placeholder="z.B. 44 oder 8"
                required
              />
              <p className="text-xs text-muted-foreground">
                Die ersten Ziffern der PLZ — z.B. „44" deckt alle PLZ ab, die mit 44 beginnen.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Gebietsleiter *</Label>
              <Select value={form.gebietsleiter_id} onValueChange={handleGlSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Gebietsleiter auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gebietsleiter_name">Name (manuell) *</Label>
              <Input
                id="gebietsleiter_name"
                value={form.gebietsleiter_name}
                onChange={(e) => setForm((f) => ({ ...f, gebietsleiter_name: e.target.value }))}
                placeholder="Wird automatisch aus Auswahl befüllt"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priorität</Label>
              <Input
                id="priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                min={0}
                max={100}
              />
              <p className="text-xs text-muted-foreground">
                Bei überlappenden PLZ-Präfixen gewinnt der Eintrag mit der höchsten Priorität.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="z.B. medas only, KN = Konstanz"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="is_active">Aktiv</Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editEntry ? "Speichern" : "Erstellen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Zuordnung wird dauerhaft gelöscht. Neue Leads aus diesem PLZ-Bereich werden nicht mehr automatisch zugewiesen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
