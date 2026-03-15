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
import { Plus, Search, Copy, Check, Key, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Lizenz {
  id: string;
  lizenzKey: string;
  praxis: string;
  produkt: string;
  status: "aktiv" | "inaktiv" | "abgelaufen";
  erstelltAm: string;
  gueltigBis: string;
}

const initialLizenzen: Lizenz[] = [
  {
    id: "1",
    lizenzKey: "HFX-EBM-2025-A1B2C3D4",
    praxis: "Dr. med. Hans Müller",
    produkt: "HFX EBM",
    status: "aktiv",
    erstelltAm: "2024-12-15",
    gueltigBis: "2025-12-15",
  },
  {
    id: "2",
    lizenzKey: "HFX-EBM-2025-E5F6G7H8",
    praxis: "Zahnarztpraxis Schmidt",
    produkt: "HFX EBM",
    status: "aktiv",
    erstelltAm: "2025-01-10",
    gueltigBis: "2026-01-10",
  },
  {
    id: "3",
    lizenzKey: "HFX-EBM-2024-I9J0K1L2",
    praxis: "MVZ Gesundheit GmbH",
    produkt: "HFX EBM",
    status: "aktiv",
    erstelltAm: "2024-11-20",
    gueltigBis: "2025-11-20",
  },
  {
    id: "4",
    lizenzKey: "HFX-EBM-2024-M3N4O5P6",
    praxis: "Praxis Dr. Weber",
    produkt: "HFX EBM",
    status: "inaktiv",
    erstelltAm: "2024-06-01",
    gueltigBis: "2024-12-01",
  },
];

const statusColors: Record<string, string> = {
  aktiv: "badge-success",
  inaktiv: "badge-warning",
  abgelaufen: "badge-error",
};

const produktPrefixes: Record<string, string> = {
  "HFX GOÄ": "GOA",
  "HFX EBM": "EBM",
  "HFX Benchmark KZV": "KZV",
  "HFX Doku": "DOK",
  "HFX Wingmann": "WNG",
  "HFX GOÄ Live-Check": "GLC",
  "HFX GOZ Live-Check": "GOZ",
  "HFX Praxismanagement Zahnmedizin": "PMZ",
};

export default function Lizenzen() {
  const [lizenzen, setLizenzen] = useState<Lizenz[]>(initialLizenzen);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredLizenzen = lizenzen.filter(
    (l) =>
      l.praxis.toLowerCase().includes(search.toLowerCase()) ||
      l.lizenzKey.toLowerCase().includes(search.toLowerCase())
  );

  const generateLizenzKey = (produkt: string) => {
    const prefix = produktPrefixes[produkt] || "HFX";
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `HFX-${prefix}-${year}-${random}`;
  };

  const copyToClipboard = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    toast({
      title: "Lizenzschlüssel kopiert",
      description: "Der Lizenzschlüssel wurde in die Zwischenablage kopiert.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <MainLayout title="HFX EBM Lizenzen" subtitle="Lizenzverwaltung und Freischaltung">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-success/10">
              <Key className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aktive Lizenzen</p>
              <p className="text-2xl font-semibold text-foreground">
                {lizenzen.filter((l) => l.status === "aktiv").length}
              </p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-warning/10">
              <RefreshCw className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Zur Erneuerung</p>
              <p className="text-2xl font-semibold text-foreground">
                {lizenzen.filter((l) => l.status === "inaktiv").length}
              </p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-muted">
              <Key className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gesamt</p>
              <p className="text-2xl font-semibold text-foreground">
                {lizenzen.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Praxis oder Lizenzschlüssel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neue Lizenz
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Neue Lizenz erstellen</DialogTitle>
            </DialogHeader>
            <form autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const produkt = formData.get("produkt") as string;
                const gueltigkeitMonate = parseInt(
                  formData.get("gueltigkeit") as string
                );
                const gueltigBis = new Date();
                gueltigBis.setMonth(gueltigBis.getMonth() + gueltigkeitMonate);

                const newLizenz: Lizenz = {
                  id: crypto.randomUUID(),
                  lizenzKey: generateLizenzKey(produkt),
                  praxis: formData.get("praxis") as string,
                  produkt,
                  status: "aktiv",
                  erstelltAm: new Date().toISOString().split("T")[0],
                  gueltigBis: gueltigBis.toISOString().split("T")[0],
                };
                setLizenzen([newLizenz, ...lizenzen]);
                setIsDialogOpen(false);
                toast({
                  title: "Lizenz erstellt",
                  description: `Lizenzschlüssel: ${newLizenz.lizenzKey}`,
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="praxis">Praxis</Label>
                <Input id="praxis" name="praxis" required className="mt-1" />
              </div>
              <div>
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
              <div>
                <Label htmlFor="gueltigkeit">Gültigkeit</Label>
                <Select name="gueltigkeit" defaultValue="12">
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Monat</SelectItem>
                    <SelectItem value="6">6 Monate</SelectItem>
                    <SelectItem value="12">12 Monate</SelectItem>
                    <SelectItem value="24">24 Monate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button type="submit">Lizenz erstellen</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead className="bg-muted/50">
              <tr>
                <th>Lizenzschlüssel</th>
                <th>Praxis</th>
                <th>Produkt</th>
                <th>Erstellt</th>
                <th>Gültig bis</th>
                <th>Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLizenzen.map((lizenz) => (
                <tr key={lizenz.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 rounded bg-muted text-xs font-mono">
                        {lizenz.lizenzKey}
                      </code>
                    </div>
                  </td>
                  <td className="font-medium text-foreground">{lizenz.praxis}</td>
                  <td className="text-muted-foreground">{lizenz.produkt}</td>
                  <td className="text-muted-foreground">
                    {new Date(lizenz.erstelltAm).toLocaleDateString("de-DE")}
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(lizenz.gueltigBis).toLocaleDateString("de-DE")}
                  </td>
                  <td>
                    <span className={`badge-status ${statusColors[lizenz.status]}`}>
                      {lizenz.status}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(lizenz.lizenzKey, lizenz.id)}
                    >
                      {copiedId === lizenz.id ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
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
