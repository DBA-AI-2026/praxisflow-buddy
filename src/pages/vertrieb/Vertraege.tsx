import { useState, useRef, useEffect, useCallback } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, FileText, MoreHorizontal, Pencil, Trash2, Upload, Download, Loader2, Eye, CheckCircle,
  FilePen, FileSignature, CircleCheck, CircleOff, ArchiveX, ShieldBan, ArrowUpDown, ArrowUp, ArrowDown,
  GitMerge,
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
import { CreditCard } from "lucide-react"; // CreditCard used for payment section
import foxLogoUrl from "@/assets/fox-logo.jpeg";
import { useAuth } from "@/hooks/useAuth";
import { PaperContractDialog } from "@/components/contracts/PaperContractDialog";

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
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import SignaturePad from "signature_pad";

// Searchable combobox for sales partner selection
function SalesPartnerCombobox({
  value,
  onChange,
  profiles,
}: {
  value: string;
  onChange: (v: string) => void;
  profiles: { user_id: string; full_name: string; email: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = profiles.find((p) => p.full_name === value);

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
            <span>{selected.full_name}</span>
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
              {profiles.map((p) => (
                <CommandItem
                  key={p.user_id}
                  value={p.full_name}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === p.full_name ? "opacity-100" : "opacity-0"}`}
                  />
                  <span>{p.full_name}</span>
                  {p.email && (
                    <span className="ml-2 text-xs text-muted-foreground">({p.email})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const statusConfig: Record<string, { label: string; class: string; icon: typeof FileText }> = {
  entwurf: { label: "Entwurf", class: "bg-muted text-muted-foreground", icon: FilePen },
  eingegangen: { label: "Eingegangen", class: "bg-warning/10 text-warning", icon: Upload },
  gezeichnet: { label: "Gezeichnet", class: "bg-primary/10 text-primary", icon: FileSignature },
  aktiv: { label: "Aktiv", class: "bg-success/10 text-success", icon: CircleCheck },
  gekuendigt: { label: "Gekündigt", class: "bg-warning/10 text-warning", icon: CircleOff },
  beendet: { label: "Beendet", class: "bg-destructive/10 text-destructive", icon: ArchiveX },
  gesperrt: { label: "Gesperrt", class: "bg-destructive/20 text-destructive", icon: ShieldBan },
};

// Product options are now loaded from the database

type PaymentMethod = "stripe";

interface ContractFormData {
  customer_name: string;
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
}

const emptyForm: ContractFormData = {
  customer_name: "",
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
  start_date: new Date().toISOString().split("T")[0],
  duration_months: 12,
  cancellation_period_months: 6,
  auto_renewal: true,
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
  status: "aktiv",
  signature_data: "",
  vertrieb_signature_data: "",
  signature_mode: "digital" as "digital" | "papier",
  praxissystem: "",
  stundenaufwand_pro_woche: "",
  rechnungs_email: "",
  rechnungs_email_identisch: false,
};

export default function Vertraege() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paperContractOpen, setPaperContractOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [bicLoading, setBicLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [leadHfxNumber, setLeadHfxNumber] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [emailConfirmContract, setEmailConfirmContract] = useState<any | null>(null);
  const { user, profile } = useAuth();
  const { isAdmin, isVertragsabteilung } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const vertriebSignatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const vertriebSignaturePadRef = useRef<SignaturePad | null>(null);

  // Initialize signature pads when dialog opens
  useEffect(() => {
    if (!dialogOpen) {
      signaturePadRef.current = null;
      vertriebSignaturePadRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      // Customer signature pad
      const canvas = signatureCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: "rgb(255, 255, 255)",
          penColor: "rgb(0, 0, 0)",
        });
        if (form.signature_data) {
          signaturePadRef.current.fromDataURL(form.signature_data, {
            width: rect.width,
            height: rect.height,
          });
        }
      }

      // Vertrieb signature pad
      const vCanvas = vertriebSignatureCanvasRef.current;
      if (vCanvas) {
        const vRect = vCanvas.getBoundingClientRect();
        vCanvas.width = vRect.width;
        vCanvas.height = vRect.height;
        vertriebSignaturePadRef.current = new SignaturePad(vCanvas, {
          backgroundColor: "rgb(255, 255, 255)",
          penColor: "rgb(0, 0, 0)",
        });
        if (form.vertrieb_signature_data) {
          vertriebSignaturePadRef.current.fromDataURL(form.vertrieb_signature_data, {
            width: vRect.width,
            height: vRect.height,
          });
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [dialogOpen, form.signature_data, form.vertrieb_signature_data]);

  // Also store lead_id for back-linking
  const [fromLeadId, setFromLeadId] = useState<string | null>(null);

  // Auto-open form when navigating from lead conversion
  // Wait for user to be loaded to avoid RLS failures (created_by = null)
  useEffect(() => {
    const state = location.state as { fromLead?: Record<string, string> } | null;
    if (state?.fromLead && user?.id) {
      const lead = state.fromLead;
      setLeadHfxNumber(lead.hfx_customer_number || null);
      setFromLeadId(lead.lead_id || null);
      setForm({
        ...emptyForm,
        praxis: lead.praxis || "",
        vorname: lead.vorname || "",
        nachname: lead.nachname || "",
        email: lead.email || "",
        plz: lead.plz || "",
        ort: lead.ort || "",
        adresse: lead.adresse || "",
        telefon: lead.telefon || "",
        mp_nr: lead.mp_nr || "",
        notes: lead.nachricht || "",
        customer_name: `${lead.vorname || ""} ${lead.nachname || ""}`.trim() || lead.praxis || "",
        sales_partner_name: profile?.full_name || "",
        status: "entwurf",
      });
      setDialogOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, user?.id, profile?.full_name]);

  const clearSignature = useCallback(() => {
    signaturePadRef.current?.clear();
    set("signature_data", "");
  }, []);

  const clearVertriebSignature = useCallback(() => {
    vertriebSignaturePadRef.current?.clear();
    set("vertrieb_signature_data", "");
  }, []);

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
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
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

  const upsertMutation = useMutation({
    mutationFn: async (data: ContractFormData): Promise<string | null> => {
      if (!user?.id) throw new Error("Nicht authentifiziert – bitte neu einloggen.");
      const endDate = addMonths(new Date(data.start_date), data.duration_months);
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

      // Get signature data from pads
      let sigData = data.signature_data;
      if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
        sigData = signaturePadRef.current.toDataURL();
      }
      let vertriebSigData = data.vertrieb_signature_data;
      if (vertriebSignaturePadRef.current && !vertriebSignaturePadRef.current.isEmpty()) {
        vertriebSigData = vertriebSignaturePadRef.current.toDataURL();
      }

      const record = {
        customer_name: `${data.vorname} ${data.nachname}`.trim() || data.praxis || "Entwurf",
        sales_partner_id: user?.id,
        sales_partner_name: data.sales_partner_name || profile?.full_name || "",
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
        duration_months: data.duration_months,
        end_date: endDate.toISOString().split("T")[0],
        cancellation_period_months: data.cancellation_period_months,
        auto_renewal: data.auto_renewal,
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
        ...(documentUrl ? { document_url: documentUrl, document_name: documentName } : {}),
        ...(leadHfxNumber && !editId ? { hfx_customer_number: leadHfxNumber } : {}),
      };

      let contractId = editId;
      if (editId) {
        const { error } = await supabase.from("contracts").update(record).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("contracts").insert(record).select("id").single();
        if (error) throw error;
        contractId = inserted.id;
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

      // Shared helper: create Praxen entry + convert lead to "kunde"
      const activateContract = async (hfxNr: string | null, praxisData: {
        name: string; adresse?: string | null; plz?: string | null; ort?: string | null;
        telefon?: string | null; email?: string | null; mp_nr?: string | null;
        produkt?: string | null; module?: string[]; preis?: number; buchungs_datum?: string;
        converted_from_lead_id?: string | null;
      }) => {
        // Convert linked lead to "kunde"
        if (hfxNr) {
          await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", hfxNr);
        }
        // Create praxen entry if not exists
        const existingCheck = hfxNr
          ? await supabase.from("praxen").select("id").eq("mp_nr", hfxNr).maybeSingle()
          : { data: null };
        if (!existingCheck.data) {
          await supabase.from("praxen").insert({ ...praxisData, status: "aktiv" });
          queryClient.invalidateQueries({ queryKey: ["praxen"] });
          toast({ title: "✅ Kunde angelegt", description: `${praxisData.name} wurde erfolgreich als Kunden hinterlegt.` });
        }
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      };

      // When a new contract is signed (status = aktiv), auto-create Praxen entry
      if (!editId && variables.status === "aktiv" && contractId) {
        // Set approved_by/approved_at
        await supabase.from("contracts").update({
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        }).eq("id", contractId);

        const hfxNr = leadHfxNumber || variables.mp_nr || null;
        await activateContract(hfxNr, {
          name: variables.praxis || `${variables.vorname} ${variables.nachname}`.trim() || "Unbekannt",
          adresse: variables.praxisanschrift || variables.adresse || null,
          plz: variables.plz || null,
          ort: variables.ort || null,
          telefon: variables.telefon || null,
          email: variables.email || null,
          mp_nr: hfxNr,
          produkt: variables.selected_products.join(", ") || null,
          module: variables.selected_products,
          preis: variables.monthly_price || 0,
          buchungs_datum: variables.start_date || new Date().toISOString().split("T")[0],
          converted_from_lead_id: fromLeadId || null,
        });
      }
      // Auto-open template PDF after creating a new contract (only if not a draft)
      if (!editId && variables.status !== "entwurf") {
        handleTemplatePdf(form);
        // Send confirmation email if email is provided
        if (form.email || profile?.email) {
          try {
            const templateRes = await fetch("/templates/vertrag-honorarfuchs.pdf");
            const templateBytes = await templateRes.arrayBuffer();
            let sigData = form.signature_data;
            if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
              sigData = signaturePadRef.current.toDataURL();
            }
            let vertriebSigData = form.vertrieb_signature_data;
            if (vertriebSignaturePadRef.current && !vertriebSignaturePadRef.current.isEmpty()) {
              vertriebSigData = vertriebSignaturePadRef.current.toDataURL();
            }
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
              end_date: addMonths(new Date(form.start_date), form.duration_months).toISOString().split("T")[0],
              modules: form.selected_products, duration_months: form.duration_months,
              notes: form.notes, signature_data: sigData, vertrieb_signature_data: vertriebSigData,
              praxissystem: form.praxissystem, stundenaufwand_pro_woche: form.stundenaufwand_pro_woche,
              selected_addon_modules: form.selected_modules,
            });
            const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
            const customerName = [form.vorname, form.nachname].filter(Boolean).join(" ");
            await supabase.functions.invoke("send-contract-email", {
              body: {
                email: form.email || null,
                salesPartnerEmail: profile?.email || null,
                customerName,
                pdfBase64,
                products: form.selected_products.join(", "),
                startDate: form.start_date,
              },
            });
            const sentTo = [form.email, profile?.email].filter(Boolean).join(", ");
            toast({ title: "Bestätigungs-E-Mail gesendet", description: `An ${sentTo}` });
          } catch (emailErr: any) {
            console.error("Email send error:", emailErr);
            toast({ title: "E-Mail konnte nicht gesendet werden", description: emailErr.message, variant: "destructive" });
          }
        }

        // Trigger Stripe Checkout if payment method is Stripe and products have Stripe pricing
        if (variables.payment_method === "stripe" && contractId && hasStripeProducts(variables.selected_products)) {
          await handleStripeCheckout(contractId);
        }
      }
      closeDialog();
    },
    onError: (err: Error) => {
      console.error("upsertMutation error:", err);
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
    setLeadHfxNumber(null);
    setFromLeadId(null);
    setForm(emptyForm);
    setFile(null);
    setShowErrors(false);
  };

  const openEdit = (contract: any) => {
    setEditId(contract.id);
    setForm({
      customer_name: contract.customer_name,
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
    });
    setDialogOpen(true);
  };

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
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
      const endDate = addMonths(new Date(extensionForm.start_date), base.duration_months || 12);
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
        end_date: endDate.toISOString().split("T")[0],
        duration_months: base.duration_months || 12,
        cancellation_period_months: base.cancellation_period_months || 6,
        auto_renewal: base.auto_renewal ?? true,
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
      const matchesSearch =
        c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.sales_partner_name?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter ? c.status === statusFilter : true;
      return matchesSearch && matchesStatus;
    })
    .sort((a: any, b: any) => {
      const aVal = new Date(a[sortField] || 0).getTime();
      const bVal = new Date(b[sortField] || 0).getTime();
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

  const handleStatusChange = async (contractId: string, newStatus: string) => {
    const updateData: Record<string, any> = { status: newStatus };
    if (newStatus === "aktiv") {
      updateData.approved_by = user?.id;
      updateData.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("contracts").update(updateData).eq("id", contractId);
    if (error) {
      toast({ title: "Fehler beim Statuswechsel", description: error.message, variant: "destructive" });
      return;
    }

    // When contract is signed/activated: convert linked lead to "kunde" and add to Kunden
    if (newStatus === "aktiv" || newStatus === "gezeichnet") {
      const contract = contracts.find((c: any) => c.id === contractId);
      const hfxNr = contract?.hfx_customer_number || contract?.mp_nr || null;

      if (hfxNr) {
        // Convert linked lead to "kunde"
        await supabase.from("leads").update({ status: "kunde" }).eq("hfx_customer_number", hfxNr);
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      }

      // Create Praxen entry only on "aktiv"
      if (newStatus === "aktiv" && contract) {
        const existingCheck = hfxNr
          ? await supabase.from("praxen").select("id").eq("mp_nr", hfxNr).maybeSingle()
          : { data: null };

        if (!existingCheck.data) {
          await supabase.from("praxen").insert({
            name: contract.praxis || contract.customer_name,
            adresse: contract.praxisanschrift || contract.adresse || null,
            plz: contract.plz || null,
            ort: contract.ort || null,
            telefon: contract.telefon || null,
            email: contract.email || null,
            mp_nr: contract.mp_nr || null,
            produkt: contract.product_name || null,
            module: contract.modules || [],
            preis: contract.monthly_price || 0,
            buchungs_datum: new Date().toISOString().split("T")[0],
            status: "aktiv",
            converted_from_lead_id: (contract as any).converted_from_lead_id || null,
          });
          queryClient.invalidateQueries({ queryKey: ["praxen"] });
          toast({ title: "✅ Kunde angelegt", description: `${contract.praxis || contract.customer_name} wurde erfolgreich als Kunden hinterlegt.` });
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Status aktualisiert", description: `Status auf „${statusConfig[newStatus]?.label ?? newStatus}" gesetzt.` });
  };

  const baseRequiredFieldLabels: Record<string, string> = {
    praxis: "Praxis",
    vorname: "Vorname",
    nachname: "Nachname",
    praxisanschrift: "Adresse (Straße, Hausnummer)",
    plz: "PLZ",
    ort: "Ort",
    telefon: "Telefon",
    email: "E-Mail",
    fachrichtung: "Fachrichtung",
    rechtsform: "Rechtsform",
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
    if (form.signature_mode === "digital") {
      if (!form.signature_data && !(signaturePadRef.current && !signaturePadRef.current.isEmpty())) missing.push("Unterschrift Kunde");
      if (!form.vertrieb_signature_data && !(vertriebSignaturePadRef.current && !vertriebSignaturePadRef.current.isEmpty())) missing.push("Unterschrift Vertrieb");
    }
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
    const hasMinimum = form.praxis.trim() !== "" || form.vorname.trim() !== "" || form.nachname.trim() !== "";
    if (!hasMinimum) {
      toast({ title: "Mindestangabe fehlt", description: "Bitte mindestens Praxis oder einen Namen angeben.", variant: "destructive" });
      return;
    }
    const draftForm = { ...form, status: "entwurf" };
    upsertMutation.mutate(draftForm);
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
          monthly_price: Number(p.monthly_price),
          price_per_unit: p.price_per_unit != null ? Number(p.price_per_unit) : null,
          price_per_unit_label: p.price_per_unit_label || null,
          promo_price: p.promo_price != null ? Number(p.promo_price) : null,
          promo_price_label: p.promo_price_label || null,
          promo_end_date: p.promo_end_date || null,
          promo_base_fee_end_date: p.promo_base_fee_end_date || null,
          has_active_promo: p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= now,
        }));

      const addonNames: string[] = c.selected_addon_modules || [];
      const addon_module_details = ebmModules
        .filter((m: any) => addonNames.includes(m.name))
        .map((m: any) => ({ name: m.name, monthly_price: Number(m.monthly_price) }));

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

  const handlePreviewPdf = async (contractData: Record<string, any>) => {
    try {
      // Capture signature from pad if available
      let sigData = contractData.signature_data;
      if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
        sigData = signaturePadRef.current.toDataURL();
      }
      // Build product price details from selected products
      const now = new Date();
      const selectedNames = contractData.modules?.length ? contractData.modules : (contractData.selected_products || []);
      const product_price_details = products
        .filter((p: any) => selectedNames.includes(p.name))
        .map((p: any) => {
          const hasPromo = p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= now;
          return {
            name: p.name,
            monthly_price: Number(p.monthly_price),
            price_per_unit: p.price_per_unit != null ? Number(p.price_per_unit) : null,
            price_per_unit_label: p.price_per_unit_label || null,
            promo_price: p.promo_price != null ? Number(p.promo_price) : null,
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
        .map((m: any) => ({ name: m.name, monthly_price: Number(m.monthly_price) }));

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

  const handleTemplatePdf = async (contractData: Record<string, any>) => {
    try {
      // Capture signatures from pads if available
      let sigData = contractData.signature_data;
      if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
        sigData = signaturePadRef.current.toDataURL();
      }
      let vertriebSigData = contractData.vertrieb_signature_data;
      if (vertriebSignaturePadRef.current && !vertriebSignaturePadRef.current.isEmpty()) {
        vertriebSigData = vertriebSignaturePadRef.current.toDataURL();
      }
      // Load the template PDF
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
        signature_data: sigData,
        vertrieb_signature_data: vertriebSigData,
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
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Kunde, Produkt oder Partner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/templates/vertrag-honorarfuchs.pdf" download="Honorarfuchs-Vertrag.pdf">
              <Download className="h-4 w-4 mr-2" />
              Vertragsvorlage
            </a>
          </Button>
          <Button variant="outline" onClick={() => setPaperContractOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Papiervertrag nacherfassen
          </Button>
          <Button onClick={() => { setForm({ ...emptyForm, sales_partner_name: profile?.full_name || "" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Vertrag
          </Button>
        </div>
      </div>

      {/* Stats / Filter-Kacheln */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-4 mb-6">
        {(["entwurf", "gezeichnet", "aktiv", "gekuendigt", "beendet", "gesperrt"] as const).map((s) => {
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
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">HFX-Nr.</th>
                   <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Kunde</th>
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
                   <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                     <td className="py-3.5 px-4 text-xs text-muted-foreground font-mono whitespace-nowrap">{c.hfx_customer_number || "–"}</td>
                     <td className="py-3.5 px-4 font-medium text-foreground whitespace-nowrap">{c.customer_name}</td>
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
                        {Number(c.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
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
                           {(["entwurf", "gezeichnet", "aktiv", "gekuendigt", "beendet", "gesperrt"] as const).map((s) => {
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
                         {c.notes?.startsWith("[Papier]") && (
                           <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground border rounded px-1.5 py-0.5 w-fit">
                             📄 Papier
                           </span>
                         )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handlePreviewPdf(c)}
                          >
                            <Eye className="h-3 w-3" />
                            Vorschau
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handleTemplatePdf(c)}
                          >
                            <FileText className="h-3 w-3" />
                            Vertragsdokument
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-primary border-primary/30 hover:bg-primary/5"
                                  disabled={sendingEmailId === c.id || !c.email}
                                  onClick={() => setEmailConfirmContract(c)}
                                >
                                  {sendingEmailId === c.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Mail className="h-3 w-3" />
                                  )}
                                  Per Mail senden
                                </Button>
                              </TooltipTrigger>
                              {!c.email && (
                                <TooltipContent>Keine E-Mail-Adresse hinterlegt</TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
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
                              <span className="truncate max-w-[80px]">{c.document_name || "PDF"}</span>
                            </button>
                          )}
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
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          {(c.status === "aktiv" || c.status === "gezeichnet") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openExtensionDialog(c)} className="text-primary">
                                <GitMerge className="h-4 w-4 mr-2" />
                                Produkt hinzubuchen
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
                                  queryClient.invalidateQueries({ queryKey: ["contracts"] });
                                  toast({ title: "Vertrag freigegeben", description: "Status auf Aktiv gesetzt." });
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Freigeben (Aktiv)
                              </DropdownMenuItem>
                            </>
                          )}
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteMutation.mutate(c.id)}
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

          <form onSubmit={handleSubmit} className="space-y-5">
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
                   <Input value={form.fachrichtung} onChange={(e) => set("fachrichtung", e.target.value)} placeholder="z.B. Allgemeinmedizin, Orthopädie..." className={fieldErr("fachrichtung") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("fachrichtung") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                 </div>
                 <div>
                   <Label>Rechtsform</Label>
                   <Input value={form.rechtsform} onChange={(e) => set("rechtsform", e.target.value)} placeholder="z.B. Einzelpraxis, GbR, MVZ..." className={fieldErr("rechtsform") ? "border-destructive focus-visible:ring-destructive" : ""} />
                   {fieldErr("rechtsform") && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
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
                    onChange={(v) => set("sales_partner_name", v)}
                    profiles={allProfiles}
                  />
                </div>
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

                const recalcPrices = (nextProducts: string[], selectedModules?: string[]) => {
                  const now = new Date();
                  const totalMonthly = products
                    .filter((pr: any) => nextProducts.includes(pr.name))
                    .reduce((sum: number, pr: any) => {
                      const promoActive = pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now;
                      const bfWaived = promoActive && pr.promo_base_fee_end_date && new Date(pr.promo_base_fee_end_date) >= now;
                      return sum + (bfWaived ? 0 : Number(pr.monthly_price));
                    }, 0);
                  const modulesTotal = ebmModules
                    .filter((m: any) => (selectedModules ?? form.selected_modules).includes(m.name))
                    .reduce((sum: number, m: any) => sum + Number(m.monthly_price), 0);
                  const totalOneTime = products
                    .filter((pr: any) => nextProducts.includes(pr.name))
                    .reduce((sum: number, pr: any) => sum + Number(pr.one_time_fee), 0);
                  return { totalMonthly: totalMonthly + modulesTotal, totalOneTime };
                };

                const toggleProduct = (name: string) => {
                  const isSelected = form.selected_products.includes(name);
                  const next = isSelected
                    ? form.selected_products.filter((n) => n !== name)
                    : [...form.selected_products, name];
                  const { totalMonthly, totalOneTime } = recalcPrices(next);
                  setForm((prev) => ({
                    ...prev,
                    selected_products: next,
                    monthly_price: totalMonthly,
                    one_time_fee: totalOneTime,
                  }));
                };

                return (
                  <div className="space-y-1.5">
                    {sorted.map((p: any) => {
                      const isSelected = form.selected_products.includes(p.name);
                      const today = new Date();
                      const hasPromo = p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= today;
                      const baseFeeWaived = hasPromo && p.promo_base_fee_end_date && new Date(p.promo_base_fee_end_date) >= today;
                      const displayMonthly = baseFeeWaived ? 0 : Number(p.monthly_price);
                      const displayPerUnit = hasPromo ? Number(p.promo_price) : (p.price_per_unit != null ? Number(p.price_per_unit) : null);

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
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">{p.name}</span>
                                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap ml-2">
                                  {hasPromo && baseFeeWaived
                                    ? "0 €/Mon."
                                    : `${Number(p.monthly_price).toLocaleString("de-DE")} €/Mon.`}
                                  {displayPerUnit != null && ` + ${displayPerUnit.toLocaleString("de-DE")} €/${p.price_per_unit_label || "Stk."}`}
                                </span>
                              </div>
                              {hasPromo && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                    🎉 Aktion bis {new Date(p.promo_end_date).toLocaleDateString("de-DE")}
                                  </span>
                                  {baseFeeWaived && (
                                    <span className="text-xs text-green-600 dark:text-green-400">
                                      Keine Grundgebühr bis {new Date(p.promo_base_fee_end_date).toLocaleDateString("de-DE")}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground line-through">
                                    Regulär: {Number(p.monthly_price).toLocaleString("de-DE")} €/Mon.
                                    {p.price_per_unit != null && ` + ${Number(p.price_per_unit).toLocaleString("de-DE")} €/${p.price_per_unit_label || "Stk."}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </label>

                          {/* HFX EBM Details – inline unter dem EBM-Button */}
                          {p.name === "HFX EBM" && isSelected && (
                            <div className="ml-4 pl-4 border-l-2 border-primary/30 space-y-4 mt-1 mb-1">
                              <h5 className="text-xs font-semibold text-primary uppercase tracking-wider">HFX EBM – Details</h5>
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
                                              <span className="text-sm font-medium text-primary">{Number(mod.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Mon.</span>
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
                                          .reduce((sum: number, m: any) => sum + Number(m.monthly_price), 0)
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
                          const price = baseFeeWaived ? 0 : Number(pr.monthly_price);
                          return (
                            <div key={pr.id} className="flex items-center justify-between text-sm">
                              <span className="text-foreground font-medium truncate mr-2">{pr.name}</span>
                              <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                                {hasPromo && baseFeeWaived ? (
                                  <><span className="line-through text-muted-foreground/60 mr-1">{Number(pr.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span><span className="text-success font-medium">0,00 €</span></>
                                ) : (
                                  <>{price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</>
                                )}
                              </span>
                            </div>
                          );
                        });
                    })()}
                    {form.selected_modules.length > 0 && ebmModules
                      .filter((m: any) => form.selected_modules.includes(m.name))
                      .map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between text-sm pl-3 border-l-2 border-primary/20">
                          <span className="text-muted-foreground truncate mr-2">{m.name}</span>
                          <span className="text-muted-foreground whitespace-nowrap tabular-nums">{Number(m.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
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
                      <p className="text-lg font-bold text-foreground tabular-nums">{form.monthly_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €<span className="text-xs font-normal text-muted-foreground">/Mon.</span></p>
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
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Monatspreis</span>
                      <p className="font-medium">{form.monthly_price.toLocaleString("de-DE")} €</p>
                    </div>
                    {form.one_time_fee > 0 && (
                      <div>
                        <span className="text-muted-foreground">Einmalgebühr</span>
                        <p className="font-medium">{form.one_time_fee.toLocaleString("de-DE")} €</p>
                      </div>
                    )}
                  </div>
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
            </div>

            {/* Dokument */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsdokument</h4>
              <div className="flex items-center gap-3">
                <Label htmlFor="contract-file" className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent transition-colors text-sm">
                  <Upload className="h-4 w-4" />
                  {file ? file.name : "PDF hochladen"}
                </Label>
                <input
                  id="contract-file"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {/* Unterschriften */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Unterschriften</h4>

              {/* Unterschrift-Modus Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set("signature_mode", "digital")}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${form.signature_mode === "digital" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"}`}
                >
                  ✍️ Digital unterschreiben
                </button>
                <button
                  type="button"
                  onClick={() => set("signature_mode", "papier")}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${form.signature_mode === "papier" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"}`}
                >
                  📄 Papier / Manuell
                </button>
              </div>
              
              {/* Ort & Datum (auto-filled from Vertragsparteien) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ort</Label>
                  <Input value={form.ort} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Datum</Label>
                  <Input value={new Date().toLocaleDateString("de-DE")} disabled className="bg-muted" />
                </div>
              </div>

              <Separator />

              {form.signature_mode === "digital" ? (
                <>
                  {/* Kundenunterschrift */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Unterschrift Kunde</Label>
                    <div className="border rounded-lg p-2 bg-background">
                      <canvas
                        ref={signatureCanvasRef}
                        className="w-full h-32 cursor-crosshair rounded"
                        style={{ touchAction: "none" }}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
                      Kundenunterschrift löschen
                    </Button>
                  </div>

                  <Separator />

                  {/* Vertriebsunterschrift */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Unterschrift Vertriebsmitarbeiter</Label>
                    <div className="border rounded-lg p-2 bg-background">
                      <canvas
                        ref={vertriebSignatureCanvasRef}
                        className="w-full h-32 cursor-crosshair rounded"
                        style={{ touchAction: "none" }}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={clearVertriebSignature}>
                      Vertriebsunterschrift löschen
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-success/40 bg-success/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-success font-medium text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Papierunterschrift – manuell erfasst
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Der Vertrag wurde auf Papier unterschrieben. Digitale Unterschriftspads werden nicht benötigt.
                    Optional können Sie das gescannte Dokument unten hochladen.
                  </p>
                </div>
              )}
            </div>

            {/* Notizen */}
            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Zusätzliche Informationen..." />
            </div>

            <DialogFooter className="flex-col gap-2">
              {/* Zeile 1: PDF-Aktionen */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTemplatePdf({ ...form, signature_data: null, vertrieb_signature_data: null })}
                  className="gap-1.5 flex-1 sm:flex-none"
                  disabled={!form.praxis && !form.vorname && !form.nachname}
                >
                  <Download className="h-4 w-4" />
                  Zum Ausdrucken
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => handlePreviewPdf(form)} className="gap-1.5 flex-1 sm:flex-none" disabled={!isFormComplete}>
                  <Eye className="h-4 w-4" />
                  Vorschau PDF
                </Button>
              </div>

              {/* Zeile 2: Speichern-Aktionen */}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={closeDialog} className="flex-1 sm:flex-none">Abbrechen</Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleSaveDraft} disabled={upsertMutation.isPending} className="flex-1 sm:flex-none">
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Als Entwurf
                </Button>
                <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="flex-1 sm:flex-none">
                      <Button type="submit" size="sm" disabled={upsertMutation.isPending || !isFormComplete} className="w-full">
                        {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        {editId ? "Speichern" : "Vertrag zeichnen"}
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

      <PaperContractDialog open={paperContractOpen} onOpenChange={setPaperContractOpen} />
    </MainLayout>
  );
}
