import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Praxis {
  id: string;
  name: string;
  adresse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  mpNr: string;
  produkt: string;
  module: string[];
  preis: number;
  buchungsDatum: string;
  status: "aktiv" | "inaktiv" | "gekündigt";
}

const initialPraxen: Praxis[] = [
  {
    id: "1",
    name: "Dr. med. Hans Müller",
    adresse: "Hauptstraße 15",
    plz: "80331",
    ort: "München",
    telefon: "+49 89 12345678",
    email: "praxis@mueller.de",
    mpNr: "MP-123456",
    produkt: "HFX GOÄ",
    module: ["GOÄ-Prüfung", "Live-Check"],
    preis: 0,
    buchungsDatum: "2024-12-15",
    status: "aktiv",
  },
  {
    id: "2",
    name: "Zahnarztpraxis Schmidt",
    adresse: "Berliner Allee 42",
    plz: "10115",
    ort: "Berlin",
    telefon: "+49 30 98765432",
    email: "info@zahnarzt-schmidt.de",
    mpNr: "MP-789012",
    produkt: "HFX GOZ Live-Check",
    module: ["GOZ-Prüfung"],
    preis: 0,
    buchungsDatum: "2025-01-10",
    status: "aktiv",
  },
  {
    id: "3",
    name: "MVZ Gesundheit GmbH",
    adresse: "Klinikweg 8",
    plz: "50667",
    ort: "Köln",
    telefon: "+49 221 55443322",
    email: "verwaltung@mvz-gesundheit.de",
    mpNr: "MP-345678",
    produkt: "HFX EBM",
    module: ["EBM-Prüfung", "Benchmark"],
    preis: 0,
    buchungsDatum: "2024-11-20",
    status: "aktiv",
  },
  {
    id: "4",
    name: "Praxis Dr. Weber",
    adresse: "Am Markt 3",
    plz: "60311",
    ort: "Frankfurt",
    telefon: "+49 69 11223344",
    email: "kontakt@praxis-weber.de",
    mpNr: "MP-901234",
    produkt: "HFX Wingmann",
    module: ["KI-Assistent"],
    preis: 0,
    buchungsDatum: "2025-01-05",
    status: "aktiv",
  },
];

const statusColors: Record<string, string> = {
  aktiv: "badge-success",
  inaktiv: "badge-warning",
  gekündigt: "badge-error",
};

export default function Praxen() {
  const [praxen, setPraxen] = useState<Praxis[]>(initialPraxen);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredPraxen = praxen.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.mpNr.toLowerCase().includes(search.toLowerCase()) ||
      p.ort.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const headers = [
      "Name",
      "Adresse",
      "PLZ",
      "Ort",
      "Telefon",
      "E-Mail",
      "MP-Nr",
      "Produkt",
      "Module",
      "Preis",
      "Buchungsdatum",
      "Status",
    ];
    const rows = praxen.map((p) => [
      p.name,
      p.adresse,
      p.plz,
      p.ort,
      p.telefon,
      p.email,
      p.mpNr,
      p.produkt,
      p.module.join("; "),
      `${p.preis} €`,
      p.buchungsDatum,
      p.status,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `praxen_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <MainLayout title="Praxen" subtitle="Verwaltung aller registrierten Praxen">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name, MP-Nr oder Ort..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Neue Praxis
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Neue Praxis anlegen</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newPraxis: Praxis = {
                    id: crypto.randomUUID(),
                    name: formData.get("name") as string,
                    adresse: formData.get("adresse") as string,
                    plz: formData.get("plz") as string,
                    ort: formData.get("ort") as string,
                    telefon: formData.get("telefon") as string,
                    email: formData.get("email") as string,
                    mpNr: `MP-${Math.random().toString().slice(2, 8)}`,
                    produkt: formData.get("produkt") as string,
                    module: [],
                    preis: 0,
                    buchungsDatum: new Date().toISOString().split("T")[0],
                    status: "aktiv",
                  };
                  setPraxen([newPraxis, ...praxen]);
                  setIsDialogOpen(false);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Praxisname</Label>
                    <Input id="name" name="name" required className="mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="adresse">Adresse</Label>
                    <Input id="adresse" name="adresse" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="plz">PLZ</Label>
                    <Input id="plz" name="plz" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ort">Ort</Label>
                    <Input id="ort" name="ort" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="telefon">Telefon</Label>
                    <Input id="telefon" name="telefon" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="produkt">Produkt</Label>
                    <Select name="produkt" defaultValue="HFX GOÄ">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HFX GOÄ">HFX GOÄ</SelectItem>
                        <SelectItem value="HFX EBM">HFX EBM</SelectItem>
                        <SelectItem value="HFX Benchmark KZV">HFX Benchmark KZV</SelectItem>
                        <SelectItem value="HFX Doku">HFX Doku</SelectItem>
                        <SelectItem value="HFX Wingmann">HFX Wingmann</SelectItem>
                        <SelectItem value="HFX GOÄ Live-Check">HFX GOÄ Live-Check</SelectItem>
                        <SelectItem value="HFX GOZ Live-Check">HFX GOZ Live-Check</SelectItem>
                        <SelectItem value="HFX Praxismanagement Zahnmedizin">HFX Praxismanagement Zahnmedizin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit">Praxis anlegen</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead className="bg-muted/50">
              <tr>
                <th>Praxis</th>
                <th>MP-Nr</th>
                <th>Ort</th>
                <th>Produkt</th>
                <th>Preis/Monat</th>
                <th>Buchung</th>
                <th>Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPraxen.map((praxis) => (
                <tr key={praxis.id}>
                  <td>
                    <div>
                      <span className="font-medium text-foreground">
                        {praxis.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {praxis.email}
                      </span>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">
                    {praxis.mpNr}
                  </td>
                  <td className="text-muted-foreground">
                    {praxis.plz} {praxis.ort}
                  </td>
                  <td>
                    <span className="text-foreground">{praxis.produkt}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {praxis.module.slice(0, 2).map((mod) => (
                        <span
                          key={mod}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground"
                        >
                          {mod}
                        </span>
                      ))}
                      {praxis.module.length > 2 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground">
                          +{praxis.module.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="font-medium text-foreground">
                    {praxis.preis} €
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(praxis.buchungsDatum).toLocaleDateString("de-DE")}
                  </td>
                  <td>
                    <span className={`badge-status ${statusColors[praxis.status]}`}>
                      {praxis.status}
                    </span>
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
