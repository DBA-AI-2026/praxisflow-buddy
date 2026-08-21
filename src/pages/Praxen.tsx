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
import { Separator } from "@/components/ui/separator";
import {
  Plus, Search, Download, MoreHorizontal, Pencil, Trash2, RefreshCw,
  Loader2, UserCheck, FileText, Eye, Building2, Mail, Phone, MapPin,
  Calendar, Euro, Package, GitMerge, CheckCircle2, XCircle, Send,
} from "lucide-react";
import { CONTRACT_STATUS_CONFIG } from "@/lib/statusConfig";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useSalesforceConnection } from "@/hooks/useSalesforceConnection";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

// Status-Config: SSOT in @/lib/statusConfig (CONTRACT_STATUS_CONFIG).

export default function Praxen() {
  const [praxen, setPraxen] = useState<Praxis[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [sendingCredentialsId, setSendingCredentialsId] = useState<string | null>(null);
  const [selectedPraxis, setSelectedPraxis] = useState<Praxis | null>(null);
  const [praxisContracts, setPraxisContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const { connection: sfConnection } = useSalesforceConnection();

  // Qodia sync status from leads, keyed by hfx_customer_number and lead id
  const [leadQodiaMap, setLeadQodiaMap] = useState<{ byHfx: Record<string, boolean>; byLeadId: Record<string, boolean> }>({ byHfx: {}, byLeadId: {} });

  const fetchPraxen = async () => {
    setLoading(true);

    const { data: praxenData, error: praxenError } = await supabase
      .from("praxen")
      .select("*")
      .order("created_at", { ascending: false });

    if (praxenError) {
      toast.error("Fehler beim Laden der Kunden");
      console.error(praxenError);
    }

    const { data: contractsData } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "aktiv")
      .order("created_at", { ascending: false });

    const praxenList: Praxis[] = (praxenData || []).map((p) => ({
      id: p.id,
      name: p.name,
      arztName: "",
      hfxNr: (p as any).hfx_customer_number || p.mp_nr || "",
      adresse: p.adresse || "",
      plz: p.plz || "",
      ort: p.ort || "",
      telefon: p.telefon || "",
      email: p.email || "",
      mpNr: p.mp_nr || "",
      produkt: p.produkt || "",
      module: p.module || [],
      preis: p.preis || 0,
      buchungsDatum: p.buchungs_datum || "",
      status: (p.status as "aktiv" | "inaktiv" | "gekündigt") || "aktiv",
      convertedFromLeadId: p.converted_from_lead_id,
      source: "praxen" as const,
    }));

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

    // Fetch qodia status from leads
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, hfx_customer_number, qodia_synced");
    const byHfx: Record<string, boolean> = {};
    const byLeadId: Record<string, boolean> = {};
    (leadsData || []).forEach((l: any) => {
      if (l.hfx_customer_number) byHfx[l.hfx_customer_number] = l.qodia_synced;
      if (l.id) byLeadId[l.id] = l.qodia_synced;
    });
    setLeadQodiaMap({ byHfx, byLeadId });

    setLoading(false);
  };

  useEffect(() => {
    fetchPraxen();
  }, []);

  const openDetail = async (praxis: Praxis) => {
    setSelectedPraxis(praxis);
    setLoadingContracts(true);
    setPraxisContracts([]);

    // Phase 1a: Verträge primär via customer_id auflösen (Träger + Standorte).
    // HFX-Fallback für Altzeilen ohne customer_id; E-Mail als letzter Fallback.
    if (praxis.hfxNr) {
      const { data: customerRow } = await supabase
        .from("customers")
        .select("id")
        .eq("hfx_customer_number", praxis.hfxNr)
        .maybeSingle();

      if (customerRow?.id) {
        const [byCustomer, byHfxLegacy] = await Promise.all([
          supabase
            .from("contracts")
            .select("*")
            .eq("customer_id", customerRow.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("contracts")
            .select("*")
            .eq("hfx_customer_number", praxis.hfxNr)
            .is("customer_id", null)
            .order("created_at", { ascending: false }),
        ]);
        const merged = [...(byCustomer.data ?? []), ...(byHfxLegacy.data ?? [])];
        const seen = new Set<string>();
        const dedup = merged.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        if (dedup.length > 0) {
          setPraxisContracts(dedup);
          setLoadingContracts(false);
          return;
        }
      } else {
        // Kein Customer-Datensatz → reiner HFX-Pfad (Altbestand / Lead-Praxis)
        const { data: byHfx } = await supabase
          .from("contracts")
          .select("*")
          .eq("hfx_customer_number", praxis.hfxNr)
          .order("created_at", { ascending: false });
        if (byHfx && byHfx.length > 0) {
          setPraxisContracts(byHfx);
          setLoadingContracts(false);
          return;
        }
      }
    }

    // Fallback: search by email
    if (praxis.email) {
      const { data: byEmail } = await supabase
        .from("contracts")
        .select("*")
        .eq("email", praxis.email)
        .order("created_at", { ascending: false });
      setPraxisContracts(byEmail || []);
    } else {
      setPraxisContracts([]);
    }
    setLoadingContracts(false);
  };

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
      if (data?.error) toast.error(data.error);
      else toast.success(`Preis für ${praxis.name} erfolgreich synchronisiert`);
    } catch (err) {
      toast.error("Fehler bei der Synchronisation");
    } finally {
      setSyncingId(null);
    }
  };

  const sendCredentials = async (praxis: Praxis) => {
    if (!praxis.email) {
      toast.error("Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.");
      return;
    }
    setSendingCredentialsId(praxis.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: {
          email: praxis.email,
          vorname: "",
          nachname: praxis.name,
          hfxCustomerNumber: praxis.hfxNr || praxis.mpNr || "",
        },
      });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else toast.success(`Zugangsdaten wurden an ${praxis.email} gesendet.`);
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Versenden der Zugangsdaten");
    } finally {
      setSendingCredentialsId(null);
    }
  };

  const filteredPraxen = praxen.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.hfxNr.toLowerCase().includes(search.toLowerCase()) ||
      p.mpNr.toLowerCase().includes(search.toLowerCase()) ||
      p.ort.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const headers = [
      "HFX-Nr", "Name", "Adresse", "PLZ", "Ort", "Telefon", "E-Mail",
      "MP-Nr", "Produkt", "Module", "Preis", "Buchungsdatum", "Status",
    ];
    const rows = praxen.map((p) => [
      p.hfxNr, p.name, p.adresse, p.plz, p.ort, p.telefon, p.email,
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
            placeholder="Suche nach Praxis, HFX-Nr., Ort oder E-Mail..."
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
                <th className="text-center w-16">Qodia</th>
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
                  <tr
                    key={`${praxis.source}-${praxis.id}`}
                    className="cursor-pointer"
                    onClick={() => openDetail(praxis)}
                  >
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
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {(() => {
                              const qodiaSynced = praxis.convertedFromLeadId
                                ? leadQodiaMap.byLeadId[praxis.convertedFromLeadId] ?? (praxis.hfxNr ? leadQodiaMap.byHfx[praxis.hfxNr] ?? false : false)
                                : (praxis.hfxNr ? leadQodiaMap.byHfx[praxis.hfxNr] ?? false : false);
                              return qodiaSynced
                                ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                : <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
                            })()}
                          </TooltipTrigger>
                          <TooltipContent>
                            {(() => {
                              const qodiaSynced = praxis.convertedFromLeadId
                                ? leadQodiaMap.byLeadId[praxis.convertedFromLeadId] ?? (praxis.hfxNr ? leadQodiaMap.byHfx[praxis.hfxNr] ?? false : false)
                                : (praxis.hfxNr ? leadQodiaMap.byHfx[praxis.hfxNr] ?? false : false);
                              return qodiaSynced ? "Bei Qodia registriert" : "Noch nicht bei Qodia registriert";
                            })()}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(praxis)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Details anzeigen
                          </DropdownMenuItem>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <DropdownMenuItem disabled>
                                    <Send className="h-4 w-4 mr-2" />
                                    Zugangsdaten senden
                                  </DropdownMenuItem>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Vorübergehend gesperrt: Der Versand setzt das Passwort nicht bei Qodia zurück. Bei Login-Problemen bitte an den Admin wenden.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedPraxis} onOpenChange={(open) => { if (!open) { setSelectedPraxis(null); setPraxisContracts([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {selectedPraxis?.name}
                </DialogTitle>
                {selectedPraxis?.hfxNr && (
                  <p className="text-xs font-mono text-muted-foreground pt-1">{selectedPraxis.hfxNr}</p>
                )}
              </div>
              {selectedPraxis?.email && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 mt-0.5"
                  disabled={sendingCredentialsId === selectedPraxis.id}
                  onClick={() => sendCredentials(selectedPraxis)}
                >
                  {sendingCredentialsId === selectedPraxis.id ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1.5" />
                  )}
                  Zugangsdaten senden
                </Button>
              )}
            </div>
          </DialogHeader>

          {selectedPraxis && (
            <div className="space-y-5 mt-1">
              {/* Customer Info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stammdaten</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  {selectedPraxis.arztName && (
                    <div className="flex items-start gap-2">
                      <UserCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Arzt / Inhaber</p>
                        <p className="font-medium text-foreground">{selectedPraxis.arztName}</p>
                      </div>
                    </div>
                  )}
                  {selectedPraxis.email && (
                    <div className="flex items-start gap-2">
                      <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">E-Mail</p>
                        <a href={`mailto:${selectedPraxis.email}`} className="font-medium text-foreground hover:text-primary hover:underline">
                          {selectedPraxis.email}
                        </a>
                      </div>
                    </div>
                  )}
                  {selectedPraxis.telefon && (
                    <div className="flex items-start gap-2">
                      <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Telefon</p>
                        <p className="font-medium text-foreground">{selectedPraxis.telefon}</p>
                      </div>
                    </div>
                  )}
                  {(selectedPraxis.adresse || selectedPraxis.ort) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Adresse</p>
                        <p className="font-medium text-foreground">
                          {selectedPraxis.adresse && <span>{selectedPraxis.adresse}<br /></span>}
                          {selectedPraxis.plz} {selectedPraxis.ort}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedPraxis.produkt && (
                    <div className="flex items-start gap-2">
                      <Package className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Produkt</p>
                        <p className="font-medium text-foreground">{selectedPraxis.produkt}</p>
                      </div>
                    </div>
                  )}
                  {selectedPraxis.preis > 0 && (
                    <div className="flex items-start gap-2">
                      <Euro className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Monatspreis</p>
                        <p className="font-medium text-foreground">{selectedPraxis.preis.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</p>
                      </div>
                    </div>
                  )}
                  {selectedPraxis.buchungsDatum && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Buchungsdatum</p>
                        <p className="font-medium text-foreground">
                          {new Date(selectedPraxis.buchungsDatum).toLocaleDateString("de-DE")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {selectedPraxis.module.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selectedPraxis.module.map((mod) => (
                      <span key={mod} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                        {mod}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Contracts Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Gebuchte Verträge
                  </h4>
                  {!loadingContracts && (
                    <span className="text-xs text-muted-foreground">{praxisContracts.length} {praxisContracts.length === 1 ? "Vertrag" : "Verträge"}</span>
                  )}
                </div>

                {loadingContracts ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : praxisContracts.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Keine Verträge gefunden</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Verträge werden über die HFX-Nr. oder E-Mail zugeordnet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {praxisContracts.map((contract) => {
                      const cfg = CONTRACT_STATUS_CONFIG[contract.status as keyof typeof CONTRACT_STATUS_CONFIG] || CONTRACT_STATUS_CONFIG.entwurf;
                      const StatusIcon = cfg.icon;
                      const isNachtrag = !!contract.parent_contract_id;
                      return (
                        <div key={contract.id} className="rounded-lg border bg-card p-3.5 space-y-2.5">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isNachtrag && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 bg-primary/5 rounded px-1.5 py-0.5">
                                    <GitMerge className="h-3 w-3" />
                                    Nachtrag
                                  </span>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {contract.product_name?.split(", ").map((p: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-xs font-normal px-2 py-0.5">
                                      {p}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {contract.selected_addon_modules?.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  + {contract.selected_addon_modules.join(", ")}
                                </p>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${cfg.class}`}>
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </div>

                          {/* Details row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Monatspreis</p>
                              <p className="font-semibold text-foreground tabular-nums">
                                {Number(contract.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                                {Number(contract.discount_percent) > 0 && (
                                  <span className="ml-1 text-success font-normal">(-{contract.discount_percent}%)</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Vertragsbeginn</p>
                              <p className="font-medium text-foreground">
                                {contract.start_date
                                  ? format(new Date(contract.start_date), "dd.MM.yyyy", { locale: de })
                                  : "–"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Zahlung</p>
                              <p className="font-medium text-foreground capitalize">{contract.payment_interval || "–"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Erfasst</p>
                              <p className="font-medium text-foreground">
                                {contract.created_at
                                  ? format(new Date(contract.created_at), "dd.MM.yy", { locale: de })
                                  : "–"}
                              </p>
                            </div>
                          </div>

                          {/* Email / Rechnungsemail */}
                          {(contract.email || contract.rechnungs_email) && (
                            <div className="flex flex-wrap gap-3 pt-1 border-t border-border/50 text-xs text-muted-foreground">
                              {contract.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <a href={`mailto:${contract.email}`} className="hover:text-primary hover:underline">{contract.email}</a>
                                  <span className="text-[10px] border border-border rounded px-1">Login</span>
                                </span>
                              )}
                              {contract.rechnungs_email && contract.rechnungs_email !== contract.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 shrink-0 opacity-60" />
                                  <a href={`mailto:${contract.rechnungs_email}`} className="hover:text-primary hover:underline">{contract.rechnungs_email}</a>
                                  <span className="text-[10px] border border-border rounded px-1">Rechnung</span>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Notes */}
                          {contract.notes && (
                            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                              {contract.notes.replace(/^\[Papier\]\s?/, "").replace(/^\[Nachtrag\]\s?/, "")}
                            </p>
                          )}

                          {/* Vertriebspartner */}
                          {contract.sales_partner_name && (
                            <p className="text-xs text-muted-foreground">
                              Vertrieb: <span className="text-foreground">{contract.sales_partner_name}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
