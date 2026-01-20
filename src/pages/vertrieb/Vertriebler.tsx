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
import { Plus, Pencil, Trash2, Users, Percent, Euro, CalendarDays } from "lucide-react";

type ProvisionsTyp = "prozent" | "festbetrag" | "monatlich";

interface Vertriebler {
  id: number;
  name: string;
  email: string;
  telefon: string;
  provisionsTyp: ProvisionsTyp;
  provisionswert: number;
  status: "aktiv" | "inaktiv";
  abschluesse: number;
}

const initialVertriebler: Vertriebler[] = [
  {
    id: 1,
    name: "Max Mustermann",
    email: "max.mustermann@example.com",
    telefon: "+49 170 1234567",
    provisionsTyp: "prozent",
    provisionswert: 10,
    status: "aktiv",
    abschluesse: 15,
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
  },
];

const provisionsTypLabels: Record<ProvisionsTyp, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "Festbetrag pro Abschluss",
  monatlich: "Euro/Monat",
};

const Vertriebler = () => {
  const [vertriebler, setVertriebler] = useState<Vertriebler[]>(initialVertriebler);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVertriebler, setEditingVertriebler] = useState<Vertriebler | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    telefon: "",
    provisionsTyp: "prozent" as ProvisionsTyp,
    provisionswert: 0,
    status: "aktiv" as "aktiv" | "inaktiv",
  });

  const activeCount = vertriebler.filter((v) => v.status === "aktiv").length;
  const totalAbschluesse = vertriebler.reduce((sum, v) => sum + v.abschluesse, 0);

  const handleOpenDialog = (v?: Vertriebler) => {
    if (v) {
      setEditingVertriebler(v);
      setFormData({
        name: v.name,
        email: v.email,
        telefon: v.telefon,
        provisionsTyp: v.provisionsTyp,
        provisionswert: v.provisionswert,
        status: v.status,
      });
    } else {
      setEditingVertriebler(null);
      setFormData({
        name: "",
        email: "",
        telefon: "",
        provisionsTyp: "prozent",
        provisionswert: 0,
        status: "aktiv",
      });
    }
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingVertriebler) {
      setVertriebler((prev) =>
        prev.map((v) =>
          v.id === editingVertriebler.id
            ? { ...v, ...formData }
            : v
        )
      );
    } else {
      const newId = Math.max(...vertriebler.map((v) => v.id), 0) + 1;
      setVertriebler((prev) => [
        ...prev,
        { id: newId, ...formData, abschluesse: 0 },
      ]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: number) => {
    setVertriebler((prev) => prev.filter((v) => v.id !== id));
  };

  const formatProvision = (v: Vertriebler) => {
    switch (v.provisionsTyp) {
      case "prozent":
        return `${v.provisionswert}%`;
      case "festbetrag":
        return `${v.provisionswert.toFixed(2)} € / Abschluss`;
      case "monatlich":
        return `${v.provisionswert.toFixed(2)} € / Monat`;
    }
  };

  const getProvisionsIcon = (typ: ProvisionsTyp) => {
    switch (typ) {
      case "prozent":
        return <Percent className="h-4 w-4" />;
      case "festbetrag":
        return <Euro className="h-4 w-4" />;
      case "monatlich":
        return <CalendarDays className="h-4 w-4" />;
    }
  };

  return (
    <MainLayout title="Vertriebler" subtitle="Verwaltung der Vertriebspartner und Provisionsmodelle">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Vertriebler</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vertriebler.length}</div>
              <p className="text-xs text-muted-foreground">{activeCount} aktiv</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Abschlüsse Gesamt</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAbschluesse}</div>
              <p className="text-xs text-muted-foreground">Von allen Vertrieblern</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Provisionsmodelle</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">%, Festbetrag, Monatlich</p>
            </CardContent>
          </Card>
        </div>

        {/* Vertriebler Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Vertriebler</CardTitle>
              <CardDescription>Alle registrierten Vertriebspartner</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Neuer Vertriebler
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingVertriebler ? "Vertriebler bearbeiten" : "Neuer Vertriebler"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingVertriebler
                      ? "Bearbeiten Sie die Daten des Vertrieblers."
                      : "Fügen Sie einen neuen Vertriebspartner hinzu."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Vollständiger Name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="telefon">Telefon</Label>
                    <Input
                      id="telefon"
                      value={formData.telefon}
                      onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                      placeholder="+49 170 1234567"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="provisionsTyp">Provisionsmodell</Label>
                    <Select
                      value={formData.provisionsTyp}
                      onValueChange={(value: ProvisionsTyp) =>
                        setFormData({ ...formData, provisionsTyp: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prozent">% vom Umsatz</SelectItem>
                        <SelectItem value="festbetrag">Festbetrag pro Abschluss</SelectItem>
                        <SelectItem value="monatlich">Euro/Monat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="provisionswert">
                      {formData.provisionsTyp === "prozent"
                        ? "Prozentsatz (%)"
                        : "Betrag (€)"}
                    </Label>
                    <Input
                      id="provisionswert"
                      type="number"
                      min={0}
                      step={formData.provisionsTyp === "prozent" ? 0.5 : 1}
                      value={formData.provisionswert}
                      onChange={(e) =>
                        setFormData({ ...formData, provisionswert: parseFloat(e.target.value) || 0 })
                      }
                      placeholder={formData.provisionsTyp === "prozent" ? "10" : "250"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: "aktiv" | "inaktiv") =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aktiv">Aktiv</SelectItem>
                        <SelectItem value="inaktiv">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button onClick={handleSave}>
                    {editingVertriebler ? "Speichern" : "Hinzufügen"}
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
                        className={
                          v.status === "aktiv"
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                        }
                      >
                        {v.status === "aktiv" ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(v)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(v.id)}
                        >
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
