import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, FileText, MoreHorizontal, Pencil, Trash2, Upload, Download, Loader2, Eye, CheckCircle,
  FilePen, FileSignature, CircleCheck, CircleOff, ArchiveX, ShieldBan, ArrowUpDown, ArrowUp, ArrowDown,
  GitMerge, AlertTriangle, Send, Lightbulb,
} from "lucide-react";
// Check and ChevronsUpDown already imported above via combobox imports
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { generateContractPdf } from "@/lib/generateContractPdf";
import { fillContractTemplate } from "@/lib/fillContractTemplate";
import { openPdfBlob } from "@/lib/openPdfBlob";
import { validateIban } from "@/lib/validateIban";
import { validateBic } from "@/lib/validateBic";
import { lookupBicFromIban } from "@/lib/lookupBic";
import { buildStripeLineItems, hasStripeProducts } from "@/lib/stripeProducts";
import { logCustomerStatusChange } from "@/lib/customerEvents";
import { CreditCard } from "lucide-react"; // CreditCard used for payment section
import foxLogoUrl from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
// PaperContractDialog import removed – paper flow decommissioned

const validateBsnr = (value: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\s/g, "");
  if (!/^\d*$/.test(digits)) return "Nur Ziffern erlaubt";
  if (digits.length > 0 && digits.length !== 9) return "BSNR muss 9 Ziffern haben";
  if (digits.length === 9 && !digits.endsWith("00")) return "BSNR muss auf 00 enden";
  return null;
};

const validateLanr = (value: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\s/g, "");
  if (!/^\d*$/.test(digits)) return "Nur Ziffern erlaubt";
  if (digits.length > 0 && digits.length !== 9) return "LANR muss 9 Ziffern haben";
  return null;
};
import { useUserRole } from "@/hooks/useUserRole";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { KundenDialog } from "@/components/kunden/KundenDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

function AgbAcceptanceSection({ contractId }: { contractId: string }) {
  const [acceptance, setAcceptance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("agb_acceptances" as any)
      .select("*")
      .eq("contract_id", contractId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setAcceptance(data);
        setLoading(false);
      });
  }, [contractId]);

  if (loading) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">AGB-Zustimmung</h4>
      {acceptance ? (
        <div className="rounded-lg border bg-success/5 border-success/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success shrink-0" />
            <span className="text-sm font-medium text-foreground">AGB akzeptiert</span>
            <Badge variant="outline" className="text-xs ml-auto">v{acceptance.agb_version}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground pl-6">
            <span>Zeitpunkt:</span>
            <span className="text-foreground">
              {new Date(acceptance.accepted_at).toLocaleString("de-DE")}
            </span>
            <span>E-Mail:</span>
            <span className="text-foreground">{acceptance.customer_email || "–"}</span>
            <span>IP-Adresse:</span>
            <span className="text-foreground font-mono text-[11px]">{acceptance.ip_address || "–"}</span>
            <span>Browser:</span>
            <span className="text-foreground truncate" title={acceptance.user_agent}>
              {acceptance.user_agent?.substring(0, 60) || "–"}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Keine AGB-Zustimmung dokumentiert</span>
        </div>
      )}
    </div>
  );
}

// Role display labels
const roleLabels: Record<string, string> = {
  admin: "Admin",
  sales_lead: "Sales Lead",
  regional_lead: "Gebietsleiter",
  sales_partner: "Vertriebspartner",
  user: "Gebietsleiter",
  tippgeber: "Tippgeber",
};

