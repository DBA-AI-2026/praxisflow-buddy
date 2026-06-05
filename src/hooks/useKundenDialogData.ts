/**
 * useKundenDialogData — Daten-Hook für KundenDialog (Etappe 2b-ii).
 *
 * Akzeptiert eine Union-Input (HFX-Nummer | Lead-ID | Kunden-ID), löst nach
 * `hfx_customer_number` auf und liefert Header-Block, abgeleitete Phase,
 * Status-Label sowie Stammdaten-CRUD inkl. RLS-gespiegeltem canEdit.
 *
 * SSOT-Logik:
 *  - Phase lead/qualifiziert → leads ist SSOT
 *  - Phase vertrag/aktiv/service → customers ist SSOT, leads wird gespiegelt
 *
 * canEdit-Spiegelung (siehe Migration 2026-05-20):
 *  - leads UPDATE: admin | sales_lead | regional_lead (Team) | user|sales_partner (assigned_to == self)
 *  - customers UPDATE: admin | sales_lead | vertragsabteilung | regional_lead (Team-Vertrag) | user|sales_partner (eigener Vertrag)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import type { KundenPhase } from "@/components/kunden/KundenDialog";
import { LEAD_STATUS_TOOLTIPS, CONTRACT_STATUS_TOOLTIPS } from "@/lib/statusGlossary";

export type KundenDialogInput =
  | { type: "hfx"; hfxNumber: string; forcePhase?: KundenPhase }
  | { type: "lead"; leadId: string }
  | { type: "customer"; customerId: string }
  | { type: "contract"; contractId: string };

export interface StammdatenFormValues {
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  plz: string;
  ort: string;
  adresse: string;
  abrechnungszentrum: string;
  mp_nr: string;
  notes: string;
}

type LeadRow = {
  id: string;
  hfx_customer_number: string | null;
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  mobilnummer: string;
  plz: string;
  ort: string | null;
  adresse: string | null;
  abrechnungszentrum: string;
  mp_nummer: string | null;
  nachricht: string | null;
  assigned_to: string | null;
  status: string | null;
  qodia_synced: boolean | null;
  credentials_sent_at: string | null;
};


type CustomerRow = {
  id: string;
  hfx_customer_number: string;
  praxis_name: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  plz: string | null;
  ort: string | null;
  adresse: string | null;
  abrechnungszentrum: string;
  mp_nr: string | null;
  notes: string | null;
  /** Multi-Standort: geteilte Stripe-Customer-ID (SEPA-Mandat). */
  stripe_customer_id: string | null;
  /** Multi-Standort: Trägervertrag für Grundgebühr + AD-Signup-Bonus. */
  base_fee_contract_id: string | null;
};

/**
 * Vollständiger Vertrags-Datensatz (für VertragTab + Ownership-Check).
 * Wir selektieren `*`, weil VertragTab viele Felder für PDF-Generierung
 * und Anzeige benötigt; Phase-/Ownership-Logik nutzt nur das Subset.
 */
export type ContractRow = Record<string, any> & {
  id: string;
  sales_partner_id: string | null;
  created_by: string | null;
  status: string | null;
  created_at: string | null;
  product_name?: string | null;
  modules?: string[] | null;
  monthly_price?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_months?: number | null;
  document_url?: string | null;
  document_name?: string | null;
  contract_number?: string | null;
};

export type CaseRow = {
  id: string;
  case_type: string;
  title: string;
  status: string;
  contract_id: string | null;
  customer_id: string | null;
  created_at: string;
  notes: string | null;
};

export type EventRow = {
  id: string;
  event_type: string;
  entity_type: "lead" | "contract";
  entity_id: string;
  hfx_customer_number: string | null;
  lead_id: string | null;
  contract_id: string | null;
  event_data: Record<string, any>;
  created_by: string | null;
  created_at: string;
};

// Backwards-compatible alias

type ContractOwnership = ContractRow;

export interface KundenDialogHeader {
  hfxNumber: string;
  praxisName: string;
  personName: string;
  email?: string;
  phone?: string;
  ort?: string;
}

const isLeadPhase = (p: KundenPhase) => p === "lead" || p === "qualifiziert";

