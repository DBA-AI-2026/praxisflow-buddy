import { useState, useRef, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, FileText, MoreHorizontal, Pencil, Trash2, Upload, Download, Loader2, Eye,
} from "lucide-react";
import { generateContractPdf } from "@/lib/generateContractPdf";
import { fillContractTemplate } from "@/lib/fillContractTemplate";
import { validateIban } from "@/lib/validateIban";
import { validateBic } from "@/lib/validateBic";
import { lookupBicFromIban } from "@/lib/lookupBic";
import foxLogoUrl from "@/assets/fox-logo.jpeg";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import SignaturePad from "signature_pad";

const statusConfig: Record<string, { label: string; class: string }> = {
  entwurf: { label: "Entwurf", class: "bg-muted text-muted-foreground" },
  aktiv: { label: "Aktiv", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  gekuendigt: { label: "Gekündigt", class: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  beendet: { label: "Beendet", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

// Product options are now loaded from the database

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
  
  license_count: number;
  start_date: string;
  duration_months: number;
  cancellation_period_months: number;
  auto_renewal: boolean;
  monthly_price: number;
  one_time_fee: number;
  discount_percent: number;
  payment_interval: string;
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
  license_count: 1,
  start_date: new Date().toISOString().split("T")[0],
  duration_months: 12,
  cancellation_period_months: 3,
  auto_renewal: true,
  monthly_price: 0,
  one_time_fee: 0,
  discount_percent: 0,
  payment_interval: "monatlich",
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
  status: "entwurf",
  signature_data: "",
  vertrieb_signature_data: "",
};

export default function Vertraege() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [bicLoading, setBicLoading] = useState(false);
  const { user, profile } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  const upsertMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
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

        const { data: urlData } = supabase.storage
          .from("contracts")
          .getPublicUrl(filePath);
        documentUrl = urlData.publicUrl;
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
        notes: data.notes || null,
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
        ...(documentUrl ? { document_url: documentUrl, document_name: documentName } : {}),
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
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: editId ? "Vertrag aktualisiert" : "Vertrag erstellt" });
      // Auto-open template PDF after creating a new contract (only if not a draft)
      if (!editId && variables.status !== "entwurf") {
        handleTemplatePdf(form);
        // Send confirmation email if email is provided
        if (form.email) {
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
              adresse: form.adresse, telefon: form.telefon, email: form.email,
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
            });
            const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
            const customerName = [form.vorname, form.nachname].filter(Boolean).join(" ");
            await supabase.functions.invoke("send-contract-email", {
              body: {
                email: form.email,
                customerName,
                pdfBase64,
                products: form.selected_products.join(", "),
                startDate: form.start_date,
              },
            });
            toast({ title: "Bestätigungs-E-Mail gesendet", description: `An ${form.email}` });
          } catch (emailErr: any) {
            console.error("Email send error:", emailErr);
            toast({ title: "E-Mail konnte nicht gesendet werden", description: emailErr.message, variant: "destructive" });
          }
        }
      }
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
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

      const { data: urlData } = supabase.storage
        .from("contracts")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("contracts")
        .update({ document_url: urlData.publicUrl, document_name: uploadFile.name })
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
    setForm(emptyForm);
    setFile(null);
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
      
      license_count: contract.license_count,
      start_date: contract.start_date,
      duration_months: contract.duration_months,
      cancellation_period_months: contract.cancellation_period_months,
      auto_renewal: contract.auto_renewal,
      monthly_price: contract.monthly_price,
      one_time_fee: contract.one_time_fee,
      discount_percent: contract.discount_percent,
      payment_interval: contract.payment_interval,
      notes: contract.notes || "",
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
    });
    setDialogOpen(true);
  };

  const filtered = contracts.filter(
    (c: any) =>
      c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.sales_partner_name?.toLowerCase().includes(search.toLowerCase())
  );

  const requiredFieldLabels: Record<string, string> = {
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
    kontoinhaber: "Kontoinhaber",
    kontoinhaber_strasse: "Straße Kontoinhaber",
    kontoinhaber_plz_ort: "PLZ/Ort Kontoinhaber",
    bank_name: "Bank",
    iban: "IBAN",
    bic: "BIC",
    start_date: "Vertragsbeginn",
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
    if (!form.signature_data) missing.push("Unterschrift Kunde");
    if (!form.vertrieb_signature_data) missing.push("Unterschrift Vertrieb");
    return missing;
  };

  const isFormComplete = getMissingFields().length === 0;

  const handleSaveDraft = () => {
    // Require at least a customer name or praxis for draft
    const hasMinimum = form.praxis.trim() !== "" || form.vorname.trim() !== "" || form.nachname.trim() !== "";
    if (!hasMinimum) {
      toast({ title: "Mindestangabe fehlt", description: "Bitte mindestens Praxis oder einen Namen angeben.", variant: "destructive" });
      return;
    }
    // Force status to Entwurf for draft saves
    const draftForm = { ...form, status: "entwurf" };
    upsertMutation.mutate(draftForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = getMissingFields();
    if (missing.length > 0) {
      toast({ title: "Fehlende Pflichtfelder", description: missing.join(", "), variant: "destructive" });
      return;
    }
    if (!validateIban(form.iban).valid) {
      toast({ title: "Ungültige IBAN", description: validateIban(form.iban).message, variant: "destructive" });
      return;
    }
    if (!validateBic(form.bic).valid) {
      toast({ title: "Ungültige BIC", description: validateBic(form.bic).message, variant: "destructive" });
      return;
    }
    upsertMutation.mutate(form);
  };

  const set = (field: keyof ContractFormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

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
      const pdfBytes = await generateContractPdf({ ...contractData, signature_data: sigData, product_price_details }, logoBytes);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
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
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
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
          <Button onClick={() => { setForm({ ...emptyForm, sales_partner_name: profile?.full_name || "" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Vertrag
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(["entwurf", "aktiv", "gekuendigt", "beendet"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{statusConfig[s].label}</p>
                <p className="text-2xl font-semibold">{contracts.filter((c: any) => c.status === s).length}</p>
              </div>
              <Badge className={statusConfig[s].class}>{statusConfig[s].label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <table className="data-table">
              <thead className="bg-muted/50">
                 <tr>
                   <th>HFX-Nr.</th>
                   <th>Kunde</th>
                   <th>MP-Nr.</th>
                   <th>Produkt</th>
                   <th>Vertriebspartner</th>
                   <th>Laufzeit</th>
                   <th>Monatspreis</th>
                   <th>Status</th>
                   <th>Dokument</th>
                   <th className="w-12"></th>
                 </tr>
              </thead>
              <tbody>
                 {filtered.map((c: any) => (
                   <tr key={c.id}>
                     <td className="text-xs text-muted-foreground font-mono">{c.hfx_customer_number || "–"}</td>
                     <td className="font-medium text-foreground">{c.customer_name}</td>
                     <td className="text-muted-foreground text-sm">{c.mp_nr || "–"}</td>
                    <td className="text-foreground">{c.product_name}</td>
                    <td className="text-muted-foreground">{c.sales_partner_name || "–"}</td>
                    <td className="text-muted-foreground">
                      {c.start_date && format(new Date(c.start_date), "dd.MM.yy", { locale: de })}
                      {" – "}
                      {c.end_date && format(new Date(c.end_date), "dd.MM.yy", { locale: de })}
                      <span className="block text-xs">{c.duration_months} Mon.</span>
                    </td>
                    <td className="font-medium text-foreground">
                      {Number(c.monthly_price).toLocaleString("de-DE")} €
                      {Number(c.discount_percent) > 0 && (
                        <span className="block text-xs text-green-600">-{c.discount_percent}%</span>
                      )}
                    </td>
                    <td>
                      <Badge className={statusConfig[c.status]?.class || ""}>
                        {statusConfig[c.status]?.label || c.status}
                      </Badge>
                    </td>
                     <td>
                       <div className="flex flex-col gap-1">
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
                         {c.document_url && (
                           <a href={c.document_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                             <Download className="h-3 w-3" />
                             <span className="truncate max-w-[80px]">{c.document_name || "PDF"}</span>
                           </a>
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
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
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
                  <Input value={form.praxis} onChange={(e) => set("praxis", e.target.value)} placeholder="Name der Praxis" required />
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
                  <Input value={form.vorname} onChange={(e) => set("vorname", e.target.value)} required />
                </div>
                <div>
                  <Label>Nachname *</Label>
                  <Input value={form.nachname} onChange={(e) => set("nachname", e.target.value)} required />
                </div>
                <div className="col-span-2 pt-2">
                  <h4 className="font-semibold text-sm text-foreground">Praxisanschrift</h4>
                </div>
                <div className="col-span-2">
                  <Label>Adresse (Straße, Hausnummer) *</Label>
                  <Input value={form.praxisanschrift} onChange={(e) => set("praxisanschrift", e.target.value)} placeholder="Straße und Hausnummer der Praxis" />
                </div>
                <div>
                  <Label>PLZ *</Label>
                  <Input value={form.plz} onChange={(e) => set("plz", e.target.value)} placeholder="z.B. 10115" />
                </div>
                <div>
                  <Label>Ort *</Label>
                  <Input value={form.ort} onChange={(e) => set("ort", e.target.value)} placeholder="z.B. Berlin" />
                </div>
                <div>
                  <Label>Telefonnummer</Label>
                  <Input value={form.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="+49..." type="tel" />
                </div>
                <div>
                  <Label>E-Mail-Adresse</Label>
                  <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="praxis@example.de" type="email" />
                </div>
                <div>
                  <Label>MP-Nummer</Label>
                  <Input value={form.mp_nr} onChange={(e) => set("mp_nr", e.target.value)} placeholder="z.B. MP-12345" />
                </div>
                <div>
                  <Label>Vertriebspartner</Label>
                  <Input value={form.sales_partner_name} onChange={(e) => set("sales_partner_name", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Produkte – Mehrfachauswahl */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Produkte (Mehrfachauswahl)</h4>
              <div className="grid grid-cols-2 gap-2">
                {products.map((p: any) => {
                  const isSelected = form.selected_products.includes(p.name);
                  const today = new Date();
                  const hasPromo = p.promo_price != null && p.promo_end_date && new Date(p.promo_end_date) >= today;
                  const baseFeeWaived = hasPromo && p.promo_base_fee_end_date && new Date(p.promo_base_fee_end_date) >= today;
                  const displayMonthly = baseFeeWaived ? 0 : Number(p.monthly_price);
                  const displayPerUnit = hasPromo ? Number(p.promo_price) : (p.price_per_unit != null ? Number(p.price_per_unit) : null);

                  const recalcPrices = (nextProducts: string[]) => {
                    const now = new Date();
                    const totalMonthly = products
                      .filter((pr: any) => nextProducts.includes(pr.name))
                      .reduce((sum: number, pr: any) => {
                        const promoActive = pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now;
                        const bfWaived = promoActive && pr.promo_base_fee_end_date && new Date(pr.promo_base_fee_end_date) >= now;
                        return sum + (bfWaived ? 0 : Number(pr.monthly_price));
                      }, 0);
                    const totalOneTime = products
                      .filter((pr: any) => nextProducts.includes(pr.name))
                      .reduce((sum: number, pr: any) => sum + Number(pr.one_time_fee), 0);
                    return { totalMonthly, totalOneTime };
                  };

                  return (
                    <div key={p.id} className="space-y-1">
                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const next = isSelected
                              ? form.selected_products.filter((n) => n !== p.name)
                              : [...form.selected_products, p.name];
                            const { totalMonthly, totalOneTime } = recalcPrices(next);
                            setForm((prev) => ({
                              ...prev,
                              selected_products: next,
                              monthly_price: totalMonthly,
                              one_time_fee: totalOneTime,
                            }));
                          }}
                          className="rounded border-input"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{p.name}</span>
                          {hasPromo ? (
                            <>
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium block">
                                🎉 Aktion: {displayPerUnit != null ? `${displayPerUnit.toLocaleString("de-DE")} €/${p.price_per_unit_label || "Stk."} dauerhaft` : `${displayMonthly.toLocaleString("de-DE")} €/Mon.`}
                              </span>
                              {baseFeeWaived && (
                                <span className="text-xs text-green-600 dark:text-green-400 block">
                                  Keine Grundgebühr bis {new Date(p.promo_base_fee_end_date).toLocaleDateString("de-DE")}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground block line-through">
                                Regulär: {Number(p.monthly_price).toLocaleString("de-DE")} €/Mon.{p.price_per_unit != null ? ` + ${Number(p.price_per_unit).toLocaleString("de-DE")} €/${p.price_per_unit_label || "Stk."}` : ""}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                Bei Abschluss bis {new Date(p.promo_end_date).toLocaleDateString("de-DE")}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground block">
                              {Number(p.monthly_price).toLocaleString("de-DE")} €/Mon.
                              {p.price_per_unit != null && ` + ${Number(p.price_per_unit).toLocaleString("de-DE")} €/${p.price_per_unit_label || "Stk."}`}
                            </span>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
              {form.selected_products.length > 0 && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm font-medium">
                    Summe: {form.monthly_price.toLocaleString("de-DE")} €/Monat
                    {form.one_time_fee > 0 && ` + ${form.one_time_fee.toLocaleString("de-DE")} € einmalig`}
                  </p>
                  {(() => {
                    const now = new Date();
                    const promoProducts = products.filter((pr: any) => form.selected_products.includes(pr.name) && pr.promo_price != null && pr.promo_end_date && new Date(pr.promo_end_date) >= now);
                    if (promoProducts.length > 0) {
                      return (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          🎉 Aktionspreis aktiv für: {promoProducts.map((pr: any) => pr.name).join(", ")}
                        </p>
                      );
                    }
                    return null;
                  })()}
                  <p className="text-xs text-muted-foreground">{form.selected_products.length} Produkt(e) ausgewählt</p>
                </div>
              )}
              <div className="w-1/2">
                <Label>Lizenzen</Label>
                <Input type="number" min={1} value={form.license_count} onChange={(e) => set("license_count", Number(e.target.value))} />
              </div>
            </div>

            {/* BSNR & LANR – nur bei HFX EBM oder HFX Doku */}
            {(form.selected_products.includes("HFX EBM") || form.selected_products.includes("HFX Doku")) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">BSNR &amp; LANR erfassen</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>BSNR</Label>
                  <Input value={form.bsnr} onChange={(e) => set("bsnr", e.target.value)} placeholder="Betriebsstättennummer" />
                </div>
                <div>
                  <Label>LANR 1</Label>
                  <Input value={form.lanr} onChange={(e) => set("lanr", e.target.value)} placeholder="Lebenslange Arztnummer" />
                </div>
                <div>
                  <Label>LANR 2</Label>
                  <Input value={form.lanr_2} onChange={(e) => set("lanr_2", e.target.value)} placeholder="Weitere LANR" />
                </div>
                <div>
                  <Label>LANR 3</Label>
                  <Input value={form.lanr_3} onChange={(e) => set("lanr_3", e.target.value)} placeholder="Weitere LANR" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mt-2 block">Weitere Betriebsstätten</Label>
                </div>
                <div>
                  <Label>Weitere BSNR 1</Label>
                  <Input value={form.weitere_bsnr_1} onChange={(e) => set("weitere_bsnr_1", e.target.value)} placeholder="Zusätzliche BSNR" />
                </div>
                <div>
                  <Label>Weitere BSNR 2</Label>
                  <Input value={form.weitere_bsnr_2} onChange={(e) => set("weitere_bsnr_2", e.target.value)} placeholder="Zusätzliche BSNR" />
                </div>
                <div>
                  <Label>Weitere BSNR 3</Label>
                  <Input value={form.weitere_bsnr_3} onChange={(e) => set("weitere_bsnr_3", e.target.value)} placeholder="Zusätzliche BSNR" />
                </div>
                <div>
                  <Label>Weitere LANR</Label>
                  <Input value={form.weitere_lanr} onChange={(e) => set("weitere_lanr", e.target.value)} placeholder="Zusätzliche LANR" />
                </div>
              </div>
            </div>
            )}

            {/* Laufzeit */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Laufzeit & Kündigung</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Vertragsbeginn *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
                </div>
                <div>
                  <Label>Laufzeit (Monate)</Label>
                  <Input type="number" min={1} value={form.duration_months} onChange={(e) => set("duration_months", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Kündigungsfrist (Mon.)</Label>
                  <Input type="number" min={0} value={form.cancellation_period_months} onChange={(e) => set("cancellation_period_months", Number(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.auto_renewal} onCheckedChange={(v) => set("auto_renewal", v)} />
                <Label>Automatische Verlängerung</Label>
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
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SEPA-Lastschrifteinzug */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">SEPA-Lastschrifteinzug</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Kontoinhaber</Label>
                  <Input value={form.kontoinhaber} onChange={(e) => set("kontoinhaber", e.target.value)} placeholder="Vor- und Nachname des Kontoinhabers" />
                </div>
                <div>
                  <Label>Straße/Hausnr. (Kontoinhaber)</Label>
                  <Input value={form.kontoinhaber_strasse} onChange={(e) => set("kontoinhaber_strasse", e.target.value)} placeholder="Musterstraße 1" />
                </div>
                <div>
                  <Label>PLZ/Ort (Kontoinhaber)</Label>
                  <Input value={form.kontoinhaber_plz_ort} onChange={(e) => set("kontoinhaber_plz_ort", e.target.value)} placeholder="12345 Musterstadt" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Name der Bank</Label>
                  <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="z.B. Deutsche Bank" />
                </div>
                <div className="sm:col-span-2">
                  <Label>IBAN</Label>
                  <Input
                    value={form.iban.replace(/(.{4})/g, "$1 ").trim()}
                    onChange={async (e) => {
                      const val = e.target.value.toUpperCase().replace(/\s/g, "");
                      set("iban", val);
                      if (val && validateIban(val).valid && !form.bic) {
                        setBicLoading(true);
                        const bic = await lookupBicFromIban(val);
                        if (bic) set("bic", bic);
                        setBicLoading(false);
                      }
                    }}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    className={form.iban && !validateIban(form.iban).valid ? "border-destructive" : ""}
                  />
                  {form.iban && (() => {
                    const result = validateIban(form.iban);
                    if (!result.valid) {
                      return <p className="text-xs text-destructive mt-1">{result.message}</p>;
                    }
                    return <p className="text-xs text-green-600 mt-1">✓ IBAN gültig</p>;
                  })()}
                </div>
                <div>
                  <Label>BIC {bicLoading && <span className="text-xs text-muted-foreground ml-1">(wird ermittelt...)</span>}</Label>
                  <Input
                    value={form.bic}
                    onChange={(e) => set("bic", e.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="COBADEFFXXX"
                    className={form.bic && !validateBic(form.bic).valid ? "border-destructive" : ""}
                  />
                  {form.bic && (() => {
                    const result = validateBic(form.bic);
                    if (!result.valid) {
                      return <p className="text-xs text-destructive mt-1">{result.message}</p>;
                    }
                    return <p className="text-xs text-green-600 mt-1">✓ BIC gültig</p>;
                  })()}
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
            </div>

            {/* Notizen */}
            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Zusätzliche Informationen..." />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => handlePreviewPdf(form)} className="gap-2" disabled={!isFormComplete}>
                <Eye className="h-4 w-4" />
                Vorschau PDF
              </Button>
              
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={closeDialog}>Abbrechen</Button>
                <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Als Entwurf speichern
                </Button>
                <Button type="submit" disabled={upsertMutation.isPending || !isFormComplete}>
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {editId ? "Speichern" : "Vertrag anlegen"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    
    </MainLayout>
  );
}