// Searchable combobox for sales partner selection (excludes Tippgeber — they cannot be contract-responsible)
// Returns both user_id and full_name so contracts store the correct sales_partner_id.
function SalesPartnerCombobox({
  value,
  selectedId,
  onChange,
  profiles,
}: {
  value: string;
  selectedId: string;
  onChange: (id: string, name: string) => void;
  profiles: { user_id: string; full_name: string; email: string | null; role?: string | null; is_active?: boolean }[];
}) {
  // Exclude Tippgeber and inactive roles from selection
  const filteredProfiles = profiles.filter((p) => p.role !== "tippgeber" && p.is_active !== false);
  const [open, setOpen] = useState(false);
  const selected = filteredProfiles.find((p) => p.user_id === selectedId) || filteredProfiles.find((p) => p.full_name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span>{selected.full_name}</span>
              {selected.role && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                  {roleLabels[selected.role] || selected.role}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Vertriebspartner auswählen...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Name eingeben..." />
          <CommandList>
            <CommandEmpty>Kein Eintrag gefunden.</CommandEmpty>
            <CommandGroup>
              {[...filteredProfiles].sort((a, b) => a.full_name.localeCompare(b.full_name, "de")).map((p) => (
                <CommandItem
                  key={p.user_id}
                  value={p.full_name}
                  onSelect={() => {
                    if (selectedId === p.user_id) {
                      onChange("", "");
                    } else {
                      onChange(p.user_id, p.full_name);
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 shrink-0 ${selectedId === p.user_id ? "opacity-100" : "opacity-0"}`}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {p.email || "–"}
                      {p.role && ` · ${roleLabels[p.role] || p.role}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { CONTRACT_STATUS_CONFIG as statusConfig } from "@/lib/statusConfig";
import { changeContractStatus } from "@/lib/contractStatusActions";

const LOCKED_STATUSES = ["aktiv", "eingegangen", "gekuendigt", "beendet", "gesperrt", "gezeichnet"];
const isContractLocked = (status: string) => LOCKED_STATUSES.includes(status);


// Product options are now loaded from the database

type PaymentMethod = "stripe";

interface ContractFormData {
  customer_name: string;
  sales_partner_id: string;
  sales_partner_name: string;
  mp_nr: string;
  praxis: string;
  fachrichtung: string;
  rechtsform: string;
  vorname: string;
  nachname: string;
  praxisanschrift: string;
  adresse: string;
  plz: string;
  telefon: string;
  email: string;
  selected_products: string[];
  selected_modules: string[];
  license_count: number;
  bsnr_count: number;
  lanr_count: number;
  start_date: string;
  duration_months: number;
  cancellation_period_months: number;
  auto_renewal: boolean;
  monthly_price: number;
  one_time_fee: number;
  discount_percent: number;
  payment_interval: string;
  payment_method: PaymentMethod;
  kontoinhaber: string;
  kontoinhaber_strasse: string;
  kontoinhaber_plz_ort: string;
  bank_name: string;
  iban: string;
  bic: string;
  bsnr: string;
  lanr: string;
  lanr_2: string;
  lanr_3: string;
  weitere_bsnr_1: string;
  weitere_bsnr_2: string;
  weitere_bsnr_3: string;
  weitere_lanr: string;
  ort: string;
  notes: string;
  status: string;
  signature_data: string;
  vertrieb_signature_data: string;
  signature_mode: "digital" | "papier";
  praxissystem: string;
  stundenaufwand_pro_woche: string;
  rechnungs_email: string;
  rechnungs_email_identisch: boolean;
  mandate_accepted: boolean;
}

const emptyForm: ContractFormData = {
  customer_name: "",
  sales_partner_id: "",
  sales_partner_name: "",
  mp_nr: "",
  praxis: "",
  fachrichtung: "",
  rechtsform: "",
  vorname: "",
  nachname: "",
  praxisanschrift: "",
  adresse: "",
  plz: "",
  telefon: "",
  email: "",
  selected_products: [],
  selected_modules: [],
  license_count: 1,
  bsnr_count: 1,
  lanr_count: 3,
  start_date: new Date().toISOString().split("T")[0],
  duration_months: 0, // unbefristet
  cancellation_period_months: 6,
  auto_renewal: false,
  monthly_price: 0,
  one_time_fee: 0,
  discount_percent: 0,
  payment_interval: "monatlich",
  payment_method: "stripe" as PaymentMethod,
  kontoinhaber: "",
  kontoinhaber_strasse: "",
  kontoinhaber_plz_ort: "",
  bank_name: "",
  iban: "",
  bic: "",
  bsnr: "",
  lanr: "",
  lanr_2: "",
  lanr_3: "",
  weitere_bsnr_1: "",
  weitere_bsnr_2: "",
  weitere_bsnr_3: "",
  weitere_lanr: "",
  ort: "",
  notes: "",
  status: "eingegangen",
  signature_data: "",
  vertrieb_signature_data: "",
  signature_mode: "digital" as "digital" | "papier",
  praxissystem: "",
  stundenaufwand_pro_woche: "",
  rechnungs_email: "",
  rechnungs_email_identisch: true,
  mandate_accepted: true,
};

export default function Vertraege() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editingContract, setEditingContract] = useState<any | null>(null);
  const [form, setForm] = useState<ContractFormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [bicLoading, setBicLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [leadHfxNumber, setLeadHfxNumber] = useState<string | null>(null);
  const [forceCreateDuplicate, setForceCreateDuplicate] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [resendingConfirmationId, setResendingConfirmationId] = useState<string | null>(null);
  const [emailConfirmContract, setEmailConfirmContract] = useState<any | null>(null);
  const [syncingQodiaId, setSyncingQodiaId] = useState<string | null>(null);
  const [leadTippgeberName, setLeadTippgeberName] = useState<string | null>(null);
  const [deleteContractTarget, setDeleteContractTarget] = useState<any | null>(null);
  const { user, profile } = useAuth();
  const { isAdmin, isVertragsabteilung, isRegionalLead } = useUserRole();
  const { teamFilter, setTeamFilter, matchesTeamFilter, teamFilterOptions } = useRegionalTeam();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const syncLeadQodia = async (contract: any) => {
    if (!contract.hfx_customer_number) {
      toast({ title: "Keine HFX-Nummer", description: "Diesem Vertrag ist keine HFX-Kundennummer zugewiesen.", variant: "destructive" });
      return;
    }
    setSyncingQodiaId(contract.id);
    try {
      // Find the lead by hfx_customer_number
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, qodia_synced")
        .eq("hfx_customer_number", contract.hfx_customer_number)
        .maybeSingle();

      if (leadError || !lead) {
        toast({ title: "Lead nicht gefunden", description: `Kein Interessent mit HFX-Nr. ${contract.hfx_customer_number} gefunden.`, variant: "destructive" });
        return;
      }

      if (lead.qodia_synced) {
        toast({ title: "Bereits synchronisiert", description: `${contract.hfx_customer_number} ist bereits bei Qodia registriert.` });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("sync-lead-qodia", {
        body: { leadId: lead.id },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Qodia-Sync erfolgreich", description: data.message || `${contract.hfx_customer_number} erfolgreich bei Qodia registriert.` });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: ["leads-qodia-map"] });
      } else {
        toast({ title: "Qodia-Fehler", description: data?.error || "Unbekannter Fehler", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setSyncingQodiaId(null);
    }
  };
  const location = useLocation();
  // Also store lead_id for back-linking
  const [fromLeadId, setFromLeadId] = useState<string | null>(null);
  const [sendingBuchungsmail, setSendingBuchungsmail] = useState<string | null>(null);
  const [autoOpenContractId, setAutoOpenContractId] = useState<string | null>(null);
  const [kundenDialogHfx, setKundenDialogHfx] = useState<string | null>(null);

  // ── Read URL params on mount: auto-open dialog with lead prefill ──────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const leadId = params.get("leadId");
    const contractId = params.get("contractId");

    if (leadId) {
      // Fetch lead and prefill form
      (async () => {
        const { data: lead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadId)
          .maybeSingle();
        if (!lead) return;
        setFromLeadId(leadId);
        setLeadHfxNumber(lead.hfx_customer_number || null);

        // Resolve assigned sales partner name
        let partnerName = "";
        if (lead.assigned_to) {
          const { data: partnerProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", lead.assigned_to)
            .maybeSingle();
          if (partnerProfile) partnerName = partnerProfile.full_name;
        }

        // Resolve tippgeber name
        const tippgeberId = lead.tippgeber_id;
        if (tippgeberId) {
          const { data: tippProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", tippgeberId)
            .maybeSingle();
          setLeadTippgeberName(tippProfile?.full_name || null);
        } else {
          // Check tipp_leads table for match
          const { data: tippMatch } = await supabase
            .from("tipp_leads")
            .select("created_by")
            .or(`email.eq.${lead.email},praxis_name.eq.${lead.praxis_name}`)
            .limit(1);
          if (tippMatch && tippMatch.length > 0) {
            const { data: tippProfile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", tippMatch[0].created_by)
              .maybeSingle();
            setLeadTippgeberName(tippProfile?.full_name || null);
          } else {
            setLeadTippgeberName(null);
          }
        }

        setForm({
          ...emptyForm,
          praxis: lead.praxis_name || "",
          vorname: lead.vorname || "",
          nachname: lead.nachname || "",
          email: lead.email || "",
          plz: lead.plz || "",
          ort: lead.ort || "",
          adresse: lead.adresse || "",
          praxisanschrift: lead.adresse || "",
          telefon: lead.mobilnummer || "",
          sales_partner_id: lead.assigned_to || "",
          sales_partner_name: partnerName,
        });
        setDialogOpen(true);
      })();
    } else if (contractId) {
      // Will be handled when contracts are loaded — store for deferred open
      setAutoOpenContractId(contractId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Open contract edit dialog once contracts are loaded and autoOpenContractId is set
  useEffect(() => {
    if (autoOpenContractId && contracts.length > 0) {
      const c = contracts.find((x: any) => x.id === autoOpenContractId);
      if (c) {
        openEdit(c);
        setAutoOpenContractId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenContractId, contracts]);

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data || []) {
        map[p.user_id] = p.full_name;
      }
      return map;
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["sales-profiles-with-roles"],
    queryFn: async () => {
      // First get user_ids with sales-relevant roles (including is_active)
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role, is_active")
        .in("role", ["sales_partner", "user", "sales_lead", "regional_lead", "admin", "tippgeber"]);
      if (roleError) throw roleError;
      const roleMap: Record<string, string> = {};
      const activeMap: Record<string, boolean> = {};
      for (const r of roleData || []) {
        roleMap[r.user_id] = r.role;
        activeMap[r.user_id] = r.is_active ?? true;
      }
      const salesUserIds = Object.keys(roleMap);
      if (salesUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", salesUserIds)
        .order("full_name");
      if (error) throw error;
      return (data || []).map((p) => ({ ...p, role: roleMap[p.user_id] || null, is_active: activeMap[p.user_id] ?? true }));
    },
  });

  // Map hfx_customer_number -> qodia_synced for status icons
  const { data: leadQodiaMap = {} } = useQuery({
    queryKey: ["leads-qodia-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("hfx_customer_number, qodia_synced")
        .not("hfx_customer_number", "is", null);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const l of data || []) {
        if (l.hfx_customer_number) map[l.hfx_customer_number] = l.qodia_synced;
      }
      return map;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Find the EBM product ID to load its modules
  const ebmProduct = products.find((p: any) => p.name === "HFX EBM");

  const { data: ebmModules = [] } = useQuery({
    queryKey: ["product-modules-ebm", ebmProduct?.id],
    queryFn: async () => {
      if (!ebmProduct?.id) return [];
      const { data, error } = await supabase
        .from("product_modules")
        .select("*")
        .eq("product_id", ebmProduct.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!ebmProduct?.id,
  });

  // ── Dubletten-Prüfung beim Vertrag-Anlegen ───────────────────────────────
  // Strong criteria (any one match = potential duplicate):
  //   1. hfx_customer_number exact (top — Lead-Konvertierung gegen Stammvertrag)
  //   2. email exact (case-insensitive)
  //   3. praxis exact (case-insensitive, getrimmt)
  // Weak (only as additional reason): praxis fuzzy substring, plz+adresse exact.
  // Skip when editing (would self-match).
  const dupHfx = (leadHfxNumber ?? "").trim();
  const dupEmail = (form.email ?? "").trim().toLowerCase();
  const dupPraxis = (form.praxis ?? "").trim().toLowerCase();
  const dupPlz = (form.plz ?? "").trim();
  const dupAdresse = (form.adresse ?? "").trim().toLowerCase();

  const { data: contractDuplicates = [] } = useQuery({
    queryKey: ["contract-duplicates", dupHfx, dupEmail, dupPraxis, dupPlz, dupAdresse, editId],
    enabled: dialogOpen && !editId && (!!dupHfx || !!dupEmail || !!dupPraxis),
    queryFn: async () => {
      const filters: string[] = [];
      if (dupHfx) filters.push(`hfx_customer_number.eq.${dupHfx}`);
      if (dupEmail) filters.push(`email.eq.${dupEmail}`);
      if (dupPlz) filters.push(`plz.eq.${dupPlz}`);
      if (filters.length === 0) return [];

      const { data, error } = await supabase
        .from("contracts")
        .select("id, hfx_customer_number, contract_number, praxis, vorname, nachname, email, plz, adresse, status, created_at, parent_contract_id")
        .or(filters.join(","))
        .is("parent_contract_id", null)
        .limit(50);
      if (error) throw error;

      const out: Array<{ row: any; reasons: string[] }> = [];
      for (const row of (data ?? [])) {
        const reasons: string[] = [];
        if (dupHfx && row.hfx_customer_number === dupHfx) reasons.push("HFX-Nummer");
        if (dupEmail && row.email?.toLowerCase() === dupEmail) reasons.push("E-Mail");
        if (dupPraxis && row.praxis?.trim().toLowerCase() === dupPraxis) reasons.push("Praxisname");
        if (
          dupPraxis && !reasons.includes("Praxisname") &&
          row.praxis && (row.praxis.toLowerCase().includes(dupPraxis) || dupPraxis.includes(row.praxis.toLowerCase()))
        ) reasons.push("ähnlicher Praxisname");
        if (
          dupPlz && dupAdresse && row.plz === dupPlz &&
          row.adresse?.trim().toLowerCase() === dupAdresse
        ) reasons.push("PLZ + Adresse");
        const hasStrong = reasons.some((r) => ["HFX-Nummer", "E-Mail", "Praxisname"].includes(r));
        if (hasStrong) out.push({ row, reasons });
      }
      return out.sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 10);
    },
  });

  const hasContractDuplicates = contractDuplicates.length > 0;
  const isProductiveSave = form.status !== "entwurf";
  const blockOnDuplicate = !editId && hasContractDuplicates && isProductiveSave && !forceCreateDuplicate;
  const upsertMutation = useMutation({
    mutationFn: async (data: ContractFormData): Promise<string | null> => {
      if (!user?.id) throw new Error("Nicht authentifiziert – bitte neu einloggen.");

      // Stripe-Mandat-Prüfung bei Aktivierung eines bestehenden Vertrags (Edit)
      if (data.status === "aktiv" && editId) {
        const existingContract = contracts.find((c: any) => c.id === editId);
        if (existingContract && !existingContract.stripe_customer_id) {
          throw new Error("SEPA_MANDATE_MISSING");
        }
      }

      let documentUrl: string | undefined;
      let documentName: string | undefined;

      // Upload document if provided
      if (file) {
        const filePath = `${user?.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("contracts")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // Store file path instead of public URL (bucket is private)
        documentUrl = filePath;
        documentName = file.name;
      }

      const sigData = data.signature_data || null;
      const vertriebSigData = data.vertrieb_signature_data || null;

      const record = {
        customer_name: `${data.vorname} ${data.nachname}`.trim() || data.praxis || "Entwurf",
        sales_partner_id: data.sales_partner_id || null,
        sales_partner_name: data.sales_partner_name || null,
        mp_nr: data.mp_nr || null,
        praxis: data.praxis || null,
        fachrichtung: data.fachrichtung || null,
        vorname: data.vorname || null,
        nachname: data.nachname || null,
        praxisanschrift: data.praxisanschrift || null,
        adresse: data.adresse || null,
        telefon: data.telefon || null,
        email: data.email || null,
        signature_data: sigData || null,
        vertrieb_signature_data: vertriebSigData || null,
        product_name: data.selected_products.join(", ") || "Entwurf",
        modules: data.selected_products,
        license_count: data.license_count,
        start_date: data.start_date,
        duration_months: 0, // unbefristet
        end_date: "2099-12-31",
        cancellation_period_months: 6,
        auto_renewal: false,
        monthly_price: data.monthly_price,
        one_time_fee: data.one_time_fee,
        discount_percent: data.discount_percent,
        payment_interval: data.payment_interval,
        notes: data.notes ? (data.signature_mode === "papier" ? `[Papier] ${data.notes}` : data.notes) : (data.signature_mode === "papier" ? "[Papier]" : null),
        kontoinhaber: data.kontoinhaber || null,
        kontoinhaber_strasse: data.kontoinhaber_strasse || null,
        kontoinhaber_plz_ort: data.kontoinhaber_plz_ort || null,
        bank_name: data.bank_name || null,
        iban: data.iban || null,
        bic: data.bic || null,
        bsnr: data.bsnr || null,
        lanr: [data.lanr, data.lanr_2, data.lanr_3].filter(Boolean).join(", ") || null,
        weitere_bsnr: [data.weitere_bsnr_1, data.weitere_bsnr_2, data.weitere_bsnr_3].filter(Boolean).join(", ") || null,
        weitere_lanr: data.weitere_lanr || null,
        rechtsform: data.rechtsform || null,
        ort: data.ort || null,
        plz: data.plz || null,
        status: data.status,
        created_by: user?.id,
        praxissystem: data.praxissystem || null,
        stundenaufwand_pro_woche: data.stundenaufwand_pro_woche || null,
        rechnungs_email: data.rechnungs_email || null,
        selected_addon_modules: data.selected_modules.length > 0 ? data.selected_modules : [],
        bsnr_count: data.bsnr_count,
        lanr_count: data.lanr_count,
        qodia_unit_price: (data as any).qodia_unit_price ?? 0.99,
        ...(data.mandate_accepted && !editId ? { mandate_accepted_at: new Date().toISOString() } : {}),
        ...(documentUrl ? { document_url: documentUrl, document_name: documentName } : {}),
        ...(leadHfxNumber && !editId ? { hfx_customer_number: leadHfxNumber } : {}),
        ...(data.selected_products.includes("HFX EBM") && !editId
          ? (() => {
              const s = data.start_date ? new Date(data.start_date) : new Date();
              const qEnd = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3 + 3, 0);
              const yyyy = qEnd.getFullYear();
              const mm = String(qEnd.getMonth() + 1).padStart(2, "0");
              const dd = String(qEnd.getDate()).padStart(2, "0");
              return { base_fee_waived: true, base_fee_waived_until: `${yyyy}-${mm}-${dd}` };
            })()
          : {}),
      };

      let contractId = editId;
      let previousContractStatus: string | null = null;
      if (editId) {
        // Capture old status BEFORE update for customer_events log (edit only)
        const { data: before } = await supabase
          .from("contracts")
          .select("status")
          .eq("id", editId)
          .maybeSingle();
        previousContractStatus = (before as any)?.status ?? null;
        const { error } = await supabase.from("contracts").update(record).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("contracts").insert(record).select("id").single();
        if (error) throw error;
        contractId = inserted.id;
      }

      // Log status change (edit only, only if status actually changed) — fire-and-forget
      if (editId && contractId && previousContractStatus && previousContractStatus !== data.status) {
        logCustomerStatusChange({
          eventType: "CONTRACT_STATUS_CHANGED",
          entityType: "contract",
          entityId: contractId,
          oldStatus: previousContractStatus,
          newStatus: data.status,
          source: "vertraege_save",
          hfxCustomerNumber: (record as any).hfx_customer_number ?? null,
          contractId,
          createdBy: user?.id ?? null,
        });
      }

      // Log signature audit trail for active contracts
      if (data.status !== "entwurf" && contractId && (sigData || vertriebSigData)) {
        const auditEntries = [];
        const userAgent = navigator.userAgent;
        const customerName = [data.vorname, data.nachname].filter(Boolean).join(" ") || data.praxis || "";
        
        // Create a simple hash of the signature data for integrity verification
        const hashData = async (text: string) => {
          const encoder = new TextEncoder();
          const dataBuffer = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
          return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
        };

        if (sigData) {
          const sigHash = await hashData(sigData);
          auditEntries.push({
            contract_id: contractId,
            signer_type: "customer" as const,
            signer_name: customerName,
            signer_email: data.email || null,
            user_agent: userAgent,
            signature_data_hash: sigHash,
            created_by: user?.id,
          });
        }
        if (vertriebSigData) {
          const sigHash = await hashData(vertriebSigData);
          auditEntries.push({
            contract_id: contractId,
            signer_type: "vertrieb" as const,
            signer_name: data.sales_partner_name || profile?.full_name || "",
            signer_email: profile?.email || null,
            user_agent: userAgent,
            signature_data_hash: sigHash,
            created_by: user?.id,
          });
        }

        if (auditEntries.length > 0) {
          const { error: auditError } = await supabase.from("signature_audit_logs").insert(auditEntries);
          if (auditError) console.error("Signature audit log error:", auditError);
        }
      }

      return contractId;
    },
    onSuccess: async (contractId, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: editId ? "Vertrag aktualisiert" : "Vertrag erstellt" });

      // Shared helper: upsert customers entry, update contract FK, create case, convert lead
      const activateContract = async (hfxNr: string | null, praxisData: {
        name: string; adresse?: string | null; plz?: string | null; ort?: string | null;
        telefon?: string | null; email?: string | null; mp_nr?: string | null;
        produkt?: string | null; module?: string[]; preis?: number; buchungs_datum?: string;
        converted_from_lead_id?: string | null;
        vorname?: string | null; nachname?: string | null; bsnr?: string | null; lanr?: string | null;
      }, cId: string) => {
        // Convert linked lead to "kunde" — capture old status for customer_events log
        if (hfxNr) {
          const { data: leadBefore } = await supabase
            .from("leads")
            .select("id, status")
            .eq("hfx_customer_number", hfxNr)
            .maybeSingle();
          await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", hfxNr);
          if (leadBefore?.id && leadBefore.status && leadBefore.status !== "kunde") {
            logCustomerStatusChange({
              eventType: "LEAD_STATUS_CHANGED",
              entityType: "lead",
              entityId: leadBefore.id,
              oldStatus: leadBefore.status,
              newStatus: "kunde",
              source: "vertraege_activate_contract",
              hfxCustomerNumber: hfxNr,
              leadId: leadBefore.id,
              contractId: cId,
              createdBy: user?.id ?? null,
            });
          }
        }

        // Upsert customer record
        let customerId: string | null = null;
        if (hfxNr) {
          const { data: existingCust } = await (supabase as any)
            .from("customers")
            .select("id")
            .eq("hfx_customer_number", hfxNr)
            .maybeSingle();

          if (existingCust) {
            customerId = existingCust.id;
          } else {
            const { data: newCust } = await (supabase as any)
              .from("customers")
              .insert({
                hfx_customer_number: hfxNr,
                praxis_name: praxisData.name,
                vorname: praxisData.vorname || null,
                nachname: praxisData.nachname || null,
                email: praxisData.email || null,
                telefon: praxisData.telefon || null,
                adresse: praxisData.adresse || null,
                plz: praxisData.plz || null,
                ort: praxisData.ort || null,
                bsnr: praxisData.bsnr || null,
                lanr: praxisData.lanr || null,
              })
              .select("id")
              .single();
            customerId = newCust?.id ?? null;
          }
        }

        // Link contract to customer
        if (customerId && cId) {
          await supabase.from("contracts").update({ customer_id: customerId }).eq("id", cId);
        }

        // Create neuabschluss case
        if (cId) {
          await (supabase as any).from("contract_cases").insert({
            customer_id: customerId,
            contract_id: cId,
            case_type: "neuabschluss",
            status: "abgeschlossen",
            title: `Neuabschluss – ${praxisData.produkt || praxisData.name}`,
            created_by: user?.id,
          });
        }

        // Create praxen entry if not exists (legacy compatibility)
        const existingPraxen = hfxNr
          ? await supabase.from("praxen").select("id").eq("mp_nr", hfxNr).maybeSingle()
          : { data: null };
        if (!existingPraxen.data) {
          await supabase.from("praxen").insert({ ...praxisData, status: "aktiv" });
          queryClient.invalidateQueries({ queryKey: ["praxen"] });
          toast({ title: "✅ Kunde angelegt", description: `${praxisData.name} wurde erfolgreich als Kunden hinterlegt.` });
        }
        queryClient.invalidateQueries({ queryKey: ["leads", "customers"] });
      };

      // When a new contract is signed (status = aktiv), auto-create customers + case
      if (!editId && variables.status === "aktiv" && contractId) {
        // Set approved_by/approved_at
        await supabase.from("contracts").update({
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        }).eq("id", contractId);

        const hfxNr = leadHfxNumber || variables.mp_nr || null;
        await activateContract(hfxNr, {
          name: variables.praxis || `${variables.vorname} ${variables.nachname}`.trim() || "Unbekannt",
          vorname: variables.vorname || null,
          nachname: variables.nachname || null,
          adresse: variables.praxisanschrift || variables.adresse || null,
          plz: variables.plz || null,
          ort: variables.ort || null,
          telefon: variables.telefon || null,
          email: variables.email || null,
          mp_nr: hfxNr,
          bsnr: variables.bsnr || null,
          lanr: variables.lanr || null,
          produkt: variables.selected_products.join(", ") || null,
          module: variables.selected_products,
          preis: variables.monthly_price || 0,
          buchungs_datum: variables.start_date || new Date().toISOString().split("T")[0],
          converted_from_lead_id: fromLeadId || null,
        }, contractId);
      }

      // For new contracts with status "eingegangen": trigger SEPA-Mandat-Mail (Mail 1)
      // The customer receives an activation link; status stays "eingegangen" until webhook confirms.
      if (!editId && variables.status === "eingegangen" && contractId && variables.email) {
        try {
          const { error: mailError } = await supabase.functions.invoke("send-mandate-setup", {
            body: { contract_id: contractId },
          });
          if (mailError) throw mailError;
          toast({ title: "✅ SEPA-Mandat-Mail gesendet", description: `SEPA-Aktivierungslink an ${variables.email} gesendet. Vertrag steht auf „Versendet, wartet auf Mandat".` });
        } catch (emailErr: any) {
          console.error("Mandate setup email error:", emailErr);
          toast({ title: "SEPA-Mandat-Mail konnte nicht gesendet werden", description: emailErr.message, variant: "destructive" });
        }
      }

      // Auto-open contract summary PDF after creating a new contract (only if not a draft)
      if (!editId && variables.status !== "entwurf") {
        handlePreviewPdf(form);
        // Send contract PDF email to sales partner
        if (profile?.email) {
          try {
            const templateRes = await fetch("/templates/vertrag-honorarfuchs.pdf");
            const templateBytes = await templateRes.arrayBuffer();
            let sigData = form.signature_data;
            const vertriebSigData = form.vertrieb_signature_data;
            const pdfBytes = await fillContractTemplate(templateBytes, {
              mp_nr: form.mp_nr, praxis: form.praxis, fachrichtung: form.fachrichtung,
              rechtsform: form.rechtsform, vorname: form.vorname, nachname: form.nachname,
              adresse: form.adresse, praxisanschrift: form.praxisanschrift, plz: form.plz,
              telefon: form.telefon, email: form.email,
              kontoinhaber: form.kontoinhaber, kontoinhaber_strasse: form.kontoinhaber_strasse,
              kontoinhaber_plz_ort: form.kontoinhaber_plz_ort, bank_name: form.bank_name,
              iban: form.iban, bic: form.bic, bsnr: form.bsnr,
              lanr: [form.lanr, form.lanr_2, form.lanr_3].filter(Boolean).join(", "),
              weitere_bsnr: [form.weitere_bsnr_1, form.weitere_bsnr_2, form.weitere_bsnr_3].filter(Boolean).join(", "),
              weitere_lanr: form.weitere_lanr, ort: form.ort,
              monthly_price: form.monthly_price, start_date: form.start_date,
              end_date: "2099-12-31",
              modules: form.selected_products, duration_months: 0,
              notes: form.notes, signature_data: sigData, vertrieb_signature_data: vertriebSigData,
              praxissystem: form.praxissystem, stundenaufwand_pro_woche: form.stundenaufwand_pro_woche,
              selected_addon_modules: form.selected_modules,
            });
            const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
            const customerName = [form.vorname, form.nachname].filter(Boolean).join(" ");
            await supabase.functions.invoke("send-contract-email", {
              body: {
                email: null,
                salesPartnerEmail: profile?.email || null,
                customerName,
                pdfBase64,
                products: form.selected_products.join(", "),
                startDate: form.start_date,
              },
            });
          } catch (emailErr: any) {
            console.error("Email send error:", emailErr);
          }
        }
      }
      closeDialog();
    },
    onError: (err: Error) => {
      console.error("upsertMutation error:", err);
      if (err.message === "SEPA_MANDATE_MISSING") {
        toast({
          title: "⚠️ SEPA-Mandat fehlt",
          description: "Dieser Vertrag kann nicht aktiviert werden, da noch kein SEPA-Zahlungsmandat (Stripe) hinterlegt ist. Der Kunde erhält beim nächsten Abrechnungslauf automatisch einen Einrichtungslink.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Fehler beim Speichern", description: err.message || "Unbekannter Fehler – bitte erneut versuchen.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Vertrag gelöscht" });
    },
  });

  const uploadDocument = async (contractId: string, uploadFile: File) => {
    setUploadingId(contractId);
    try {
      const filePath = `${user?.id}/${crypto.randomUUID()}-${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(filePath, uploadFile);
      if (uploadError) throw uploadError;

      // Store file path instead of public URL (bucket is private)
      const { error: updateError } = await supabase
        .from("contracts")
        .update({ document_url: filePath, document_name: uploadFile.name })
        .eq("id", contractId);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Dokument hochgeladen", description: uploadFile.name });
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };




  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setEditingContract(null);
    setLeadHfxNumber(null);
    setForceCreateDuplicate(false);
    setLeadTippgeberName(null);
    setFromLeadId(null);
    setForm(emptyForm);
    setFile(null);
    setShowErrors(false);
  };

  const openEdit = (contract: any) => {
    setEditId(contract.id);
    setEditingContract(contract);
    setForm({
      customer_name: contract.customer_name,
      sales_partner_id: contract.sales_partner_id || "",
      sales_partner_name: contract.sales_partner_name || "",
      mp_nr: contract.mp_nr || "",
      praxis: contract.praxis || "",
      fachrichtung: contract.fachrichtung || "",
      rechtsform: contract.rechtsform || "",
      vorname: contract.vorname || "",
      nachname: contract.nachname || "",
      praxisanschrift: contract.praxisanschrift || "",
      adresse: contract.adresse || "",
      plz: contract.plz || "",
      telefon: contract.telefon || "",
      email: contract.email || "",
      selected_products: contract.modules?.length > 0 ? contract.modules : (contract.product_name ? [contract.product_name] : []),
      selected_modules: contract.selected_addon_modules || [],
      license_count: contract.license_count,
      bsnr_count: contract.bsnr_count ?? 1,
      lanr_count: contract.lanr_count ?? 3,
      start_date: contract.start_date,
      duration_months: contract.duration_months,
      cancellation_period_months: contract.cancellation_period_months,
      auto_renewal: contract.auto_renewal,
      monthly_price: contract.monthly_price,
      one_time_fee: contract.one_time_fee,
      discount_percent: contract.discount_percent,
      payment_interval: contract.payment_interval,
      payment_method: "stripe" as PaymentMethod,
      notes: (contract.notes || "").replace(/^\[Papier\]\s?/, ""),
      kontoinhaber: contract.kontoinhaber || "",
      kontoinhaber_strasse: contract.kontoinhaber_strasse || "",
      kontoinhaber_plz_ort: contract.kontoinhaber_plz_ort || "",
      bank_name: contract.bank_name || "",
      iban: contract.iban || "",
      bic: contract.bic || "",
      bsnr: contract.bsnr || "",
      lanr: (contract.lanr || "").split(",").map((s: string) => s.trim())[0] || "",
      lanr_2: (contract.lanr || "").split(",").map((s: string) => s.trim())[1] || "",
      lanr_3: (contract.lanr || "").split(",").map((s: string) => s.trim())[2] || "",
      weitere_bsnr_1: (contract.weitere_bsnr || "").split(",").map((s: string) => s.trim())[0] || "",
      weitere_bsnr_2: (contract.weitere_bsnr || "").split(",").map((s: string) => s.trim())[1] || "",
      weitere_bsnr_3: (contract.weitere_bsnr || "").split(",").map((s: string) => s.trim())[2] || "",
      weitere_lanr: contract.weitere_lanr || "",
      ort: contract.ort || "",
      status: contract.status,
      signature_data: contract.signature_data || "",
      vertrieb_signature_data: contract.vertrieb_signature_data || "",
      signature_mode: (contract.notes?.startsWith("[Papier]") ? "papier" : "digital") as "digital" | "papier",
      praxissystem: contract.praxissystem || "",
      stundenaufwand_pro_woche: contract.stundenaufwand_pro_woche || "",
      rechnungs_email: contract.rechnungs_email || "",
      rechnungs_email_identisch: false,
      mandate_accepted: !!contract.mandate_accepted_at,
    });
    setDialogOpen(true);
  };

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // Pre-System-Filter: aktiv && stripe_customer_id IS NULL. Bewusst scharf — eingegangen/gezeichnet
  // ohne Stripe-ID ist Normalzustand in der Mandat-Phase und kein Pre-System-Bug.
  const [preSystemFilter, setPreSystemFilter] = useState(false);
  const [sortField, setSortField] = useState<"created_at" | "updated_at">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Extension / Nachtrag dialog state
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionBaseContract, setExtensionBaseContract] = useState<any | null>(null);
  const [extensionForm, setExtensionForm] = useState({
    product_name: "",
    start_date: new Date().toISOString().split("T")[0],
    monthly_price: 0,
    one_time_fee: 0,
    notes: "",
    status: "entwurf" as string,
  });
  const [extensionSaving, setExtensionSaving] = useState(false);

  const openExtensionDialog = (contract: any) => {
    setExtensionBaseContract(contract);
    setExtensionForm({
      product_name: "",
      start_date: new Date().toISOString().split("T")[0],
      monthly_price: 0,
      one_time_fee: 0,
      notes: "",
      status: "entwurf",
    });
    setExtensionDialogOpen(true);
  };

  const handleSaveExtension = async (asActive: boolean) => {
    if (!extensionBaseContract || !user?.id) return;
    if (!extensionForm.product_name.trim()) {
      toast({ title: "Pflichtfeld fehlt", description: "Bitte ein Produkt / Leistung angeben.", variant: "destructive" });
      return;
    }
    setExtensionSaving(true);
    try {
      const base = extensionBaseContract;
      const { error } = await supabase.from("contracts").insert({
        parent_contract_id: base.id,
        customer_name: base.customer_name,
        sales_partner_id: base.sales_partner_id,
        sales_partner_name: base.sales_partner_name || null,
        mp_nr: base.mp_nr || null,
        hfx_customer_number: base.hfx_customer_number || null,
        customer_id: base.customer_id || null,
        praxis: base.praxis || null,
        fachrichtung: base.fachrichtung || null,
        vorname: base.vorname || null,
        nachname: base.nachname || null,
        praxisanschrift: base.praxisanschrift || null,
        adresse: base.adresse || null,
        plz: base.plz || null,
        ort: base.ort || null,
        telefon: base.telefon || null,
        email: base.email || null,
        rechnungs_email: base.rechnungs_email || null,
        rechtsform: base.rechtsform || null,
        kontoinhaber: base.kontoinhaber || null,
        kontoinhaber_strasse: base.kontoinhaber_strasse || null,
        kontoinhaber_plz_ort: base.kontoinhaber_plz_ort || null,
        bank_name: base.bank_name || null,
        iban: base.iban || null,
        bic: base.bic || null,
        product_name: extensionForm.product_name,
        modules: [extensionForm.product_name],
        monthly_price: extensionForm.monthly_price,
        one_time_fee: extensionForm.one_time_fee,
        start_date: extensionForm.start_date,
        end_date: "2099-12-31",
        duration_months: 0, // unbefristet
        cancellation_period_months: 6,
        auto_renewal: false,
        discount_percent: 0,
        payment_interval: base.payment_interval || "monatlich",
        notes: extensionForm.notes ? `[Nachtrag] ${extensionForm.notes}` : "[Nachtrag]",
        status: asActive ? "aktiv" : "entwurf",
        created_by: user.id,
      } as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Nachtrag erstellt", description: `Vertragserweiterung für ${base.customer_name} gespeichert.` });
      setExtensionDialogOpen(false);
      setExtensionBaseContract(null);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setExtensionSaving(false);
    }
  };

  const handleSort = (field: "created_at" | "updated_at") => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = contracts
    .filter((c: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        c.customer_name?.toLowerCase().includes(q) ||
        c.product_name?.toLowerCase().includes(q) ||
        c.sales_partner_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.rechnungs_email?.toLowerCase().includes(q);
      const matchesStatus = statusFilter ? c.status === statusFilter : true;
      const matchesPreSystem = preSystemFilter
        ? c.status === "aktiv" && !c.stripe_customer_id
        : true;
      const matchesTeam = isRegionalLead
        ? matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by)
        : true;
      return matchesSearch && matchesStatus && matchesPreSystem && matchesTeam;
    })
    .sort((a: any, b: any) => {
      const aVal = new Date(a[sortField] || 0).getTime();
      const bVal = new Date(b[sortField] || 0).getTime();
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

  const handleStatusChange = async (contractId: string, newStatus: string) => {
    const c = contracts.find((ct: any) => ct.id === contractId);
    if (!c) return;
    const result = await changeContractStatus({
      contractId,
      newStatus,
      oldStatus: c.status ?? null,
      hfxCustomerNumber: c.hfx_customer_number ?? null,
      userId: user?.id ?? null,
      queryClient,
      contract: c as any,
      source: "vertraege_page",
    });
    if (!result.success) {
      const isMandate = /SEPA|Mandat/i.test(result.error ?? "");
      toast({
        title: isMandate ? "⚠️ SEPA-Mandat fehlt" : "Fehler beim Statuswechsel",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    if (result.praxenCreated) {
      toast({
        title: "✅ Kunde angelegt",
        description: `${c.praxis || c.customer_name} wurde erfolgreich als Kunden hinterlegt.`,
      });
    }
    toast({
      title: "Status aktualisiert",
      description: `Status auf „${statusConfig[newStatus as keyof typeof statusConfig]?.label ?? newStatus}" gesetzt.`,
    });
  };


  const baseRequiredFieldLabels: Record<string, string> = {
    praxis: "Praxis",
    vorname: "Vorname",
    nachname: "Nachname",
    praxisanschrift: "Adresse (Straße, Hausnummer)",
    plz: "PLZ",
    ort: "Ort",
    
    start_date: "Vertragsbeginn",
  };

  const requiredFieldLabels: Record<string, string> = {
    ...baseRequiredFieldLabels,
  };

  const requiredFields = Object.keys(requiredFieldLabels) as (keyof ContractFormData)[];

  const getMissingFields = () => {
    const missing: string[] = [];
    requiredFields.forEach((f) => {
      const v = form[f];
      const empty = typeof v === "string" ? v.trim() === "" : !v;
      if (empty) missing.push(requiredFieldLabels[f]);
    });
    if (form.selected_products.length === 0) missing.push("Produkte");
    return missing;
  };

  const isFormComplete = getMissingFields().length === 0;

  // Helper: returns true if showErrors is active and this required field is empty
  const fieldErr = (key: keyof ContractFormData) => {
    if (!showErrors) return false;
    if (!(key in requiredFieldLabels)) return false;
    const v = form[key];
    return typeof v === "string" ? v.trim() === "" : !v;
  };

  const handleSaveDraft = () => {
    if (upsertMutation.isPending) return; // Doppelklick-Schutz
    const hasMinimum = form.praxis.trim() !== "" || form.vorname.trim() !== "" || form.nachname.trim() !== "";
    if (!hasMinimum) {
      toast({ title: "Mindestangabe fehlt", description: "Bitte mindestens Praxis oder einen Namen angeben.", variant: "destructive" });
      return;
    }
    const draftForm = { ...form, status: "entwurf" };
    upsertMutation.mutate(draftForm);
  };

  const [sendingBuchungsmailDialog, setSendingBuchungsmailDialog] = useState(false);

  const handleSaveWithBuchungsmail = async () => {
    if (upsertMutation.isPending || sendingBuchungsmailDialog) return; // Doppelklick-Schutz
    if (blockOnDuplicate) {
      toast({ title: "Möglicher Vertrags-Dublette gefunden", description: 'Bitte Hinweis im Dialog beachten oder „Trotzdem anlegen" bestätigen.', variant: "destructive" });
      return;
    }
    if (!form.email) {
      toast({ title: "E-Mail fehlt", description: "Bitte eine E-Mail-Adresse hinterlegen, damit die SEPA-Mandat-Mail gesendet werden kann.", variant: "destructive" });
      return;
    }
    const hasMinimum = form.praxis.trim() !== "" || form.vorname.trim() !== "" || form.nachname.trim() !== "";
    if (!hasMinimum) {
      toast({ title: "Mindestangabe fehlt", description: "Bitte mindestens Praxis oder einen Namen angeben.", variant: "destructive" });
      return;
    }
    setSendingBuchungsmailDialog(true);
    try {
      // Save as "eingegangen"
      const eingegangeneForm = { ...form, status: "eingegangen" };
      let contractId: string | null = editId;
      if (editId) {
        const { error } = await supabase.from("contracts").update({
          status: "eingegangen",
          email: form.email || null,
          praxis: form.praxis || null,
          vorname: form.vorname || null,
          nachname: form.nachname || null,
          product_name: form.selected_products.join(", ") || "Entwurf",
          modules: form.selected_products,
          monthly_price: form.monthly_price,
          plz: form.plz || null,
          ort: form.ort || null,
          adresse: form.adresse || null,
          telefon: form.telefon || null,
          notes: form.notes || null,
          start_date: form.start_date,
          sales_partner_id: form.sales_partner_id || null,
          sales_partner_name: form.sales_partner_name || null,
        } as any).eq("id", editId);
        if (error) throw error;
      } else {
        // Insert new contract as eingegangen
        const record: any = {
          customer_name: `${form.vorname} ${form.nachname}`.trim() || form.praxis || "Entwurf",
          sales_partner_id: form.sales_partner_id || null,
          sales_partner_name: form.sales_partner_name || null,
          mp_nr: form.mp_nr || null,
          praxis: form.praxis || null,
          fachrichtung: form.fachrichtung || null,
          vorname: form.vorname || null,
          nachname: form.nachname || null,
          adresse: form.adresse || null,
          plz: form.plz || null,
          ort: form.ort || null,
          telefon: form.telefon || null,
          email: form.email,
          product_name: form.selected_products.join(", ") || "Entwurf",
          modules: form.selected_products,
          license_count: form.license_count,
          start_date: form.start_date,
          duration_months: 0,
          end_date: "2099-12-31",
          cancellation_period_months: 6,
          auto_renewal: false,
          monthly_price: form.monthly_price,
          one_time_fee: form.one_time_fee,
          discount_percent: form.discount_percent,
          payment_interval: form.payment_interval,
          notes: form.notes || null,
          rechtsform: form.rechtsform || null,
          bsnr: form.bsnr || null,
          lanr: [form.lanr, form.lanr_2, form.lanr_3].filter(Boolean).join(", ") || null,
          selected_addon_modules: form.selected_modules.length > 0 ? form.selected_modules : [],
          bsnr_count: form.bsnr_count,
          lanr_count: form.lanr_count,
          status: "eingegangen",
          created_by: user?.id,
          ...(leadHfxNumber ? { hfx_customer_number: leadHfxNumber } : {}),
          ...(form.selected_products.includes("HFX EBM")
            ? (() => {
                const s = form.start_date ? new Date(form.start_date) : new Date();
                const qEnd = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3 + 3, 0);
                const yyyy = qEnd.getFullYear();
                const mm = String(qEnd.getMonth() + 1).padStart(2, "0");
                const dd = String(qEnd.getDate()).padStart(2, "0");
                return { base_fee_waived: true, base_fee_waived_until: `${yyyy}-${mm}-${dd}` };
              })()
            : {}),
        };
        const { data: inserted, error } = await supabase.from("contracts").insert(record).select("id").single();
        if (error) throw error;
        contractId = inserted.id;

        // Upsert customers entry and link to contract
        const hfxNr2 = leadHfxNumber || form.mp_nr || null;
        if (hfxNr2 && contractId) {
          const { data: existingCust2 } = await (supabase as any)
            .from("customers").select("id").eq("hfx_customer_number", hfxNr2).maybeSingle();
          let custId2 = existingCust2?.id ?? null;
          if (!custId2) {
            const { data: newCust2 } = await (supabase as any)
              .from("customers")
              .insert({
                hfx_customer_number: hfxNr2,
                praxis_name: form.praxis || `${form.vorname || ""} ${form.nachname || ""}`.trim() || null,
                vorname: form.vorname || null,
                nachname: form.nachname || null,
                email: form.email || null,
                telefon: form.telefon || null,
                adresse: form.adresse || null,
                plz: form.plz || null,
                ort: form.ort || null,
                bsnr: form.bsnr || null,
              })
              .select("id").single();
            custId2 = newCust2?.id ?? null;
          }
          if (custId2) {
            await supabase.from("contracts").update({ customer_id: custId2 }).eq("id", contractId);
            await (supabase as any).from("contract_cases").insert({
              customer_id: custId2,
              contract_id: contractId,
              case_type: "neuabschluss",
              status: "offen",
              title: `Neuabschluss – ${form.selected_products.join(", ") || "Produkt"}`,
              created_by: user?.id,
            });
          }
        }
      }

      // Send SEPA-Mandat-Mail (Mail 1) — customer activates contract via link
      const { error: mailError } = await supabase.functions.invoke("send-mandate-setup", {
        body: { contract_id: contractId },
      });
      if (mailError) throw mailError;

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "✅ SEPA-Mandat-Mail gesendet", description: `SEPA-Aktivierungslink an ${form.email} gesendet. Vertrag steht auf „Versendet, wartet auf Mandat".` });
      closeDialog();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setSendingBuchungsmailDialog(false);
    }
  };

  const handleStripeCheckout = async (contractId: string) => {
    // Use create-contract-subscription which sets correct metadata for the webhook
    try {
      const { data, error } = await supabase.functions.invoke("create-contract-subscription", {
        body: { contract_id: contractId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast({ title: "Stripe Checkout geöffnet", description: "Der Zahlungslink wurde in einem neuen Tab geöffnet." });
      } else if (data?.reason === "no_stripe_products") {
        toast({ title: "Keine Stripe-Produkte", description: "Für die gewählten Produkte ist noch kein Stripe-Preis hinterlegt." });
      } else {
        throw new Error("Keine Checkout-URL erhalten");
      }
    } catch (err: any) {
      console.error("Stripe checkout error:", err);
      toast({ title: "Stripe-Fehler", description: err.message || "Checkout konnte nicht erstellt werden.", variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (upsertMutation.isPending) return; // Doppelklick-Schutz
    if (blockOnDuplicate) {
      toast({ title: "Möglicher Vertrags-Dublette gefunden", description: 'Bitte Hinweis im Dialog beachten oder „Trotzdem anlegen" bestätigen.', variant: "destructive" });
      return;
    }
    const missing = getMissingFields();
    if (missing.length > 0) {
      setShowErrors(true);
      toast({ title: "Fehlende Pflichtfelder", description: missing.join(", "), variant: "destructive" });
      return;
    }
    // MP-Nummer validation: if provided, must be exactly 5 digits
    if (form.mp_nr && !/^\d{5}$/.test(form.mp_nr)) {
      toast({ title: "Ungültige MP-Nummer", description: "Die MP-Nummer muss genau 5-stellig sein (nur Ziffern).", variant: "destructive" });
      return;
    }
    // BSNR/LANR format validation
    const bsnrFields = [
      { val: form.bsnr, label: "BSNR" },
      { val: form.weitere_bsnr_1, label: "Weitere BSNR 1" },
      { val: form.weitere_bsnr_2, label: "Weitere BSNR 2" },
      { val: form.weitere_bsnr_3, label: "Weitere BSNR 3" },
    ];
    const lanrFields = [
      { val: form.lanr, label: "LANR 1" },
      { val: form.lanr_2, label: "LANR 2" },
      { val: form.lanr_3, label: "LANR 3" },
      { val: form.weitere_lanr, label: "Weitere LANR" },
    ];
    for (const f of bsnrFields) {
      const err = validateBsnr(f.val);
      if (err) { toast({ title: `Ungültige ${f.label}`, description: err, variant: "destructive" }); return; }
    }
    for (const f of lanrFields) {
      const err = validateLanr(f.val);
      if (err) { toast({ title: `Ungültige ${f.label}`, description: err, variant: "destructive" }); return; }
    }
    upsertMutation.mutate(form);
  };

  const set = (field: keyof ContractFormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSendEmail = async (c: any) => {
    if (!c.email) {
      toast({ title: "Keine E-Mail-Adresse", description: "Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.", variant: "destructive" });
      return;
    }
    setSendingEmailId(c.id);
    try {
      // Load logo
      let logoBytes: ArrayBuffer | undefined;
      try {
        const res = await fetch(foxLogoUrl);
        logoBytes = await res.arrayBuffer();
      } catch { /* continue without logo */ }

      // Build product price details
      const now = new Date();
      const selectedNames: string[] = c.modules?.length ? c.modules : (c.product_name ? [c.product_name] : []);
      const product_price_details = products
        .filter((p: any) => selectedNames.includes(p.name))
        .map((p: any) => ({
          name: p.name,
          monthly_price: Number(p.monthly_price) || 0,
          price_per_unit: p.price_per_unit != null ? (Number(p.price_per_unit) || 0) : null,
          price_per_unit_label: p.price_per_unit_label || null,
          promo_price: p.promo_price != null ? (Number(p.promo_price) || 0) : null,
          promo_price_label: p.promo_price_label || null,
          promo_end_date: p.promo_end_date || null,
          promo_base_fee_end_date: p.promo_base_fee_end_date || null,
          has_active_promo: p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= now,
        }));

      const addonNames: string[] = c.selected_addon_modules || [];
      const addon_module_details = ebmModules
        .filter((m: any) => addonNames.includes(m.name))
        .map((m: any) => ({ name: m.name, monthly_price: Number(m.monthly_price) || 0 }));

      // 1) Generate Vorschau PDF
      const previewBytes = await generateContractPdf({
        ...c,
        product_price_details,
        selected_addon_modules: addonNames,
        addon_module_details,
      }, logoBytes);
      const previewBase64 = btoa(String.fromCharCode(...new Uint8Array(previewBytes)));

      // 2) Generate Vertragsdokument PDF (template)
      const templateRes = await fetch("/templates/vertrag-honorarfuchs.pdf");
      const templateBytes = await templateRes.arrayBuffer();
      const contractBytes = await fillContractTemplate(templateBytes, {
        mp_nr: c.mp_nr, praxis: c.praxis, fachrichtung: c.fachrichtung,
        rechtsform: c.rechtsform, vorname: c.vorname, nachname: c.nachname,
        adresse: c.adresse, praxisanschrift: c.praxisanschrift, plz: c.plz,
        telefon: c.telefon, email: c.email,
        kontoinhaber: c.kontoinhaber, kontoinhaber_strasse: c.kontoinhaber_strasse,
        kontoinhaber_plz_ort: c.kontoinhaber_plz_ort, bank_name: c.bank_name,
        iban: c.iban, bic: c.bic, bsnr: c.bsnr,
        lanr: c.lanr, weitere_bsnr: c.weitere_bsnr, weitere_lanr: c.weitere_lanr, ort: c.ort,
        monthly_price: c.monthly_price, start_date: c.start_date, end_date: c.end_date,
        modules: c.modules?.length ? c.modules : (c.product_name ? [c.product_name] : []),
        duration_months: c.duration_months, notes: c.notes,
        signature_data: c.signature_data, vertrieb_signature_data: c.vertrieb_signature_data,
        praxissystem: c.praxissystem, stundenaufwand_pro_woche: c.stundenaufwand_pro_woche,
        selected_addon_modules: addonNames,
      });
      const contractBase64 = btoa(String.fromCharCode(...new Uint8Array(contractBytes)));

      const customerName = [c.vorname, c.nachname].filter(Boolean).join(" ") || c.praxis || c.customer_name;
      const { error } = await supabase.functions.invoke("send-contract-email", {
        body: {
          email: c.email,
          salesPartnerEmail: null,
          customerName,
          pdfBase64: contractBase64,
          previewPdfBase64: previewBase64,
          products: c.product_name || selectedNames.join(", "),
          startDate: c.start_date,
          hfxNumber: c.hfx_customer_number,
        },
      });
      if (error) throw error;
      toast({ title: "E-Mail gesendet", description: `Vorschau und Vertragsdokument wurden an ${c.email} gesendet.` });
    } catch (err: any) {
      console.error("Send email error:", err);
      toast({ title: "Fehler beim E-Mail-Versand", description: err.message, variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleResendConfirmation = async (contract: any) => {
    if (!window.confirm(`SEPA-Mandat-Mail erneut an ${contract.customer_name || contract.email} senden?`)) return;
    setResendingConfirmationId(contract.id);
    try {
      const { error } = await supabase.functions.invoke("send-mandate-setup", {
        body: { contract_id: contract.id, force: true },
      });
      if (error) throw error;
      toast({ title: "Mail wurde gesendet", description: `SEPA-Mandat-Mail an ${contract.email}` });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    } catch (err: any) {
      console.error("Resend mandate error:", err);
      toast({ title: "Fehler beim Senden", description: err.message, variant: "destructive" });
    } finally {
      setResendingConfirmationId(null);
    }
  };

  const handlePreviewPdf = async (contractData: Record<string, any>) => {
    try {
      const sigData = contractData.signature_data;
      // Build product price details from selected products
      const now = new Date();
      const selectedNames = contractData.modules?.length ? contractData.modules : (contractData.selected_products || []);
      const product_price_details = products
        .filter((p: any) => selectedNames.includes(p.name))
        .map((p: any) => {
          const hasPromo = p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= now;
          return {
            name: p.name,
            monthly_price: Number(p.monthly_price) || 0,
            price_per_unit: p.price_per_unit != null ? (Number(p.price_per_unit) || 0) : null,
            price_per_unit_label: p.price_per_unit_label || null,
            promo_price: p.promo_price != null ? (Number(p.promo_price) || 0) : null,
            promo_price_label: p.promo_price_label || null,
            promo_end_date: p.promo_end_date || null,
            promo_base_fee_end_date: p.promo_base_fee_end_date || null,
            has_active_promo: hasPromo,
          };
        });
      // Load logo
      let logoBytes: ArrayBuffer | undefined;
      try {
        const res = await fetch(foxLogoUrl);
        logoBytes = await res.arrayBuffer();
      } catch {
        // Continue without logo
      }
      // Build addon module details
      const addonNames = contractData.selected_addon_modules || contractData.selected_modules || [];
      const addon_module_details = ebmModules
        .filter((m: any) => addonNames.includes(m.name))
        .map((m: any) => ({ name: m.name, monthly_price: Number(m.monthly_price) || 0 }));

      const pdfBytes = await generateContractPdf({
        ...contractData,
        signature_data: sigData,
        product_price_details,
        selected_addon_modules: addonNames,
        addon_module_details,
      }, logoBytes);
      openPdfBlob(new Uint8Array(pdfBytes));
    } catch (err: any) {
      toast({ title: "PDF-Fehler", description: err.message, variant: "destructive" });
    }
  };

  const normalizeProductKey = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const resolveProductAgbPath = (contractData: Record<string, any>) => {
    const candidates = [
      ...(Array.isArray(contractData.modules) ? contractData.modules : []),
      ...(Array.isArray(contractData.selected_products) ? contractData.selected_products : []),
      ...String(contractData.product_name || "").split(","),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean);

    if (candidates.length === 0) return null;

    const exactMatch = products.find((product: any) =>
      product?.agb_pdf_path &&
      candidates.some((candidate) => candidate.toLowerCase() === String(product.name || "").toLowerCase())
    );
    if (exactMatch?.agb_pdf_path) return exactMatch.agb_pdf_path as string;

    const fuzzyMatch = products.find((product: any) => {
      if (!product?.agb_pdf_path || !product?.name) return false;
      const normalizedProduct = normalizeProductKey(String(product.name));
      return candidates.some((candidate) => {
        const normalizedCandidate = normalizeProductKey(candidate);
        return (
          normalizedCandidate === normalizedProduct ||
          normalizedCandidate.includes(normalizedProduct) ||
          normalizedProduct.includes(normalizedCandidate)
        );
      });
    });

    return (fuzzyMatch?.agb_pdf_path as string | null) ?? null;
  };

  const handleTemplatePdf = async (contractData: Record<string, any>) => {
    try {
      // Always show the filled contract template PDF (what the customer receives)
      const templateRes = await fetch("/templates/vertrag-honorarfuchs.pdf");
      const templateBytes = await templateRes.arrayBuffer();

      const pdfBytes = await fillContractTemplate(templateBytes, {
        mp_nr: contractData.mp_nr,
        praxis: contractData.praxis,
        fachrichtung: contractData.fachrichtung,
        rechtsform: contractData.rechtsform,
        vorname: contractData.vorname,
        nachname: contractData.nachname,
        adresse: contractData.adresse,
        praxisanschrift: contractData.praxisanschrift,
        plz: contractData.plz,
        telefon: contractData.telefon,
        email: contractData.email,
        kontoinhaber: contractData.kontoinhaber,
        kontoinhaber_strasse: contractData.kontoinhaber_strasse,
        kontoinhaber_plz_ort: contractData.kontoinhaber_plz_ort,
        bank_name: contractData.bank_name,
        iban: contractData.iban,
        bic: contractData.bic,
        bsnr: contractData.bsnr,
        lanr: contractData.lanr,
        weitere_bsnr: contractData.weitere_bsnr,
        weitere_lanr: contractData.weitere_lanr,
        ort: contractData.ort,
        monthly_price: contractData.monthly_price,
        start_date: contractData.start_date,
        end_date: contractData.end_date,
        modules: contractData.modules?.length ? contractData.modules : contractData.selected_products,
        duration_months: contractData.duration_months,
        notes: contractData.notes,
        signature_data: contractData.signature_data || null,
        vertrieb_signature_data: contractData.vertrieb_signature_data || null,
        praxissystem: contractData.praxissystem,
        stundenaufwand_pro_woche: contractData.stundenaufwand_pro_woche,
        selected_addon_modules: contractData.selected_addon_modules || contractData.selected_modules || [],
      });

      openPdfBlob(new Uint8Array(pdfBytes));
    } catch (err: any) {
      toast({ title: "PDF-Fehler", description: err.message, variant: "destructive" });
    }
  };

  return (
    <MainLayout title="Vertragserfassung" subtitle="Verträge anlegen und verwalten">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="flex gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche nach Kunde, Produkt oder Partner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {isRegionalLead && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Team filtern" />
              </SelectTrigger>
              <SelectContent>
                {teamFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setForm({ ...emptyForm, sales_partner_name: profile?.full_name || "" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Vertrag
          </Button>
        </div>
      </div>

      {/* Stats / Filter-Kacheln */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-4 mb-6">
        {(["entwurf", "eingegangen", "gezeichnet", "aktiv", "gekuendigt", "beendet", "gesperrt"] as const).map((s) => {
          const cfg = statusConfig[s];
          const Icon = cfg.icon;
          const count = contracts.filter((c: any) => c.status === s).length;
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(isActive ? null : s)}
              className={`rounded-lg border transition-all text-center p-3 sm:p-4 flex flex-col items-center gap-1.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                isActive
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className={`rounded-full p-2 ${cfg.class}`}>
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <p className="text-xl sm:text-2xl font-semibold leading-none">{count}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight hidden sm:block">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Admin-only Filter-Chip: Pre-System-Verträge (aktiv ohne Stripe-Customer) */}
      {isAdmin && (() => {
        const preSystemCount = contracts.filter(
          (c: any) => c.status === "aktiv" && !c.stripe_customer_id,
        ).length;
        if (preSystemCount === 0 && !preSystemFilter) return null;
        return (
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreSystemFilter((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                preSystemFilter
                  ? "border-warning bg-warning/15 text-warning-foreground"
                  : "border-warning/40 bg-warning/5 text-warning hover:bg-warning/10"
              }`}
              title="Verträge mit Status aktiv, aber ohne hinterlegtes SEPA-Mandat (stripe_customer_id IS NULL)"
            >
              <AlertTriangle className="h-3 w-3" />
              Pre-System (kein SEPA)
              <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 tabular-nums">
                {preSystemCount}
              </span>
            </button>
            {preSystemFilter && (
              <button
                type="button"
                onClick={() => setPreSystemFilter(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Filter aufheben
              </button>
            )}
          </div>
        );
      })()}

      {statusFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[statusFilter]?.class}`}>
            {statusConfig[statusFilter]?.label}
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Filter aufheben
          </button>
        </div>
      )}

      {/* Banner: Eingegangen ohne SEPA-Mandat-Versand */}
      {contracts.filter((c: any) => c.status === "eingegangen" && !c.mandate_email_sent_at).length > 0 && (() => {
        const pending = contracts.filter((c: any) => c.status === "eingegangen" && !c.mandate_email_sent_at);
        return (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                {pending.length} {pending.length === 1 ? "Vertrag" : "Verträge"} ohne SEPA-Mandat-Versand
              </p>
              <p className="text-xs text-warning/80 mt-0.5">
                {pending.length === 1
                  ? "Folgender Vertrag hat Status \u201eVersendet, wartet auf Mandat\u201c, aber die SEPA-Mandat-Mail mit Stripe-Link wurde noch nicht gesendet:"
                  : "Folgende Vertr\u00e4ge haben Status \u201eVersendet, wartet auf Mandat\u201c, aber die SEPA-Mandat-Mail mit Stripe-Link wurde noch nicht gesendet:"}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {pending.map((c: any) => (
                  <li key={c.id} className="text-xs text-warning/80 font-medium">
                    &bull; {c.customer_name || c.praxis || "\u2013"}{c.hfx_customer_number ? ` (${c.hfx_customer_number})` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter("eingegangen")}
              className="shrink-0 text-xs font-medium text-warning underline underline-offset-2 hover:no-underline whitespace-nowrap"
            >
              Anzeigen
            </button>
          </div>
        );
      })()}

      {/* Banner: Eingegangen mit Mandat-Setup-Mail, aber ohne Vertragsunterlagen-Versand */}
      {contracts.filter((c: any) => c.status === "eingegangen" && c.mandate_email_sent_at && !c.confirmation_email_sent_at).length > 0 && (() => {
        const pending = contracts.filter((c: any) => c.status === "eingegangen" && c.mandate_email_sent_at && !c.confirmation_email_sent_at);
        return (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                {pending.length} {pending.length === 1 ? "Vertrag" : "Verträge"} ohne Vertragsunterlagen-Versand
              </p>
              <p className="text-xs text-warning/80 mt-0.5">
                Folgende Verträge haben die SEPA-Mandat-Mail erhalten, aber die Vertragsunterlagen mit AGB wurden noch nicht versendet.
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {pending.map((c: any) => (
                  <li key={c.id} className="text-xs text-warning/80 font-medium">
                    &bull; {c.customer_name || c.praxis || "\u2013"}{c.hfx_customer_number ? ` (${c.hfx_customer_number})` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter("eingegangen")}
              className="shrink-0 text-xs font-medium text-warning underline underline-offset-2 hover:no-underline whitespace-nowrap"
            >
              Anzeigen
            </button>
          </div>
        );
      })()}

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Verträge gefunden.
            </div>
          ) : (
            <table className="data-table w-full">
              <thead>
               <tr className="bg-accent/5">
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Vertragsnr.</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">HFX-Nr.</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Praxis / Name</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">E-Mail</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">MP-Nr.</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 max-w-[220px]">Produkt</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Partner</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 text-right">Monatspreis</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 text-center">Status</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">
                     <button type="button" onClick={() => handleSort("created_at")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                       Erfasst
                       {sortField === "created_at" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                     </button>
                   </th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">
                     <button type="button" onClick={() => handleSort("updated_at")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                       Zuletzt geändert
                       {sortField === "updated_at" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                     </button>
                   </th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Dokument</th>
                   <th className="w-10"></th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                 {filtered.map((c: any) => (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        // Ignoriere Clicks auf interaktive Kind-Elemente (Buttons, Links, Menu-Items, File-Inputs, Labels)
                        if ((e.target as HTMLElement).closest("button, a, label, [role='menuitem'], input")) return;
                        if (isContractLocked(c.status)) {
                          if (!window.confirm("⚠️ Achtung: Sie bearbeiten einen abgeschlossenen Originalvertrag. Änderungen werden dokumentiert. Fortfahren?")) return;
                        }
                        openEdit(c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        if ((e.target as HTMLElement) !== e.currentTarget) return;
                        e.preventDefault();
                        if (isContractLocked(c.status)) {
                          if (!window.confirm("⚠️ Achtung: Sie bearbeiten einen abgeschlossenen Originalvertrag. Änderungen werden dokumentiert. Fortfahren?")) return;
                        }
                        openEdit(c);
                      }}
                    >
                        <td className="py-3.5 px-4 text-xs font-mono font-semibold text-primary whitespace-nowrap">
                          {c.contract_number || "–"}
                        </td>
                        <td
                          className="py-3.5 px-4 text-xs text-muted-foreground font-mono whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                         <div className="flex items-center gap-1.5">
                           {c.hfx_customer_number ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setKundenDialogHfx(c.hfx_customer_number);
                                }}
                                className="hover:text-primary hover:underline transition-colors"
                                title="Kunden-Übersicht öffnen"
                              >
                                {c.hfx_customer_number}
                              </button>
                           ) : (
                             <span>–</span>
                           )}
                           {c.hfx_customer_number && (
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <span className="inline-flex shrink-0">
                                     {leadQodiaMap[c.hfx_customer_number] === true ? (
                                       <CheckCircle className="h-3.5 w-3.5 text-success" />
                                     ) : leadQodiaMap[c.hfx_customer_number] === false ? (
                                       <CircleOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                                     ) : null}
                                   </span>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   {leadQodiaMap[c.hfx_customer_number] === true
                                     ? "Bei Qodia registriert"
                                     : "Noch nicht bei Qodia registriert"}
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           )}
                         </div>
                       </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <p className="font-medium text-foreground leading-tight">{c.praxis || c.customer_name}</p>
                        {c.praxis && (c.vorname || c.nachname) && (
                          <p className="text-xs text-muted-foreground leading-tight">{[c.vorname, c.nachname].filter(Boolean).join(" ")}</p>
                        )}
                      </td>
                     <td className="py-3.5 px-4">
                       <div className="space-y-0.5 min-w-[160px]">
                         {c.email ? (
                           <TooltipProvider>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <a
                                   href={`mailto:${c.email}`}
                                   className="text-xs text-foreground hover:text-primary hover:underline flex items-center gap-1 w-fit"
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                                   <span className="truncate max-w-[180px]">{c.email}</span>
                                 </a>
                               </TooltipTrigger>
                               <TooltipContent>Registrierungs-E-Mail (HFX-GOÄ Login)</TooltipContent>
                             </Tooltip>
                           </TooltipProvider>
                         ) : (
                           <span className="text-xs text-muted-foreground">–</span>
                         )}
                         {c.rechnungs_email && c.rechnungs_email !== c.email && (
                           <TooltipProvider>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <a
                                   href={`mailto:${c.rechnungs_email}`}
                                   className="text-xs text-muted-foreground hover:text-primary hover:underline flex items-center gap-1 w-fit"
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   <Mail className="h-3 w-3 shrink-0 opacity-50" />
                                   <span className="truncate max-w-[180px]">{c.rechnungs_email}</span>
                                   <span className="text-[10px] text-muted-foreground border border-border rounded px-1 shrink-0">Rechnung</span>
                                 </a>
                               </TooltipTrigger>
                               <TooltipContent>Abweichende Rechnungs-E-Mail</TooltipContent>
                             </Tooltip>
                           </TooltipProvider>
                         )}
                       </div>
                     </td>
                     <td className="py-3.5 px-4 text-muted-foreground text-sm">{c.mp_nr || "–"}</td>
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <div className="space-y-1">
                        {(c as any).parent_contract_id && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 bg-primary/5 rounded px-1.5 py-0.5 w-fit">
                            <GitMerge className="h-3 w-3" />
                            Nachtrag
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {c.product_name.split(", ").map((p: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs font-normal px-2 py-0.5 whitespace-nowrap">
                              {p}
                            </Badge>
                          ))}
                        </div>
                        {c.selected_addon_modules?.length > 0 && (
                          <p className="text-xs text-muted-foreground leading-tight">
                            + {c.selected_addon_modules.join(", ")}
                          </p>
                        )}
                      </div>
                    </td>
                     <td className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">{c.sales_partner_name || "–"}</td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span className="font-semibold text-foreground tabular-nums">
                        {(Number(c.monthly_price) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                      </span>
                      {Number(c.discount_percent) > 0 && (
                        <span className="block text-xs text-success">-{c.discount_percent}%</span>
                      )}
                    </td>
                     <td className="py-3.5 px-4 text-center">
                       <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                           <button
                             type="button"
                             className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-transparent hover:border-current transition-colors cursor-pointer ${statusConfig[c.status]?.class || ""}`}
                           >
                             {(() => { const Icon = statusConfig[c.status]?.icon; return Icon ? <Icon className="h-3 w-3" /> : null; })()}
                             {statusConfig[c.status]?.label || c.status}
                             <ChevronsUpDown className="h-3 w-3 opacity-50" />
                           </button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="center" className="min-w-[160px]">
                           {(["entwurf", "eingegangen", "gezeichnet", "aktiv", "gekuendigt", "beendet", "gesperrt"] as const).map((s) => {
                             const cfg = statusConfig[s];
                             const Icon = cfg.icon;
                             return (
                               <DropdownMenuItem
                                 key={s}
                                 disabled={c.status === s || (!isAdmin && !isVertragsabteilung && s === "aktiv")}
                                 onClick={() => handleStatusChange(c.id, s)}
                                 className="gap-2"
                               >
                                 <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.class}`}>
                                   <Icon className="h-3 w-3" />
                                   {cfg.label}
                                 </span>
                                 {c.status === s && <Check className="h-3 w-3 ml-auto" />}
                               </DropdownMenuItem>
                             );
                           })}
                         </DropdownMenuContent>
                         </DropdownMenu>
                       </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {c.created_at
                            ? format(new Date(c.created_at), "dd.MM.yy HH:mm", { locale: de })
                            : "–"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {c.updated_at
                            ? format(new Date(c.updated_at), "dd.MM.yy HH:mm", { locale: de })
                            : "–"}
                        </td>
                        <td>
                        <div className="flex flex-col gap-1">
                          {/* [Papier] badge removed – paper flow decommissioned */}
                          {/* Confirmation email indicator for paper contracts removed – paper flow decommissioned */}
                          {/* Re-Send SEPA-Mandat-Mail – nur wenn Vertrag noch auf Mandat wartet und kein Stripe-Customer hinterlegt ist */}
                          {c.email
                            && (c.status === "eingegangen" || c.status === "wartend_auf_mandat")
                            && !c.stripe_customer_id && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 gap-1 text-[11px] px-2"
                                    disabled={resendingConfirmationId === c.id}
                                    onClick={() => handleResendConfirmation(c)}
                                  >
                                    {resendingConfirmationId === c.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Mail className="h-3 w-3" />
                                    )}
                                    SEPA-Mandat-Mail erneut senden
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>SEPA-Mandat-Mail erneut an {c.email} senden</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {/* Stripe payment confirmation indicator for paper contracts removed – paper flow decommissioned */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handlePreviewPdf(c)}
                          >
                            <Eye className="h-3 w-3" />
                            Vorschau
                          </Button>
                          {/* Generiertes / digital signiertes Dokument */}
                          {c.document_url && (
                            <button
                              className="text-primary hover:underline text-xs flex items-center gap-1"
                              onClick={async () => {
                                const { data, error } = await supabase.storage
                                  .from("contracts")
                                  .createSignedUrl(c.document_url!, 300);
                                if (error || !data?.signedUrl) {
                                  toast({ title: "Fehler beim Laden des Dokuments", variant: "destructive" });
                                  return;
                                }
                                window.open(data.signedUrl, "_blank");
                              }}
                            >
                              <Download className="h-3 w-3" />
                              <span className="truncate max-w-[80px]">{c.document_name || "Vertrag PDF"}</span>
                            </button>
                          )}
          {/* Paper contract inline upload removed – paper flow decommissioned */}
                       </div>
                     </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          
                          <DropdownMenuItem asChild>
                            <label className="cursor-pointer flex items-center">
                              <Upload className="h-4 w-4 mr-2" />
                              {uploadingId === c.id ? "Lädt..." : "PDF hochladen"}
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) uploadDocument(c.id, f);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          </DropdownMenuItem>
                          {/* Bearbeiten: bei locked Verträgen mit Warnung, sonst direkt */}
                          {!isContractLocked(c.status) ? (
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Bearbeiten
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => {
                              if (window.confirm("⚠️ Achtung: Sie bearbeiten einen abgeschlossenen Originalvertrag. Änderungen werden dokumentiert. Fortfahren?")) {
                                openEdit(c);
                              }
                            }}>
                              <AlertTriangle className="h-4 w-4 mr-2 text-warning" />
                              <span className="text-warning">Bearbeiten</span>
                            </DropdownMenuItem>
                          )}
                          {(c.status === "aktiv" || c.status === "gezeichnet") && (
                             <>
                               <DropdownMenuSeparator />
                               <DropdownMenuItem onClick={() => openExtensionDialog(c)} className="text-primary">
                                 <GitMerge className="h-4 w-4 mr-2" />
                                 Produkt hinzubuchen
                               </DropdownMenuItem>
                             </>
                           )}
                           {/* DEPRECATED — alte Stripe-Welt, abgeklemmt am 08.05.2026, siehe Aufräum-Plan */}
                           {false && (c.status === "aktiv" || c.status === "eingegangen" || c.status === "gezeichnet") && !c.stripe_customer_id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleStripeCheckout(c.id)} className="text-primary">
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Digitale Zahlung starten
                                </DropdownMenuItem>
                              </>
                            )}
                          {isAdmin && c.status === "gezeichnet" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-success"
                                onClick={async () => {
                                  const { error } = await supabase.from("contracts").update({ status: "aktiv", approved_by: user?.id, approved_at: new Date().toISOString() } as any).eq("id", c.id);
                                  if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
                                  // Freigabe wird nur auf Verträgen im Status "gezeichnet" angeboten — alter Status ist deterministisch
                                  logCustomerStatusChange({
                                    eventType: "CONTRACT_STATUS_CHANGED",
                                    entityType: "contract",
                                    entityId: c.id,
                                    oldStatus: "gezeichnet",
                                    newStatus: "aktiv",
                                    source: "vertraege_freigabe",
                                    hfxCustomerNumber: c.hfx_customer_number ?? null,
                                    contractId: c.id,
                                    createdBy: user?.id ?? null,
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["contracts"] });
                                  toast({ title: "Vertrag freigegeben", description: "Status auf Aktiv gesetzt." });
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Freigeben (Aktiv)
                              </DropdownMenuItem>
                            </>
                          )}
                          {isAdmin && c.hfx_customer_number && !leadQodiaMap[c.hfx_customer_number] && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => syncLeadQodia(c)}
                                disabled={syncingQodiaId === c.id}
                              >
                                {syncingQodiaId === c.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 mr-2 text-warning" />
                                )}
                                Bei Qodia registrieren
                              </DropdownMenuItem>
                            </>
                          )}
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteContractTarget(c)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Löschen
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="w-full max-w-[98vw] sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {editId ? "Vertrag bearbeiten" : "Neuen Vertrag erfassen"}
            </DialogTitle>
            <DialogDescription>
              Erfassen Sie alle relevanten Vertragsdetails.
            </DialogDescription>
          </DialogHeader>

          {/* Warnung bei abgeschlossenem Vertrag (für alle Rollen) */}
          {editId && editingContract && isContractLocked(editingContract.status) && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning">Originalvertrag wird bearbeitet</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Dieser Vertrag hat den Status „{statusConfig[editingContract.status as keyof typeof statusConfig]?.label || editingContract.status}". 
                  Änderungen werden am Originalvertrag vorgenommen und im Audit-Log dokumentiert.
                </p>
              </div>
            </div>
          )}

          <form autoComplete="off" onSubmit={handleSubmit} className="space-y-5">
           <fieldset className="space-y-5">
            {/* Vertragsparteien */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsparteien</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                   <Label>Praxis *</Label>
                   <Input value={form.praxis} onChange={(e) => set("praxis", e.target.value)} placeholder="Name der Praxis" required className={fieldErr("praxis") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("praxis") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>Fachrichtung</Label>
                   <Input value={form.fachrichtung} onChange={(e) => set("fachrichtung", e.target.value)} placeholder="z.B. Allgemeinmedizin, Orthopädie..." />
                 </div>
                 <div>
                   <Label>Rechtsform</Label>
                   <Input value={form.rechtsform} onChange={(e) => set("rechtsform", e.target.value)} placeholder="z.B. Einzelpraxis, GbR, MVZ..." />
                 </div>
                 <div>
                   <Label>Vorname *</Label>
                   <Input value={form.vorname} onChange={(e) => set("vorname", e.target.value)} required className={fieldErr("vorname") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("vorname") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>Nachname *</Label>
                   <Input value={form.nachname} onChange={(e) => set("nachname", e.target.value)} required className={fieldErr("nachname") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("nachname") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div className="col-span-2 pt-2">
                   <h4 className="font-semibold text-sm text-foreground">Praxisanschrift</h4>
                 </div>
                 <div className="col-span-2">
                   <Label>Adresse (Straße, Hausnummer) *</Label>
                   <Input value={form.praxisanschrift} onChange={(e) => set("praxisanschrift", e.target.value)} placeholder="Straße und Hausnummer der Praxis" className={fieldErr("praxisanschrift") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("praxisanschrift") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>PLZ *</Label>
                   <Input value={form.plz} onChange={(e) => set("plz", e.target.value)} placeholder="z.B. 10115" className={fieldErr("plz") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("plz") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>Ort *</Label>
                   <Input value={form.ort} onChange={(e) => set("ort", e.target.value)} placeholder="z.B. Berlin" className={fieldErr("ort") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("ort") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>Telefonnummer</Label>
                   <Input value={form.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="+49..." type="tel" className={fieldErr("telefon") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("telefon") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>E-Mail-Adresse</Label>
                   <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="praxis@example.de" type="email" className={fieldErr("email") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("email") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                </div>
                <div>
                  <Label>MP-Nummer</Label>
                  <Input
                    value={form.mp_nr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                      set("mp_nr", val);
                    }}
                    placeholder="z.B. 12345"
                    maxLength={5}
                    inputMode="numeric"
                  />
                  {form.mp_nr && form.mp_nr.length > 0 && form.mp_nr.length < 5 && (
                    <p className="text-xs text-destructive mt-1">MP-Nummer muss 5-stellig sein</p>
                  )}
                </div>
                <div>
                   <Label>Vertriebspartner</Label>
                   <SalesPartnerCombobox
                     value={form.sales_partner_name}
                     selectedId={form.sales_partner_id}
                     onChange={(id, name) => {
                       set("sales_partner_id", id);
                       set("sales_partner_name", name);
                     }}
                     profiles={allProfiles}
                   />
                 </div>
                 {leadTippgeberName && (
                   <div className="col-span-2">
                     <Label className="flex items-center gap-1">
                       <Lightbulb className="h-3.5 w-3.5 text-warning" />
                       Tippgeber
                     </Label>
                     <div className="mt-1.5 flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                       <span className="font-medium text-foreground">{leadTippgeberName}</span>
                     </div>
                   </div>
                 )}
               </div>
             </div>

            {/* Produkte – Mehrfachauswahl */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Produkte</h4>
              {(() => {
                // Sort products by relevance
                const productOrder: Record<string, number> = {
                  "HFX GOÄ - die KI für ihre Privatabrechnung": 1,
                  "HFX EBM": 2, "HFX Doku": 3,
                  "HFX Wingmann": 4, "HFX GOÄ/GOZ Permanent-Check": 5,
                  "HFX GOÄ/GOZ Live-Check": 6, "HFX Praxismanagement Zahnmedizin": 7,
                };
                const sorted = [...products].sort((a: any, b: any) => (productOrder[a.name] ?? 99) - (productOrder[b.name] ?? 99));

                const EBM_EXTRA_LANR_FEE = 22;
                const EBM_INCLUDED_LANR = 3;

                const recalcPrices = (nextProducts: string[], selectedModules?: string[], lanrCount?: number) => {
                  const now = new Date();
                  const totalMonthly = products
                    .filter((pr: any) => nextProducts.includes(pr.name))
                    .reduce((sum: number, pr: any) => {
                      const promoActive = pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now;
                      const bfWaived = promoActive && pr.promo_base_fee_end_date && new Date(pr.promo_base_fee_end_date) >= now;
                      const baseMonthly = Number(pr.monthly_price ?? pr.base_license_price) || 0;
                      return sum + (bfWaived ? 0 : baseMonthly);
                    }, 0);
                  const modulesTotal = ebmModules
                    .filter((m: any) => (selectedModules ?? form.selected_modules).includes(m.name))
                    .reduce((sum: number, m: any) => sum + (Number(m.monthly_price) || 0), 0);
                  const ebmSelected = nextProducts.includes("HFX EBM");
                  const effectiveLanrCount = lanrCount ?? form.lanr_count ?? EBM_INCLUDED_LANR;
                  const lanrSurcharge = ebmSelected
                    ? Math.max(0, effectiveLanrCount - EBM_INCLUDED_LANR) * EBM_EXTRA_LANR_FEE
                    : 0;
                  const totalOneTime = products
                    .filter((pr: any) => nextProducts.includes(pr.name))
                    .reduce((sum: number, pr: any) => sum + (Number(pr.one_time_fee) || 0), 0);
                  return { totalMonthly: totalMonthly + modulesTotal + lanrSurcharge, totalOneTime };
                };

                const toggleProduct = (name: string) => {
                  const isSelected = form.selected_products.includes(name);
                  const next = isSelected
                    ? form.selected_products.filter((n) => n !== name)
                    : [...form.selected_products, name];
                  const { totalMonthly, totalOneTime } = recalcPrices(next);
                  // Auto-set per-unit price from first product with price_per_unit
                  const now = new Date();
                  const unitProduct = products.find((pr: any) => next.includes(pr.name) && (pr.price_per_unit != null || pr.promo_price != null));
                  const hasPromo = unitProduct?.promo_price != null && unitProduct?.promo_end_date && new Date(unitProduct.promo_end_date) >= now;
                  const unitPrice = hasPromo ? (Number(unitProduct?.promo_price) || 0) : (Number(unitProduct?.price_per_unit) || 0);
                  setForm((prev) => ({
                    ...prev,
                    selected_products: next,
                    monthly_price: totalMonthly,
                    one_time_fee: totalOneTime,
                    qodia_unit_price: unitProduct ? unitPrice : 0.99,
                  } as any));
                };

                return (
                  <div className="space-y-1.5">
                    {sorted.map((p: any) => {
                      const isSelected = form.selected_products.includes(p.name);
                      const today = new Date();
                      const hasPromo = p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= today;
                      const baseFeeWaived = hasPromo && p.promo_base_fee_end_date && new Date(p.promo_base_fee_end_date) >= today;
                      const regularMonthly = Number(p.monthly_price ?? p.base_license_price) || 0;
                      const displayMonthly = baseFeeWaived ? 0 : regularMonthly;
                      const regularPerUnit = p.price_per_unit != null ? (Number(p.price_per_unit) || 0) : null;
                      const displayPerUnit = hasPromo
                        ? (p.promo_price != null ? (Number(p.promo_price) || 0) : regularPerUnit)
                        : regularPerUnit;

                      return (
                        <div key={p.id}>
                          <label
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-input hover:bg-muted/50"
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleProduct(p.name)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold truncate">{p.name}</span>
                                <div className="text-right text-xs font-medium text-muted-foreground">
                                  <div className="whitespace-nowrap">
                                    {hasPromo && baseFeeWaived
                                      ? "0,00 €/Mon."
                                      : `${displayMonthly.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Mon.`}
                                    <span className="ml-1 text-muted-foreground/80">Grundgebühr</span>
                                  </div>
                                  {displayPerUnit != null && (
                                    <div className="whitespace-nowrap text-muted-foreground/90">
                                      {displayPerUnit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/{p.price_per_unit_label || "Stk."}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {hasPromo && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  <span className="text-xs text-success font-medium">
                                    🎉 Aktion bis {new Date(p.promo_end_date).toLocaleDateString("de-DE")}
                                  </span>
                                  {baseFeeWaived && (
                                    <span className="text-xs text-success">
                                      Keine Grundgebühr bis {new Date(p.promo_base_fee_end_date).toLocaleDateString("de-DE")}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground line-through">
                                    Regulär: {regularMonthly.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Mon.
                                    {regularPerUnit != null && ` + ${regularPerUnit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/${p.price_per_unit_label || "Stk."}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </label>

                          {/* HFX EBM Details – inline unter dem EBM-Button */}
                          {p.name === "HFX EBM" && isSelected && (
                            <div className="ml-4 pl-4 border-l-2 border-primary/30 space-y-4 mt-1 mb-1">
                              <h5 className="text-xs font-semibold text-primary uppercase tracking-wider">HFX EBM – Details</h5>

                              {/* Lizenz-Mengen (BSNR / LANR-Anzahl) */}
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Lizenz-Umfang</Label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="bsnr_count">Anzahl BSNR</Label>
                                    <Input
                                      id="bsnr_count"
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={form.bsnr_count}
                                      onChange={(e) => {
                                        const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                                        set("bsnr_count", v);
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="lanr_count">Anzahl LANR</Label>
                                    <Input
                                      id="lanr_count"
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={form.lanr_count}
                                      onChange={(e) => {
                                        const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                                        const { totalMonthly, totalOneTime } = recalcPrices(form.selected_products, form.selected_modules, v);
                                        setForm((prev) => ({ ...prev, lanr_count: v, monthly_price: totalMonthly, one_time_fee: totalOneTime }));
                                      }}
                                    />
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  1 BSNR + 3 LANR sind im Grundpreis enthalten. Jede weitere LANR kostet +22 €/Monat.
                                </p>
                                {(() => {
                                  const baseMonthly = Number(ebmProduct?.monthly_price ?? ebmProduct?.base_license_price) || 0;
                                  const moduleCount = form.selected_modules.filter((n) => ebmModules.some((m: any) => m.name === n)).length;
                                  const moduleSum = ebmModules
                                    .filter((m: any) => form.selected_modules.includes(m.name))
                                    .reduce((s: number, m: any) => s + (Number(m.monthly_price) || 0), 0);
                                  const extraLanr = Math.max(0, (form.lanr_count || 0) - 3);
                                  const lanrSum = extraLanr * 22;
                                  const total = baseMonthly + moduleSum + lanrSum;
                                  const start = form.start_date ? new Date(form.start_date) : new Date();
                                  const qEnd = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3 + 3, 0);
                                  const qEndFmt = qEnd.toLocaleDateString("de-DE");
                                  return (
                                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                                      <div className="text-sm font-semibold text-primary">
                                        Berechneter Preis: {total.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € / Monat
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {baseMonthly.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € Grundpreis
                                        {moduleCount > 0 && ` + ${moduleCount} Modul(e) à 16 € (= ${moduleSum.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €)`}
                                        {extraLanr > 0 && ` + ${extraLanr} zusätzliche LANR à 22 € (= ${lanrSum.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €)`}
                                      </div>
                                      <div className="text-xs text-success font-medium">
                                        🎁 Erstes Quartal (bis {qEndFmt}) ist beitragsfrei (Trial).
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">BSNR &amp; LANR</Label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label>BSNR</Label>
                                    <Input value={form.bsnr} onChange={(e) => set("bsnr", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                    {validateBsnr(form.bsnr) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.bsnr)}</p>}
                                  </div>
                                  <div>
                                    <Label>LANR 1</Label>
                                    <Input value={form.lanr} onChange={(e) => set("lanr", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                    {validateLanr(form.lanr) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr)}</p>}
                                  </div>
                                  <div>
                                    <Label>LANR 2</Label>
                                    <Input value={form.lanr_2} onChange={(e) => set("lanr_2", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                    {validateLanr(form.lanr_2) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr_2)}</p>}
                                  </div>
                                  <div>
                                    <Label>LANR 3</Label>
                                    <Input value={form.lanr_3} onChange={(e) => set("lanr_3", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                    {validateLanr(form.lanr_3) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr_3)}</p>}
                                  </div>
                                  <div className="col-span-2">
                                    <Label className="text-xs text-muted-foreground mt-2 block">Weitere Betriebsstätten</Label>
                                  </div>
                                  <div>
                                    <Label>Weitere BSNR 1</Label>
                                    <Input value={form.weitere_bsnr_1} onChange={(e) => set("weitere_bsnr_1", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                    {validateBsnr(form.weitere_bsnr_1) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_1)}</p>}
                                  </div>
                                  <div>
                                    <Label>Weitere BSNR 2</Label>
                                    <Input value={form.weitere_bsnr_2} onChange={(e) => set("weitere_bsnr_2", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                    {validateBsnr(form.weitere_bsnr_2) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_2)}</p>}
                                  </div>
                                  <div>
                                    <Label>Weitere BSNR 3</Label>
                                    <Input value={form.weitere_bsnr_3} onChange={(e) => set("weitere_bsnr_3", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                    {validateBsnr(form.weitere_bsnr_3) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_3)}</p>}
                                  </div>
                                  <div>
                                    <Label>Weitere LANR</Label>
                                    <Input value={form.weitere_lanr} onChange={(e) => set("weitere_lanr", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                    {validateLanr(form.weitere_lanr) && <p className="text-xs text-destructive mt-1">{validateLanr(form.weitere_lanr)}</p>}
                                  </div>
                                </div>
                              </div>
                              {ebmModules.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-muted-foreground">Zusatzmodule (optional)</Label>
                                  <div className="space-y-2">
                                    {ebmModules.map((mod: any) => {
                                      const isChecked = form.selected_modules.includes(mod.name);
                                      return (
                                        <label
                                          key={mod.id}
                                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                            isChecked ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"
                                          }`}
                                        >
                                          <Checkbox
                                            checked={isChecked}
                            onCheckedChange={() => {
                              const next = isChecked
                                ? form.selected_modules.filter((n) => n !== mod.name)
                                : [...form.selected_modules, mod.name];
                              const { totalMonthly, totalOneTime } = recalcPrices(form.selected_products, next);
                              setForm((prev) => ({ ...prev, selected_modules: next, monthly_price: totalMonthly, one_time_fee: totalOneTime }));
                            }}
                                            className="mt-0.5"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-medium">{mod.name}</span>
                                              <span className="text-sm font-medium text-primary">{(Number(mod.monthly_price) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Mon.</span>
                                            </div>
                                            {mod.description && (
                                              <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                  {form.selected_modules.length > 0 && (
                                    <div className="p-2 rounded bg-muted/50 text-sm">
                                      <span className="text-muted-foreground">Zusatzmodule: </span>
                                      <span className="font-medium">
                                        +{ebmModules
                                          .filter((m: any) => form.selected_modules.includes(m.name))
                                          .reduce((sum: number, m: any) => sum + (Number(m.monthly_price) || 0), 0)
                                          .toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Mon.
                                      </span>
                                    </div>
                                  )}
                                  {ebmProduct?.licensing_notes && (
                                    <div className="p-2 rounded border bg-muted/30 text-xs text-muted-foreground">
                                      ℹ️ {ebmProduct.licensing_notes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* HFX Doku Details – BSNR/LANR (nur wenn EBM nicht auch gewählt) */}
                          {p.name === "HFX Doku" && isSelected && !form.selected_products.includes("HFX EBM") && (
                            <div className="ml-4 pl-4 border-l-2 border-primary/30 space-y-3 mt-1 mb-1">
                              <h5 className="text-xs font-semibold text-primary uppercase tracking-wider">HFX Doku – BSNR &amp; LANR</h5>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label>BSNR</Label>
                                  <Input value={form.bsnr} onChange={(e) => set("bsnr", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                  {validateBsnr(form.bsnr) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.bsnr)}</p>}
                                </div>
                                <div>
                                  <Label>LANR 1</Label>
                                  <Input value={form.lanr} onChange={(e) => set("lanr", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                  {validateLanr(form.lanr) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr)}</p>}
                                </div>
                                <div>
                                  <Label>LANR 2</Label>
                                  <Input value={form.lanr_2} onChange={(e) => set("lanr_2", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                  {validateLanr(form.lanr_2) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr_2)}</p>}
                                </div>
                                <div>
                                  <Label>LANR 3</Label>
                                  <Input value={form.lanr_3} onChange={(e) => set("lanr_3", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                  {validateLanr(form.lanr_3) && <p className="text-xs text-destructive mt-1">{validateLanr(form.lanr_3)}</p>}
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-xs text-muted-foreground mt-2 block">Weitere Betriebsstätten</Label>
                                </div>
                                <div>
                                  <Label>Weitere BSNR 1</Label>
                                  <Input value={form.weitere_bsnr_1} onChange={(e) => set("weitere_bsnr_1", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                  {validateBsnr(form.weitere_bsnr_1) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_1)}</p>}
                                </div>
                                <div>
                                  <Label>Weitere BSNR 2</Label>
                                  <Input value={form.weitere_bsnr_2} onChange={(e) => set("weitere_bsnr_2", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                  {validateBsnr(form.weitere_bsnr_2) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_2)}</p>}
                                </div>
                                <div>
                                  <Label>Weitere BSNR 3</Label>
                                  <Input value={form.weitere_bsnr_3} onChange={(e) => set("weitere_bsnr_3", e.target.value)} placeholder="9 Ziffern, endet auf 00" maxLength={9} />
                                  {validateBsnr(form.weitere_bsnr_3) && <p className="text-xs text-destructive mt-1">{validateBsnr(form.weitere_bsnr_3)}</p>}
                                </div>
                                <div>
                                  <Label>Weitere LANR</Label>
                                  <Input value={form.weitere_lanr} onChange={(e) => set("weitere_lanr", e.target.value)} placeholder="9 Ziffern" maxLength={9} />
                                  {validateLanr(form.weitere_lanr) && <p className="text-xs text-destructive mt-1">{validateLanr(form.weitere_lanr)}</p>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}


              {form.selected_products.length > 0 && (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 overflow-hidden">
                  <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/15">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Produktübersicht</p>
                  </div>
                  <div className="p-4 space-y-2">
                    {(() => {
                      const now = new Date();
                      return products
                        .filter((pr: any) => form.selected_products.includes(pr.name))
                        .map((pr: any) => {
                          const hasPromo = pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now;
                          const baseFeeWaived = hasPromo && pr.promo_base_fee_end_date && new Date(pr.promo_base_fee_end_date) >= now;
                          const regularMonthly = Number(pr.monthly_price ?? pr.base_license_price) || 0;
                          const price = baseFeeWaived ? 0 : regularMonthly;
                          const regularPerUnit = pr.price_per_unit != null ? (Number(pr.price_per_unit) || 0) : null;
                          const perUnit = hasPromo
                            ? (pr.promo_price != null ? (Number(pr.promo_price) || 0) : regularPerUnit)
                            : regularPerUnit;
                          const perUnitLabel = pr.price_per_unit_label || "Stk.";
                          return (
                            <div key={pr.id} className="space-y-0.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground font-medium truncate mr-2">{pr.name}</span>
                                <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                                  {hasPromo && baseFeeWaived ? (
                                    <><span className="line-through text-muted-foreground/60 mr-1">{regularMonthly.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span><span className="text-success font-medium">0,00 €</span></>
                                  ) : (
                                    <>{price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</>
                                  )}
                                  <span className="text-xs text-muted-foreground/80 ml-1">Grundgebühr</span>
                                </span>
                              </div>
                              {perUnit != null && (
                                <div className="flex items-center justify-between text-xs pl-3">
                                  <span className="text-muted-foreground">zzgl. pro {perUnitLabel}</span>
                                  <span className="text-muted-foreground tabular-nums">{perUnit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/{perUnitLabel}</span>
                                </div>
                              )}
                            </div>
                          );
                        });
                    })()}
                    {form.selected_modules.length > 0 && ebmModules
                      .filter((m: any) => form.selected_modules.includes(m.name))
                      .map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between text-sm pl-3 border-l-2 border-primary/20">
                          <span className="text-muted-foreground truncate mr-2">{m.name}</span>
                          <span className="text-muted-foreground whitespace-nowrap tabular-nums">{(Number(m.monthly_price) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                        </div>
                      ))
                    }
                  </div>
                  <div className="px-4 py-3 bg-primary/10 border-t border-primary/15 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{form.selected_products.length} Produkt(e){form.selected_modules.length > 0 ? `, ${form.selected_modules.length} Modul(e)` : ""}</p>
                      {(() => {
                        const now = new Date();
                        const promoProducts = products.filter((pr: any) => form.selected_products.includes(pr.name) && pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now);
                        if (promoProducts.length > 0) {
                          return <p className="text-xs text-success font-medium">🎉 Aktionspreis aktiv</p>;
                        }
                        return null;
                      })()}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground tabular-nums">{(form.monthly_price || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €<span className="text-xs font-normal text-muted-foreground">/Mon.</span></p>
                      {form.one_time_fee > 0 && <p className="text-xs text-muted-foreground">+ {form.one_time_fee.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € einmalig</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>


            {form.selected_products.includes("HFX Praxismanagement Zahnmedizin") && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Praxismanagement Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Genutztes Praxissystem</Label>
                  <Input value={form.praxissystem} onChange={(e) => set("praxissystem", e.target.value)} placeholder="z.B. Dampsoft, CGM Z1, Charly..." />
                </div>
                <div>
                  <Label>Geschätzter Stundenaufwand / Woche</Label>
                  <Input value={form.stundenaufwand_pro_woche} onChange={(e) => set("stundenaufwand_pro_woche", e.target.value)} placeholder="z.B. 5 Stunden" />
                </div>
              </div>
            </div>
            )}
            {/* Laufzeit */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Laufzeit & Kündigung</h4>
              <div>
                 <Label className="text-xs text-muted-foreground">Vertragsbeginn</Label>
                 <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={fieldErr("start_date") ? "border-destructive focus-visible:ring-destructive" : ""} />
                 {fieldErr("start_date") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
               </div>
            </div>

            {/* Preisübersicht (automatisch aus Produktauswahl) */}
            {form.selected_products.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preisübersicht</h4>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Grundgebühr /Mon.</span>
                      {isAdmin ? (
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.monthly_price}
                          onChange={(e) => set("monthly_price", parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm font-medium"
                        />
                      ) : (
                        <p className="font-medium">{(form.monthly_price || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</p>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Einmalgebühr</span>
                      {isAdmin ? (
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.one_time_fee}
                          onChange={(e) => set("one_time_fee", parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm font-medium"
                        />
                      ) : (
                        <p className="font-medium">{(form.one_time_fee || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</p>
                      )}
                    </div>
                    {/* Stückpreis pro Rechnung – aus Produktmatrix, Admin kann überschreiben */}
                    {(() => {
                      const now = new Date();
                      const selectedProduct = products.find((pr: any) => form.selected_products.includes(pr.name) && (pr.price_per_unit != null || pr.promo_price != null));
                      if (!selectedProduct && !isAdmin) return null;
                      const hasPromo = selectedProduct?.promo_price != null && selectedProduct?.promo_end_date && new Date(selectedProduct.promo_end_date) >= now;
                      const defaultPerUnit = hasPromo ? (Number(selectedProduct?.promo_price) || 0) : (Number(selectedProduct?.price_per_unit) || 0);
                      const perUnitLabel = selectedProduct?.price_per_unit_label || "Rechnung";
                      const currentValue = (form as any).qodia_unit_price ?? defaultPerUnit;
                      return (
                        <div>
                          <span className="text-muted-foreground">Stückpreis/{perUnitLabel}</span>
                          {isAdmin ? (
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              value={currentValue}
                              onChange={(e) => set("qodia_unit_price" as any, parseFloat(e.target.value) || 0)}
                              className="mt-1 h-8 text-sm font-medium"
                            />
                          ) : (
                            <p className="font-medium">{(currentValue || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground mt-2">🔑 Admin: Preise können hier individuell angepasst werden.</p>
                  )}
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground mt-2">💡 Preise werden automatisch aus der Produktmatrix berechnet.</p>
                  )}
                </div>
                <div>
                  <Label>Zahlungsintervall</Label>
                  <Select value={form.payment_interval} onValueChange={(v) => set("payment_interval", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monatlich">Monatlich</SelectItem>
                      <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                      <SelectItem value="jaehrlich">Jährlich</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Status */}
            {editId && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status</h4>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="gekuendigt">Gekündigt</SelectItem>
                    <SelectItem value="beendet">Beendet</SelectItem>
                    <SelectItem value="gesperrt">Gesperrt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Zahlungsmethode */}
            {/* Rechnungs-E-Mail */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">E-Mail für Rechnungsempfang</h4>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rechnungs_email_identisch"
                  checked={form.rechnungs_email_identisch}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    set("rechnungs_email_identisch", isChecked);
                    if (isChecked) {
                      set("rechnungs_email", form.email);
                    }
                  }}
                />
                <Label htmlFor="rechnungs_email_identisch" className="cursor-pointer">
                  Identisch mit E-Mail-Adresse der Praxis
                </Label>
              </div>
              <Input
                value={form.rechnungs_email}
                onChange={(e) => {
                  set("rechnungs_email", e.target.value);
                  if (form.rechnungs_email_identisch) set("rechnungs_email_identisch", false);
                }}
                placeholder="rechnung@example.de"
                type="email"
                disabled={form.rechnungs_email_identisch}
                className={form.rechnungs_email_identisch ? "opacity-60" : ""}
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Zahlungsmethode</h4>
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <span className="font-medium text-foreground">Stripe</span>
                  <p>Zahlung per Kreditkarte oder SEPA-Lastschrift über Stripe Checkout.</p>
                  {!hasStripeProducts(form.selected_products) && form.selected_products.length > 0 && (
                    <p className="mt-1 text-warning font-medium">⚠ Für die gewählten Produkte ist noch kein Stripe-Preis hinterlegt.</p>
                  )}
                </div>
              </div>
              {/* SEPA Mandate Consent */}
              <div className="flex items-start gap-3 p-3 rounded-lg border border-input bg-background">
                <Checkbox
                  id="mandate_accepted"
                   checked={!!form.mandate_accepted}
                   onCheckedChange={(checked) => set("mandate_accepted", checked === true)}
                  className="mt-0.5"
                />
                <div>
                   <Label htmlFor="mandate_accepted" className="cursor-pointer font-medium text-foreground">
                     Zustimmung zur automatischen Zahlung
                   </Label>
                   <p className="text-xs text-muted-foreground mt-0.5">
                     Wird beim digitalen Vertragsabschluss automatisch erteilt. Der Kunde stimmt dem Einzug der fälligen Beträge per SEPA-Lastschrift / Kreditkarte zu.
                   </p>
                </div>
              </div>
              {/* Qodia Unit Price */}
              <div className="grid gap-2">
                <Label htmlFor="qodia_unit_price">Preis pro Qodia-Vorgang (€)</Label>
                <Input
                  id="qodia_unit_price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={(form as any).qodia_unit_price ?? 0.99}
                  onChange={(e) => set("qodia_unit_price" as any, parseFloat(e.target.value) || 0)}
                  placeholder="z.B. 0.99"
                  className="max-w-[180px]"
                />
                <p className="text-xs text-muted-foreground">Interner Stückpreis für variablen Qodia-Verbrauch. Wird von Qodia gemeldete Mengen multipliziert.</p>
              </div>
            </div>


            {/* Digitaler Vertragsabschluss Hinweis */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <CheckCircle className="h-4 w-4" />
                Digitaler Vertragsabschluss
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Nach dem Speichern erhält der Kunde per E-Mail einen Zahlungslink (Stripe). Mit Abschluss der Zahlung wird der Vertrag automatisch aktiviert. Eine manuelle Unterschrift ist nicht erforderlich.
              </p>
            </div>

            {/* Notizen */}
            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Zusätzliche Informationen..." />
            </div>

            {/* AGB-Zustimmung */}
            {editId && <AgbAcceptanceSection contractId={editId} />}


           </fieldset>

            {/* Footer: voller Speichern-Footer für alle Rollen (auch bei locked Verträgen) */}
            <DialogFooter className="flex-col gap-2">
              {!editId && hasContractDuplicates && (
                <div className={`w-full rounded-lg border p-3 text-sm ${isProductiveSave ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold mb-1">
                        {isProductiveSave ? "Möglicher Vertrags-Dublette gefunden" : "Hinweis: ähnliche Verträge vorhanden"}
                      </div>
                      <ul className="list-disc ml-5 space-y-0.5 text-xs">
                        {contractDuplicates.map((d: any) => (
                          <li key={d.row.id}>
                            <span className="font-mono">{d.row.contract_number || d.row.hfx_customer_number || d.row.id.slice(0, 8)}</span>
                            {" — "}{d.row.praxis || `${d.row.vorname ?? ""} ${d.row.nachname ?? ""}`.trim() || "—"}
                            {" "}<span className="text-muted-foreground">({d.row.status})</span>
                            {" — Treffer: "}<span className="text-muted-foreground">{d.reasons.join(", ")}</span>
                          </li>
                        ))}
                      </ul>
                      {isProductiveSave && (
                        <label className="mt-2 flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={forceCreateDuplicate} onCheckedChange={(v) => setForceCreateDuplicate(!!v)} />
                          <span className="text-xs">Trotzdem anlegen (Dublette bewusst akzeptiert)</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Zeile 1: PDF-Aktionen */}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => handlePreviewPdf(form)} className="gap-1.5 flex-1 sm:flex-none" disabled={!isFormComplete}>
                  <Eye className="h-4 w-4" />
                  Vorschau PDF
                </Button>
              </div>

              {/* Zeile 2: Speichern-Aktionen */}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={closeDialog} className="flex-1 sm:flex-none">Abbrechen</Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleSaveDraft} disabled={upsertMutation.isPending || sendingBuchungsmailDialog} className="flex-1 sm:flex-none">
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Als Entwurf
                </Button>
                {/* Digitaler Vertragsabschluss – primary action, listed first */}
                <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="flex-1 sm:flex-none">
                      <Button type="submit" size="sm" disabled={upsertMutation.isPending || sendingBuchungsmailDialog || !isFormComplete} className="w-full">
                        {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        {editId ? "Speichern" : "Digitaler Vertragsabschluss"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isFormComplete && (
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-semibold mb-1">Fehlende Pflichtfelder:</p>
                      <ul className="list-disc pl-4 text-xs space-y-0.5">
                        {getMissingFields().map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
                </TooltipProvider>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nachtrag / Vertragserweiterung Dialog */}
      <Dialog open={extensionDialogOpen} onOpenChange={(o) => { if (!o) { setExtensionDialogOpen(false); setExtensionBaseContract(null); } }}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Produkt hinzubuchen – Nachtrag
            </DialogTitle>
            <DialogDescription>
              Erstellt einen Nachtrag zum bestehenden Vertrag. Der Originalvertrag bleibt unverändert.
            </DialogDescription>
          </DialogHeader>

          {extensionBaseContract && (
            <div className="space-y-5">
              {/* Readonly parent contract info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Stammvertrag</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <span className="text-muted-foreground">Kunde</span>
                  <span className="font-medium">{extensionBaseContract.customer_name}</span>
                  <span className="text-muted-foreground">Praxis</span>
                  <span>{extensionBaseContract.praxis || "–"}</span>
                  <span className="text-muted-foreground">HFX-Nr.</span>
                  <span className="font-mono text-xs">{extensionBaseContract.hfx_customer_number || "–"}</span>
                  <span className="text-muted-foreground">Bestehende Produkte</span>
                  <span className="flex flex-wrap gap-1">
                    {(extensionBaseContract.product_name || "").split(", ").map((p: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs px-1.5 py-0">{p}</Badge>
                    ))}
                  </span>
                </div>
              </div>

              <Separator />

              {/* New product fields */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ext-product">Neues Produkt / Leistung *</Label>
                  <Input
                    id="ext-product"
                    placeholder="z.B. HFX Doku, HFX QM …"
                    value={extensionForm.product_name}
                    onChange={(e) => setExtensionForm(f => ({ ...f, product_name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ext-start">Vertragsbeginn *</Label>
                    <Input
                      id="ext-start"
                      type="date"
                      value={extensionForm.start_date}
                      onChange={(e) => setExtensionForm(f => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ext-price">Monatspreis (€)</Label>
                    <Input
                      id="ext-price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={extensionForm.monthly_price}
                      onChange={(e) => setExtensionForm(f => ({ ...f, monthly_price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-fee">Einmalzahlung (€)</Label>
                  <Input
                    id="ext-fee"
                    type="number"
                    min={0}
                    step={0.01}
                    value={extensionForm.one_time_fee}
                    onChange={(e) => setExtensionForm(f => ({ ...f, one_time_fee: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-notes">Anmerkungen</Label>
                  <Textarea
                    id="ext-notes"
                    placeholder="Optional: Hinweise zur Erweiterung …"
                    rows={2}
                    value={extensionForm.notes}
                    onChange={(e) => setExtensionForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => { setExtensionDialogOpen(false); setExtensionBaseContract(null); }} disabled={extensionSaving}>
              Abbrechen
            </Button>
            <Button variant="outline" onClick={() => handleSaveExtension(false)} disabled={extensionSaving}>
              {extensionSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Als Entwurf speichern
            </Button>
            <Button onClick={() => handleSaveExtension(true)} disabled={extensionSaving}>
              {extensionSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Nachtrag aktivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E-Mail Bestätigungsdialog */}
      <Dialog open={!!emailConfirmContract} onOpenChange={(open) => { if (!open) setEmailConfirmContract(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              E-Mail senden?
            </DialogTitle>
            <DialogDescription>
              Die Vertragsunterlagen (Vertragsdokument + Produktvorschau) werden per E-Mail versendet an:
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm font-medium break-all">
            {emailConfirmContract?.email}
          </div>
          {emailConfirmContract?.customer_name && (
            <p className="text-sm text-muted-foreground -mt-1">
              Empfänger: <span className="text-foreground font-medium">{emailConfirmContract.customer_name}</span>
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEmailConfirmContract(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={sendingEmailId === emailConfirmContract?.id}
              onClick={() => {
                const c = emailConfirmContract;
                setEmailConfirmContract(null);
                handleSendEmail(c);
              }}
            >
              {sendingEmailId === emailConfirmContract?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PaperContractDialog removed – paper flow decommissioned */}

      {/* Delete Contract Confirmation */}
      <AlertDialog open={!!deleteContractTarget} onOpenChange={(open) => !open && setDeleteContractTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Vertrag <strong>{deleteContractTarget?.customer_name}</strong> ({deleteContractTarget?.product_name}) wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteContractTarget) {
                  deleteMutation.mutate(deleteContractTarget.id, {
                    onSuccess: () => setDeleteContractTarget(null),
                  });
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {kundenDialogHfx && (
        <KundenDialog
          open={!!kundenDialogHfx}
          onClose={() => {
            setKundenDialogHfx(null);
            queryClient.invalidateQueries({ queryKey: ["contracts"] });
          }}
          input={{ type: "hfx", hfxNumber: kundenDialogHfx }}
        />
      )}
    </MainLayout>
  );
}
