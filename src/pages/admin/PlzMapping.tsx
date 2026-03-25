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
import { Plus, Pencil, Trash2, Loader2, MapPin, Search, Users, CheckCircle2, Map } from "lucide-react";

interface PlzMapping {
  id: string;
  plz_prefix: string;
  plz_von: string | null;
  plz_bis: string | null;
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

// Stable color palette per RL (cycles through accent hues)
const RL_COLORS = [
  "bg-primary/10 text-primary border-primary/20",
  "bg-secondary text-secondary-foreground border-border",
  "bg-accent text-accent-foreground border-accent",
  "bg-muted text-muted-foreground border-border",
];

function getRlColor(_name: string, index: number) {
  return RL_COLORS[index % RL_COLORS.length];
}

export default function PlzMapping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<PlzMapping | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterRl, setFilterRl] = useState<string>("all");

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

  // Map: gebietsleiter_id -> regional lead name
  const { data: rlNameByGlId = {} } = useQuery({
    queryKey: ["plz-rl-assignments"],
    queryFn: async () => {
      const { data: assignments, error: aErr } = await supabase
        .from("user_regional_assignments")
        .select("user_id, regional_lead_id");
      if (aErr) throw aErr;
      if (!assignments || assignments.length === 0) return {};

      const rlIds = [...new Set(assignments.map((a) => a.regional_lead_id))];
      const { data: rlProfiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", rlIds);
      if (pErr) throw pErr;

      const rlNameById: Record<string, string> = {};
      (rlProfiles || []).forEach((p) => { rlNameById[p.user_id] = p.full_name; });

      const map: Record<string, string> = {};
      assignments.forEach((a) => {
        map[a.user_id] = rlNameById[a.regional_lead_id] || "—";
      });
      return map;
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

  // Unique RL names for filter tabs
  const rlNames = [...new Set(
    mappings
      .map((m) => m.gebietsleiter_id ? rlNameByGlId[m.gebietsleiter_id] : null)
      .filter(Boolean) as string[]
  )].sort();

  // Color index per RL name
  const rlColorIndex: Record<string, number> = {};
  rlNames.forEach((name, i) => { rlColorIndex[name] = i; });

  const filtered = mappings.filter((m) => {
    const rlName = m.gebietsleiter_id ? (rlNameByGlId[m.gebietsleiter_id] || "") : "";
    const matchesSearch =
      m.plz_prefix.includes(search) ||
      m.gebietsleiter_name.toLowerCase().includes(search.toLowerCase()) ||
      rlName.toLowerCase().includes(search.toLowerCase()) ||
      (m.notes?.toLowerCase() || "").includes(search.toLowerCase());
    const matchesRl = filterRl === "all" || rlName === filterRl || (filterRl === "none" && !rlName);
    return matchesSearch && matchesRl;
  });

  const activeCount = mappings.filter((m) => m.is_active).length;
  const glCount = new Set(mappings.map((m) => m.gebietsleiter_name)).size;

  return (
    <MainLayout title="PLZ-Gebietsleiter-Zuordnung" subtitle="Automatische Lead-Zuweisung nach Postleitzahl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">PLZ-Gebietsleiter-Zuordnung</h1>
              <p className="text-sm text-muted-foreground">
                Automatische Lead-Zuweisung nach Postleitzahl-Präfix
              </p>
            </div>
          </div>
          <Button onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Neue Zuordnung
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-3">
            <Map className="h-8 w-8 text-primary/70 shrink-0" />
            <div>
              <p className="text-2xl font-bold leading-none">{mappings.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">PLZ-Einträge</p>
            </div>
          </div>
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary/60 shrink-0" />
            <div>
              <p className="text-2xl font-bold leading-none">{activeCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Aktiv</p>
            </div>
          </div>
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-3">
            <Users className="h-8 w-8 text-muted-foreground/60 shrink-0" />
            <div>
              <p className="text-2xl font-bold leading-none">{glCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Gebietsleiter</p>
            </div>
          </div>
        </div>

        {/* Search + RL Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suche PLZ, Gebietsleiter, Regionalleiter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              variant={filterRl === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterRl("all")}
              className="h-9"
            >
              Alle
            </Button>
            {rlNames.map((name, i) => (
              <Button
                key={name}
                variant={filterRl === name ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterRl(filterRl === name ? "all" : name)}
                className="h-9"
              >
                {name}
              </Button>
            ))}
            {mappings.some((m) => !m.gebietsleiter_id || !rlNameByGlId[m.gebietsleiter_id!]) && (
              <Button
                variant={filterRl === "none" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterRl(filterRl === "none" ? "all" : "none")}
                className="h-9"
              >
                Kein RL
              </Button>
            )}
          </div>
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
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28 font-semibold">PLZ-Präfix</TableHead>
                  <TableHead className="font-semibold">Gebietsleiter</TableHead>
                  <TableHead className="font-semibold">Regionalleiter</TableHead>
                  <TableHead className="w-24 font-semibold">Notizen</TableHead>
                  <TableHead className="w-16 text-center font-semibold">Prio</TableHead>
                  <TableHead className="w-20 text-center font-semibold">Status</TableHead>
                  <TableHead className="w-20 text-right font-semibold">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Keine Einträge gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((entry) => {
                    const rlName = entry.gebietsleiter_id
                      ? (rlNameByGlId[entry.gebietsleiter_id] || null)
                      : null;
                    const colorClass = rlName ? getRlColor(rlName, rlColorIndex[rlName] ?? 0) : "";
                    return (
                      <TableRow key={entry.id} className={!entry.is_active ? "opacity-50" : ""}>
                        <TableCell>
                          <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded">
                            {entry.plz_prefix}*
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{entry.gebietsleiter_name}</TableCell>
                        <TableCell>
                          {rlName ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
                              {rlName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                          {entry.notes || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.priority > 0 ? (
                            <Badge variant="secondary" className="text-xs">{entry.priority}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.is_active ? (
                            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                              Aktiv
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Inaktiv
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleOpenEdit(entry)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {filtered.length} von {mappings.length} Einträgen
          </p>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? "Zuordnung bearbeiten" : "Neue Zuordnung anlegen"}
            </DialogTitle>
          </DialogHeader>
          <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plz_prefix">PLZ-Präfix *</Label>
                <Input
                  id="plz_prefix"
                  value={form.plz_prefix}
                  onChange={(e) => setForm((f) => ({ ...f, plz_prefix: e.target.value }))}
                  placeholder="z.B. 44 oder 8"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Präfix deckt alle PLZ mit diesem Anfang ab.
                </p>
              </div>
              <div className="space-y-1.5">
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
                  Höhere Zahl = höhere Priorität bei Überlappung.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
              <Label htmlFor="gebietsleiter_name">Name (manuell überschreiben)</Label>
              <Input
                id="gebietsleiter_name"
                value={form.gebietsleiter_name}
                onChange={(e) => setForm((f) => ({ ...f, gebietsleiter_name: e.target.value }))}
                placeholder="Wird automatisch aus Auswahl befüllt"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notizen</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="z.B. medas only, KN = Konstanz"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
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