export interface UseKundenDialogDataResult {
  isLoading: boolean;
  hfxNumber: string | null;
  lead: LeadRow | null;
  customer: CustomerRow | null;
  contracts: ContractRow[];
  cases: CaseRow[];
  events: EventRow[];
  ssot: "lead" | "customer";
  derivedPhase: KundenPhase;
  currentStatusLabel: string | null;
  header: KundenDialogHeader | null;
  canEditStammdaten: boolean;
  canEditReason: string | null;
  initialValues: StammdatenFormValues;
  saveStammdaten: (values: StammdatenFormValues) => Promise<void>;
  isSaving: boolean;
}

/* ---------------------- Phase-/Status-Ableitung ---------------------- */

function derivePhaseFromData(
  lead: LeadRow | null,
  customer: CustomerRow | null,
  contracts: ContractOwnership[],
): KundenPhase {
  if (customer) {
    const statuses = contracts.map((c) => (c.status ?? "").toLowerCase());
    if (statuses.some((s) => s === "aktiv")) return "aktiv";
    if (statuses.some((s) => ["entwurf", "eingegangen", "gezeichnet"].includes(s)))
      return "vertrag";
    if (statuses.some((s) => ["gekuendigt", "beendet", "gesperrt"].includes(s)))
      return "service";
    return "vertrag";
  }
  const s = (lead?.status ?? "").toLowerCase();
  if (s === "qualifiziert") return "qualifiziert";
  if (s === "vertrag") return "vertrag";
  return "lead";
}

function deriveStatusLabel(
  phase: KundenPhase,
  lead: LeadRow | null,
  contracts: ContractOwnership[],
): string | null {
  if (phase === "lead" || phase === "qualifiziert") {
    const s = (lead?.status ?? "").toLowerCase();
    return LEAD_STATUS_TOOLTIPS[s] ?? null;
  }
  // Vertrag/aktiv/service: jüngsten Vertrag heranziehen
  const sorted = [...contracts].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  const top = sorted[0];
  const s = (top?.status ?? "").toLowerCase();
  return CONTRACT_STATUS_TOOLTIPS[s] ?? null;
}

/* ---------------------------------------------------------------- */

