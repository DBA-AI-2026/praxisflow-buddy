import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Users, Percent, Euro, CalendarDays, Check, ChevronsUpDown, Star, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

type ProvisionsTyp = "prozent" | "festbetrag" | "monatlich";
type VertrieblertypHaupt = "hauptvertriebler";
type NebenvertrieblertypTyp = "leadbringer" | "leadquelle" | "kooperationspartner" | "tippgeber";
type Vertrieblerkategorie = "hauptvertriebler" | "nebenvertriebler";

const KOOPERATIONSPARTNER_OPTIONEN = [
  "Abrechnungszentrum",
  "Ärztenetz",
  "Berufsverband",
  "Fortbildungsinstitut",
  "IT-Dienstleister",
  "Kassenärztliche Vereinigung",
  "Krankenkasse",
  "Medizintechnik-Anbieter",
  "Pharmaunternehmen",
  "Praxisberater",
  "Softwareanbieter",
  "Steuerberater",
  "Unternehmensberatung",
  "Versicherung",
  "Sonstiges",
];

interface VertrieblerEntry {
  id: number;
  name: string;
  email: string;
  telefon: string;
  provisionsTyp: ProvisionsTyp;
  provisionswert: number;
  status: "aktiv" | "inaktiv";
  abschluesse: number;
  kategorie: Vertrieblerkategorie;
  nebenTyp?: NebenvertrieblertypTyp;
  kooperationspartnerTyp?: string;
}

const initialVertriebler: VertrieblerEntry[] = [
  {
    id: 1,
    name: "Max Mustermann",
    email: "max.mustermann@example.com",
    telefon: "+49 170 1234567",
    provisionsTyp: "prozent",
    provisionswert: 10,
    status: "aktiv",
    abschluesse: 15,
    kategorie: "hauptvertriebler",
  },
  {
    id: 2,
    name: "Anna Meyer",
    email: "anna.meyer@example.com",
    telefon: "+49 171 2345678",
    provisionsTyp: "festbetrag",
    provisionswert: 250,
    status: "aktiv",
    abschluesse: 8,
    kategorie: "nebenvertriebler",
    nebenTyp: "leadbringer",
  },
  {
    id: 3,
    name: "Thomas Weber",
    email: "thomas.weber@example.com",
    telefon: "+49 172 3456789",
    provisionsTyp: "monatlich",
    provisionswert: 500,
    status: "aktiv",
    abschluesse: 22,
    kategorie: "nebenvertriebler",
    nebenTyp: "kooperationspartner",
    kooperationspartnerTyp: "Ärztenetz",
  },
  {
    id: 4,
    name: "Lisa Schmidt",
    email: "lisa.schmidt@example.com",
    telefon: "+49 173 4567890",
    provisionsTyp: "prozent",
    provisionswert: 8,
    status: "inaktiv",
    abschluesse: 5,
    kategorie: "nebenvertriebler",
    nebenTyp: "tippgeber",
  },
];

const nebenTypLabels: Record<NebenvertrieblertypTyp, string> = {
  leadbringer: "Leadbringer",
  leadquelle: "Leadquelle",
  kooperationspartner: "Kooperationspartner",
  tippgeber: "Tippgeber",
};

const provisionsTypLabels: Record<ProvisionsTyp, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "Festbetrag pro Abschluss",
  monatlich: "Euro/Monat",
};

function KooperationspartnerCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted-foreground">Art des Kooperationspartners...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Suchen..." />
          <CommandList>
            <CommandEmpty>Kein Eintrag gefunden.</CommandEmpty>
            <CommandGroup>
              {KOOPERATIONSPARTNER_OPTIONEN.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(v) => {
                    onChange(v === value ? "" : v);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const emptyForm = {
  name: "",
  email: "",
  telefon: "",
  provisionsTyp: "prozent" as ProvisionsTyp,
  provisionswert: 0,
  status: "aktiv" as "aktiv" | "inaktiv",
  kategorie: "hauptvertriebler" as Vertrieblerkategorie,
  nebenTyp: "" as NebenvertrieblertypTyp | "",
  kooperationspartnerTyp: "",
};

const Vertriebler = () => {
  const [vertriebler, setVertriebler] = useState<VertrieblerEntry[]>(initialVertriebler);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const set = (field: keyof typeof emptyForm, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const activeCount = vertriebler.filter((v) => v.status === "aktiv").length;
  const hauptCount = vertriebler.filter((v) => v.kategorie === "hauptvertriebler").length;
  const nebenCount = vertriebler.filter((v) => v.kategorie === "nebenvertriebler").length;
  const totalAbschluesse = vertriebler.reduce((sum, v) => sum + v.abschluesse, 0);

  const handleOpenDialog = (v?: VertrieblerEntry) => {
    if (v) {
      setEditingId(v.id);
      setFormData({
        name: v.name,
        email: v.email,
        telefon: v.telefon,
        provisionsTyp: v.provisionsTyp,
        provisionswert: v.provisionswert,
        status: v.status,
        kategorie: v.kategorie,
        nebenTyp: v.nebenTyp ?? "",
        kooperationspartnerTyp: v.kooperationspartnerTyp ?? "",
      });
    } else {
      setEditingId(null);
      setFormData({ ...emptyForm });
    }
    setDialogOpen(true);
  };

  const handleSave = () => {
    const entry: Omit<VertrieblerEntry, "id" | "abschluesse"> = {
      name: formData.name,
      email: formData.email,
      telefon: formData.telefon,
      provisionsTyp: formData.provisionsTyp,
      provisionswert: formData.provisionswert,
      status: formData.status,
      kategorie: formData.kategorie,
      nebenTyp: formData.kategorie === "nebenvertriebler" && formData.nebenTyp
        ? formData.nebenTyp as NebenvertrieblertypTyp
        : undefined,
      kooperationspartnerTyp:
        formData.kategorie === "nebenvertriebler" && formData.nebenTyp === "kooperationspartner"
          ? formData.kooperationspartnerTyp
          : undefined,
    };

    if (editingId !== null) {
      setVertriebler((prev) =>
        prev.map((v) => v.id === editingId ? { ...v, ...entry } : v)
      );
    } else {
      const newId = Math.max(...vertriebler.map((v) => v.id), 0) + 1;
      setVertriebler((prev) => [...prev, { id: newId, abschluesse: 0, ...entry }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: number) => setVertriebler((prev) => prev.filter((v) => v.id !== id));

  const formatProvision = (v: VertrieblerEntry) => {
    switch (v.provisionsTyp) {
      case "prozent": return `${v.provisionswert}%`;
      case "festbetrag": return `${v.provisionswert.toFixed(2)} € / Abschluss`;
      case "monatlich": return `${v.provisionswert.toFixed(2)} € / Monat`;
    }
  };

  const getProvisionsIcon = (typ: ProvisionsTyp) => {
    switch (typ) {
      case "prozent": return <Percent className="h-4 w-4" />;
      case "festbetrag": return <Euro className="h-4 w-4" />;
      case "monatlich": return <CalendarDays className="h-4 w-4" />;
    }
  };

  const renderTypBadge = (v: VertrieblerEntry) => {
    if (v.kategorie === "hauptvertriebler") {
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
          <Star className="h-3 w-3" />
          Hauptvertriebler
        </Badge>
      );
    }
    const label = v.nebenTyp ? nebenTypLabels[v.nebenTyp] : "Nebenvertriebler";
    const sub = v.nebenTyp === "kooperationspartner" && v.kooperationspartnerTyp
      ? ` · ${v.kooperationspartnerTyp}`
      : "";
    return (
      <div className="space-y-0.5">
        <Badge variant="secondary" className="gap-1">
          <UserPlus className="h-3 w-3" />
          {label}{sub}
        </Badge>
      </div>
    );
  };

  return (
    <MainLayout title="Vertriebler" subtitle="Verwaltung der Vertriebspartner und Provisionsmodelle">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vertriebler.length}</div>
              <p className="text-xs text-muted-foreground">{activeCount} aktiv</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hauptvertriebler</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hauptCount}</div>
              <p className="text-xs text-muted-foreground">Direktvertrieb</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nebenvertriebler</CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nebenCount}</div>
              <p className="text-xs text-muted-foreground">Lead, Kooperation, Tipp</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Abschlüsse</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAbschluesse}</div>
              <p className="text-xs text-muted-foreground">Gesamt</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Vertriebler</CardTitle>
              <CardDescription>Haupt- und Nebenvertriebler im Überblick</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Neuer Vertriebler
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingId !== null ? "Vertriebler bearbeiten" : "Neuer Vertriebler"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingId !== null
                      ? "Daten des Vertrieblers bearbeiten."
                      : "Neuen Vertriebspartner erfassen."}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                  {/* Stammdaten */}
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={formData.name} onChange={(e) => set("name", e.target.value)} placeholder="Vollständiger Name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="email">E-Mail</Label>
                      <Input id="email" type="email" value={formData.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.de" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="telefon">Telefon</Label>
                      <Input id="telefon" value={formData.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="+49 170 …" />
                    </div>
                  </div>

                  <Separator />

                  {/* Typ-Auswahl */}
                  <div className="grid gap-2">
                    <Label>Vertrieblertyp</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["hauptvertriebler", "nebenvertriebler"] as Vertrieblerkategorie[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            set("kategorie", k);
                            if (k === "hauptvertriebler") {
                              set("nebenTyp", "");
                              set("kooperationspartnerTyp", "");
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                            formData.kategorie === k
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {k === "hauptvertriebler"
                            ? <><Star className="h-4 w-4" /> Hauptvertriebler</>
                            : <><UserPlus className="h-4 w-4" /> Nebenvertriebler</>
                          }
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nebenvertriebler-Untertyp */}
                  {formData.kategorie === "nebenvertriebler" && (
                    <div className="grid gap-3 pl-4 border-l-2 border-primary/30">
                      <div className="grid gap-2">
                        <Label>Untertyp</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["leadbringer", "leadquelle", "kooperationspartner", "tippgeber"] as NebenvertrieblertypTyp[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                set("nebenTyp", t);
                                if (t !== "kooperationspartner") set("kooperationspartnerTyp", "");
                              }}
                              className={cn(
                                "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left",
                                formData.nebenTyp === t
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background text-muted-foreground hover:bg-accent"
                              )}
                            >
                              {nebenTypLabels[t]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Kooperationspartner-Combobox */}
                      {formData.nebenTyp === "kooperationspartner" && (
                        <div className="grid gap-2">
                          <Label>Art des Kooperationspartners</Label>
                          <KooperationspartnerCombobox
                            value={formData.kooperationspartnerTyp}
                            onChange={(v) => set("kooperationspartnerTyp", v)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Provision */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Provisionsmodell</Label>
                      <Select
                        value={formData.provisionsTyp}
                        onValueChange={(v: ProvisionsTyp) => set("provisionsTyp", v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prozent">% vom Umsatz</SelectItem>
                          <SelectItem value="festbetrag">Festbetrag / Abschluss</SelectItem>
                          <SelectItem value="monatlich">Euro / Monat</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>{formData.provisionsTyp === "prozent" ? "Prozentsatz (%)" : "Betrag (€)"}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={formData.provisionsTyp === "prozent" ? 0.5 : 1}
                        value={formData.provisionswert}
                        onChange={(e) => set("provisionswert", parseFloat(e.target.value) || 0)}
                        placeholder={formData.provisionsTyp === "prozent" ? "10" : "250"}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v: "aktiv" | "inaktiv") => set("status", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aktiv">Aktiv</SelectItem>
                        <SelectItem value="inaktiv">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                  <Button onClick={handleSave} disabled={!formData.name}>
                    {editingId !== null ? "Speichern" : "Hinzufügen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Provisionsmodell</TableHead>
                  <TableHead className="text-center">Abschlüsse</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vertriebler.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{renderTypBadge(v)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{v.email}</div>
                      <div className="text-xs text-muted-foreground">{v.telefon}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getProvisionsIcon(v.provisionsTyp)}
                        <span>{formatProvision(v)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">{v.abschluesse}</TableCell>
                    <TableCell>
                      <Badge
                        variant={v.status === "aktiv" ? "default" : "secondary"}
                        className={v.status === "aktiv"
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground"
                        }
                      >
                        {v.status === "aktiv" ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Vertriebler;
