import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, FileSpreadsheet, Users, Ticket, Key } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ExportOption {
  id: string;
  title: string;
  description: string;
  icon: typeof FileSpreadsheet;
  iconColor: string;
}

const exportOptions: ExportOption[] = [
  {
    id: "praxen",
    title: "Praxen-Daten",
    description:
      "Alle Praxen mit Adresse, Kontaktdaten, MP-Nr, Produkt, Modulen und Preis",
    icon: Users,
    iconColor: "bg-primary/10 text-primary",
  },
  {
    id: "tickets",
    title: "Ticket-Daten",
    description:
      "Alle Tickets mit Status, Typ, Aufwand pro Praxis und Gesamtaufwand",
    icon: Ticket,
    iconColor: "bg-warning/10 text-warning",
  },
  {
    id: "lizenzen",
    title: "Lizenz-Daten",
    description: "Alle Lizenzen mit Schlüssel, Praxis, Produkt und Gültigkeit",
    icon: Key,
    iconColor: "bg-accent/10 text-accent",
  },
];

export default function Export() {
  const [selectedExport, setSelectedExport] = useState<string>("praxen");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [format, setFormat] = useState("csv");
  const { toast } = useToast();

  const handleExport = () => {
    const option = exportOptions.find((o) => o.id === selectedExport);
    toast({
      title: "Export gestartet",
      description: `${option?.title} wird als ${format.toUpperCase()} exportiert...`,
    });

    // Simulate download
    setTimeout(() => {
      toast({
        title: "Export abgeschlossen",
        description: "Die Datei wurde heruntergeladen.",
      });
    }, 1500);
  };

  return (
    <MainLayout title="Datenexport" subtitle="Daten im CSV-Format exportieren">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Export Options */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Exporttyp auswählen
          </h2>
          <div className="grid gap-4">
            {exportOptions.map((option) => (
              <div
                key={option.id}
                className={`card-elevated p-4 cursor-pointer transition-all ${
                  selectedExport === option.id
                    ? "ring-2 ring-primary"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedExport(option.id)}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg p-3 ${option.iconColor}`}>
                    <option.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">{option.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      selectedExport === option.id
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {selectedExport === option.id && (
                      <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export Settings */}
        <div className="space-y-6">
          <div className="card-elevated p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Export-Einstellungen
            </h2>

            <div className="space-y-4">
              <div>
                <Label>Zeitraum von</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Zeitraum bis</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleExport} className="w-full mt-4">
                <Download className="h-4 w-4 mr-2" />
                Export starten
              </Button>
            </div>
          </div>

          {/* Salesforce Integration Hint */}
          <div className="card-elevated p-6 border-dashed">
            <div className="flex items-center gap-3 mb-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium text-foreground">
                Salesforce-Integration
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatischer Datenexport nach Salesforce kann in den
              Admin-Einstellungen konfiguriert werden.
            </p>
            <Button variant="outline" size="sm" className="mt-3">
              Konfigurieren
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