export function useKundenDialogData(
  input: KundenDialogInput | null,
  enabled: boolean,
): UseKundenDialogDataResult {
  const { user } = useAuth();
  const { isAdmin, isSalesLead, isRegionalLead, isSalesPartner, isUser, isVertragsabteilung } =
    useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ---- Schritt 1: Input → HFX-Nummer auflösen ---- */
  const resolveQ = useQuery({
    queryKey: ["kunden-dialog-resolve", input],
    enabled: enabled && !!input,
    queryFn: async (): Promise<{ hfxNumber: string | null }> => {
      if (!input) return { hfxNumber: null };
      if (input.type === "hfx") return { hfxNumber: input.hfxNumber };
      if (input.type === "lead") {
        const { data, error } = await supabase
          .from("leads")
          .select("hfx_customer_number")
          .eq("id", input.leadId)
          .maybeSingle();
        if (error) throw error;
        return { hfxNumber: data?.hfx_customer_number ?? null };
      }
      if (input.type === "customer") {
        const { data, error } = await supabase
          .from("customers")
          .select("hfx_customer_number")
          .eq("id", input.customerId)
          .maybeSingle();
        if (error) throw error;
        return { hfxNumber: data?.hfx_customer_number ?? null };
      }
      // contract
      const { data, error } = await supabase
        .from("contracts")
        .select("hfx_customer_number")
        .eq("id", input.contractId)
        .maybeSingle();
      if (error) throw error;
      return { hfxNumber: data?.hfx_customer_number ?? null };
    },
  });

  const hfxNumber = resolveQ.data?.hfxNumber ?? null;

  /* ---- Schritt 2: Lead + Customer parallel laden ---- */
  const leadQ = useQuery({
    queryKey: ["kunden-dialog-lead", hfxNumber],
    enabled: enabled && !!hfxNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,hfx_customer_number,praxis_name,vorname,nachname,email,mobilnummer,plz,ort,adresse,abrechnungszentrum,mp_nummer,nachricht,assigned_to,status,qodia_synced,credentials_sent_at",
        )
        .eq("hfx_customer_number", hfxNumber!)
        .maybeSingle();

      if (error) throw error;
      return (data as LeadRow | null) ?? null;
    },
  });

  const customerQ = useQuery({
    queryKey: ["kunden-dialog-customer", hfxNumber],
    enabled: enabled && !!hfxNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,hfx_customer_number,praxis_name,vorname,nachname,email,telefon,plz,ort,adresse,abrechnungszentrum,mp_nr,notes,stripe_customer_id,base_fee_contract_id",
        )
        .eq("hfx_customer_number", hfxNumber!)
        .maybeSingle();
      if (error) throw error;
      return (data as CustomerRow | null) ?? null;
    },
  });

  /* ---- Schritt 3: Verträge (für Ownership + derivedPhase) ----
   * Phase 1a: Gruppierung läuft jetzt über customer_id (statt hfx_customer_number).
   * Standorte (Phase 1b) tragen eine eigene HFX-Variante, gehören aber zur
   * selben Kunden-Identität. customer_id ist die SSOT-Klammer.
   *
   * Abhängigkeit: Query läuft erst, wenn customerQ aufgelöst ist (success),
   * damit wir wissen, ob ein Customer existiert.
   *  - customer.id vorhanden  → contracts via customer_id (kein OR-Mix mit HFX).
   *  - kein customer (Lead-Phase) → leeres Ergebnis (wie zuvor in HFX-only-Welt).
   */
  const contractsQ = useQuery({
    queryKey: ["kunden-dialog-contracts", customerQ.data?.id ?? null, hfxNumber],
    enabled: enabled && customerQ.isSuccess,
    queryFn: async () => {
      const customerId = customerQ.data?.id;
      if (!customerId) return [] as ContractRow[];
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("customer_id", customerId);
      if (error) throw error;
      return (data ?? []) as ContractRow[];
    },
  });

  /* ---- Schritt 4: Vorgänge (cases) laden ---- */
  const casesQ = useQuery({
    queryKey: ["kunden-dialog-cases", customerQ.data?.id],
    enabled: enabled && !!customerQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_cases" as any)
        .select("id, case_type, title, status, contract_id, customer_id, created_at, notes")
        .eq("customer_id", customerQ.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as CaseRow[]);
    },
  });

  /* ---- Schritt 5: Events (customer_events) laden ---- */
  const eventsQ = useQuery({
    queryKey: [
      "kunden-dialog-events",
      leadQ.data?.id ?? null,
      (contractsQ.data ?? []).map((c) => c.id).join(","),
    ],
    enabled:
      enabled && (!!leadQ.data?.id || (contractsQ.data?.length ?? 0) > 0),
    queryFn: async () => {
      const orParts: string[] = [];
      if (leadQ.data?.id) orParts.push(`lead_id.eq.${leadQ.data.id}`);
      const contractIds = (contractsQ.data ?? []).map((c) => c.id);
      if (contractIds.length) {
        orParts.push(`contract_id.in.(${contractIds.join(",")})`);
      }
      if (orParts.length === 0) return [];
      const { data, error } = await supabase
        .from("customer_events" as any)
        .select("*")
        .or(orParts.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as EventRow[]);
    },
  });

  /* ---- Phase / SSOT / Status-Label ---- */
  const derivedPhase: KundenPhase = useMemo(() => {
    if (input?.type === "hfx" && input.forcePhase) return input.forcePhase;
    return derivePhaseFromData(leadQ.data ?? null, customerQ.data ?? null, contractsQ.data ?? []);
  }, [input, leadQ.data, customerQ.data, contractsQ.data]);

  const ssot: "lead" | "customer" = isLeadPhase(derivedPhase) ? "lead" : "customer";

  const currentStatusLabel = useMemo(
    () => deriveStatusLabel(derivedPhase, leadQ.data ?? null, contractsQ.data ?? []),
    [derivedPhase, leadQ.data, contractsQ.data],
  );

  /* ---- Header-Block ---- */
  const header: KundenDialogHeader | null = useMemo(() => {
    if (!hfxNumber) return null;
    const c = customerQ.data;
    const l = leadQ.data;
    const personName =
      `${c?.vorname ?? l?.vorname ?? ""} ${c?.nachname ?? l?.nachname ?? ""}`.trim() ||
      "(unbekannt)";
    return {
      hfxNumber,
      praxisName: c?.praxis_name ?? l?.praxis_name ?? "(unbekannt)",
      personName,
      email: c?.email ?? l?.email ?? undefined,
      phone: c?.telefon ?? l?.mobilnummer ?? undefined,
      ort: c?.ort ?? l?.ort ?? undefined,
    };
  }, [hfxNumber, customerQ.data, leadQ.data]);

  /* ---- canEdit via Regional-Team-RPC (gespiegelt aus RLS) ---- */
  const [regionalLeadTeamOk, setRegionalLeadTeamOk] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRegionalLeadTeamOk(null);
    if (!enabled || !isRegionalLead || !user?.id) return;
    if (ssot === "lead") {
      const assignedTo = leadQ.data?.assigned_to;
      if (!assignedTo) {
        setRegionalLeadTeamOk(false);
        return;
      }
      supabase
        .rpc("is_in_regional_lead_team", {
          _regional_lead_id: user.id,
          _user_id: assignedTo,
        })
        .then(({ data }) => {
          if (!cancelled) setRegionalLeadTeamOk(Boolean(data));
        });
    } else if (ssot === "customer" && contractsQ.data) {
      const ids = Array.from(
        new Set(
          contractsQ.data
            .flatMap((c) => [c.sales_partner_id, c.created_by])
            .filter((x): x is string => !!x),
        ),
      );
      if (ids.length === 0) {
        setRegionalLeadTeamOk(false);
        return;
      }
      Promise.all(
        ids.map((uid) =>
          supabase
            .rpc("is_in_regional_lead_team", {
              _regional_lead_id: user.id!,
              _user_id: uid,
            })
            .then(({ data }) => Boolean(data)),
        ),
      ).then((results) => {
        if (!cancelled) setRegionalLeadTeamOk(results.some(Boolean));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, isRegionalLead, user?.id, ssot, leadQ.data?.assigned_to, contractsQ.data]);

  const { canEditStammdaten, canEditReason } = useMemo(() => {
    if (!user?.id) return { canEditStammdaten: false, canEditReason: "Nicht angemeldet." };

    if (ssot === "lead") {
      if (isAdmin || isSalesLead) return { canEditStammdaten: true, canEditReason: null };
      if (isRegionalLead) {
        if (regionalLeadTeamOk === true)
          return { canEditStammdaten: true, canEditReason: null };
        return {
          canEditStammdaten: false,
          canEditReason: "Interessent ist nicht deinem Team zugewiesen.",
        };
      }
      if (isUser || isSalesPartner) {
        if (leadQ.data?.assigned_to === user.id)
          return { canEditStammdaten: true, canEditReason: null };
        return {
          canEditStammdaten: false,
          canEditReason: "Interessent ist nicht dir zugewiesen.",
        };
      }
      return { canEditStammdaten: false, canEditReason: "Keine Berechtigung zum Bearbeiten." };
    }

    // ssot === "customer"
    if (isAdmin || isSalesLead || isVertragsabteilung)
      return { canEditStammdaten: true, canEditReason: null };
    if (isRegionalLead) {
      if (regionalLeadTeamOk === true)
        return { canEditStammdaten: true, canEditReason: null };
      return {
        canEditStammdaten: false,
        canEditReason: "Kunde gehört nicht zu deinem Team.",
      };
    }
    if (isUser || isSalesPartner) {
      const owns = (contractsQ.data ?? []).some(
        (c) => c.sales_partner_id === user.id || c.created_by === user.id,
      );
      if (owns) return { canEditStammdaten: true, canEditReason: null };
      return {
        canEditStammdaten: false,
        canEditReason: "Kunde gehört nicht zu deinen Verträgen.",
      };
    }
    return { canEditStammdaten: false, canEditReason: "Keine Berechtigung zum Bearbeiten." };
  }, [
    user?.id,
    ssot,
    isAdmin,
    isSalesLead,
    isVertragsabteilung,
    isRegionalLead,
    isUser,
    isSalesPartner,
    regionalLeadTeamOk,
    leadQ.data?.assigned_to,
    contractsQ.data,
  ]);

  /* ---- Initialwerte ---- */
  const initialValues: StammdatenFormValues = useMemo(() => {
    if (ssot === "customer" && customerQ.data) {
      const c = customerQ.data;
      return {
        praxis_name: c.praxis_name ?? "",
        vorname: c.vorname ?? "",
        nachname: c.nachname ?? "",
        email: c.email ?? "",
        telefon: c.telefon ?? "",
        plz: c.plz ?? "",
        ort: c.ort ?? "",
        adresse: c.adresse ?? "",
        abrechnungszentrum: c.abrechnungszentrum ?? "nein",
        mp_nr: c.mp_nr ?? "",
        notes: c.notes ?? "",
      };
    }
    const l = leadQ.data;
    return {
      praxis_name: l?.praxis_name ?? "",
      vorname: l?.vorname ?? "",
      nachname: l?.nachname ?? "",
      email: l?.email ?? "",
      telefon: l?.mobilnummer ?? "",
      plz: l?.plz ?? "",
      ort: l?.ort ?? "",
      adresse: l?.adresse ?? "",
      abrechnungszentrum: l?.abrechnungszentrum ?? "nein",
      mp_nr: l?.mp_nummer ?? "",
      notes: l?.nachricht ?? "",
    };
  }, [ssot, customerQ.data, leadQ.data]);

  /* ---- Save mit Mirror-Write ---- */
  const saveMutation = useMutation({
    mutationFn: async (values: StammdatenFormValues) => {
      if (ssot === "lead") {
        if (!leadQ.data?.id) throw new Error("Lead-ID fehlt.");
        const { error } = await supabase
          .from("leads")
          .update({
            praxis_name: values.praxis_name,
            vorname: values.vorname,
            nachname: values.nachname,
            email: values.email,
            mobilnummer: values.telefon,
            plz: values.plz,
            ort: values.ort,
            adresse: values.adresse,
            abrechnungszentrum: values.abrechnungszentrum,
            mp_nummer: values.mp_nr || null,
            nachricht: values.notes || null,
          })
          .eq("id", leadQ.data.id);
        if (error) throw error;
        return { mirrorWarning: false as const };
      }

      if (!customerQ.data?.id) throw new Error("Kunden-ID fehlt.");
      const { error } = await supabase
        .from("customers")
        .update({
          praxis_name: values.praxis_name,
          vorname: values.vorname,
          nachname: values.nachname,
          email: values.email,
          telefon: values.telefon,
          plz: values.plz,
          ort: values.ort,
          adresse: values.adresse,
          abrechnungszentrum: values.abrechnungszentrum,
          mp_nr: values.mp_nr || null,
          notes: values.notes || null,
        })
        .eq("id", customerQ.data.id);
      if (error) throw error;

      let mirrorWarning = false;
      if (leadQ.data?.id) {
        const { error: mErr } = await supabase
          .from("leads")
          .update({
            praxis_name: values.praxis_name,
            vorname: values.vorname,
            nachname: values.nachname,
            email: values.email,
            mobilnummer: values.telefon,
            plz: values.plz,
            ort: values.ort,
            adresse: values.adresse,
            abrechnungszentrum: values.abrechnungszentrum,
            mp_nummer: values.mp_nr || null,
            nachricht: values.notes || null,
          })
          .eq("id", leadQ.data.id);
        if (mErr) {
          console.warn("[KundenDialog] Mirror-Write leads fehlgeschlagen:", mErr);
          mirrorWarning = true;
        }
      }
      return { mirrorWarning };
    },
    onSuccess: ({ mirrorWarning }) => {
      qc.invalidateQueries({ queryKey: ["kunden-dialog-lead", hfxNumber] });
      qc.invalidateQueries({ queryKey: ["kunden-dialog-customer", hfxNumber] });
      if (mirrorWarning) {
        toast({
          title: "Daten teilweise gespeichert",
          description:
            "Kundendaten gespeichert, aber Spiegelung auf den Interessenten-Datensatz ist fehlgeschlagen.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Stammdaten gespeichert" });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
      toast({ title: "Speichern fehlgeschlagen", description: msg, variant: "destructive" });
    },
  });

  const saveStammdaten = useCallback(
    async (values: StammdatenFormValues) => {
      await saveMutation.mutateAsync(values);
    },
    [saveMutation],
  );

  return {
    isLoading: resolveQ.isLoading || leadQ.isLoading || customerQ.isLoading || casesQ.isLoading,
    hfxNumber,
    lead: leadQ.data ?? null,
    customer: customerQ.data ?? null,
    contracts: contractsQ.data ?? [],
    cases: casesQ.data ?? [],
    events: eventsQ.data ?? [],
    ssot,
    derivedPhase,
    currentStatusLabel,
    header,
    canEditStammdaten,
    canEditReason,
    initialValues,
    saveStammdaten,
    isSaving: saveMutation.isPending,
  };
}
