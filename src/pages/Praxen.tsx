import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, MoreHorizontal, Pencil, Trash2, RefreshCw, Loader2, UserCheck, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSalesforceConnection } from "@/hooks/useSalesforceConnection";

interface Praxis {
  id: string;
  name: string;
  arztName: string;
  hfxNr: string;
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
  convertedFromLeadId: string | null;
  source: "praxen" | "contract";
}

const statusColors: Record<string, string> = {
  aktiv: "badge-success",
  inaktiv: "badge-warning",
  gekündigt: "badge-error",
};

export default function Praxen() {
  const [praxen, setPraxen] = useState<Praxis[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const { connection: sfConnection } = useSalesforceConnection();

  const fetchPraxen = async () => {
    setLoading(true);

    // Fetch from praxen table
    const { data: praxenData, error: praxenError } = await supabase
      .from("praxen")
      .select("*")
      .order("created_at", { ascending: false });

    if (praxenError) {
      toast.error("Fehler beim Laden der Kunden");
      console.error(praxenError);
    }

    // Fetch active contracts not yet in praxen
    const { data: contractsData } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "aktiv")
      .order("created_at", { ascending: false });

    const praxenList: Praxis[] = (praxenData || []).map((p) => ({
      id: p.id,
      name: p.name,
      adresse: p.adresse || "",
      plz: p.plz || "",
      ort: p.ort || "",
      telefon: p.telefon || "",
      email: p.email || "",
      mpNr: p.mp_nr || "",
      hfxNr: (p as any).hfx_customer_number || p.mp_nr || "",
      arztName: "",
      produkt: p.produkt || "",
      module: p.module || [],
      preis: p.preis || 0,
      buchungsDatum: p.buchungs_datum || "",
      status: (p.status as "aktiv" | "inaktiv" | "gekündigt") || "aktiv",
      convertedFromLeadId: p.converted_from_lead_id,
      source: "praxen" as const,
    }));

    // Add active contracts that are not already in praxen (by hfx_customer_number or email)
    const existingKeys = new Set([
      ...praxenList.map((p) => p.mpNr).filter(Boolean),
      ...praxenList.map((p) => p.email.toLowerCase()).filter(Boolean),
    ]);

    const contractEntries: Praxis[] = (contractsData || [])
      .filter((c) => {
        const hfx = c.hfx_customer_number || c.mp_nr || "";
        const email = (c.email || "").toLowerCase();
        return !existingKeys.has(hfx) && !existingKeys.has(email);
      })
      .map((c) => ({
        id: c.id,
        name: c.praxis || `${c.vorname || ""} ${c.nachname || ""}`.trim() || c.customer_name,
        arztName: c.praxis ? `${c.vorname || ""} ${c.nachname || ""}`.trim() : "",
        adresse: c.praxisanschrift || c.adresse || "",
        plz: c.plz || "",
        ort: c.ort || "",
        telefon: c.telefon || "",
        email: c.email || "",
        mpNr: c.hfx_customer_number || c.mp_nr || "",
        hfxNr: c.hfx_customer_number || c.mp_nr || "",
        produkt: c.product_name || "",
        module: c.modules || [],
        preis: c.monthly_price || 0,
        buchungsDatum: c.start_date || c.created_at?.split("T")[0] || "",
        status: "aktiv" as const,
        convertedFromLeadId: null,
        source: "contract" as const,
      }));

    setPraxen([...praxenList, ...contractEntries]);
    setLoading(false);
  };

  useEffect(() => {
    fetchPraxen();
  }, []);

  const syncToSalesforce = async (praxis: Praxis) => {
    if (!sfConnection.isConnected) {
      toast.error("Salesforce ist nicht verbunden. Bitte zuerst unter Einstellungen verbinden.");
      return;
    }

    setSyncingId(praxis.id);
    try {
      const { data, error } = await supabase.functions.invoke("salesforce-sync-price", {
        body: { mpNr: praxis.mpNr, preis: praxis.preis },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Preis für ${praxis.name} erfolgreich synchronisiert`);
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error("Fehler bei der Synchronisation");
    } finally {
      setSyncingId(null);
    }
  };

  const filteredPraxen = praxen.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.mpNr.toLowerCase().includes(search.toLowerCase()) ||
      p.ort.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const headers = [
      "Name", "Adresse", "PLZ", "Ort", "Telefon", "E-Mail",
      "MP-Nr", "Produkt", "Module", "Preis", "Buchungsdatum", "Status",
    ];
    const rows = praxen.map((p) => [
      p.name, p.adresse, p.plz, p.ort, p.telefon, p.email,
      p.mpNr, p.produkt, p.module.join("; "), `${p.preis} €`,
      p.buchungsDatum, p.status,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kunden_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <MainLayout title="Kunden" subtitle="Verwaltung aller registrierten Kunden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name, MP-Nr, Ort oder E-Mail..."
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
                Neuer Kunde
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Neuen Kunden anlegen</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const { error } = await supabase.from("praxen").insert({
                    name: formData.get("name") as string,
                    adresse: formData.get("adresse") as string,
                    plz: formData.get("plz") as string,
                    ort: formData.get("ort") as string,
                    telefon: formData.get("telefon") as string,
                    email: formData.get("email") as string,
                    produkt: formData.get("produkt") as string,
                    status: "aktiv",
                  });
                  if (error) {
                    toast.error("Fehler beim Anlegen des Kunden");
                    console.error(error);
                  } else {
                    toast.success("Kunde erfolgreich angelegt");
                    fetchPraxen();
                  }
                  setIsDialogOpen(false);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Kundenname</Label>
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
                    <Input id="email" name="email" type="email" required className="mt-1" />
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
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button type="submit">Kunde anlegen</Button>
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
                <th>HFX-Nr.</th>
                <th>Praxis / Name</th>
                <th>E-Mail</th>
                <th>Ort</th>
                <th>Produkt</th>
                <th>Preis/Monat</th>
                <th>Buchung</th>
                <th>Status</th>
                <th>Herkunft</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Lade Kunden...
                  </td>
                </tr>
              ) : filteredPraxen.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    Keine Kunden gefunden
                  </td>
                </tr>
              ) : (
                filteredPraxen.map((praxis) => (
                  <tr key={`${praxis.source}-${praxis.id}`}>
                    <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">{praxis.hfxNr || "–"}</td>
                    <td>
                      <div>
                        <span className="font-medium text-foreground">{praxis.name}</span>
                        {praxis.arztName && (
                          <span className="block text-xs text-muted-foreground">{praxis.arztName}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground">{praxis.email || "–"}</td>
                    <td className="text-muted-foreground">{praxis.plz} {praxis.ort}</td>
                    <td>
                      <span className="text-foreground">{praxis.produkt}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {praxis.module.slice(0, 2).map((mod) => (
                          <span key={mod} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground">
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
                    <td className="font-medium text-foreground">{praxis.preis} €</td>
                    <td className="text-muted-foreground">
                      {praxis.buchungsDatum ? new Date(praxis.buchungsDatum).toLocaleDateString("de-DE") : "–"}
                    </td>
                    <td>
                      <span className={`badge-status ${statusColors[praxis.status]}`}>{praxis.status}</span>
                    </td>
                    <td>
                      {praxis.source === "contract" ? (
                        <Badge variant="outline" className="text-[11px] gap-1">
                          <FileText className="h-3 w-3" />
                          Vertrag
                        </Badge>
                      ) : praxis.convertedFromLeadId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                          <UserCheck className="h-3 w-3" />
                          Lead
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Direkt</span>
                      )}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => syncToSalesforce(praxis)}
                            disabled={syncingId === praxis.id || !sfConnection.isConnected}
                          >
                            {syncingId === praxis.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Zu Salesforce syncen
                          </DropdownMenuItem>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
