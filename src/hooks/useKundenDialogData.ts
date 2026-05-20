/**
 * useKundenDialogData — Daten-Hook für KundenDialog (Etappe 2b-i).
 *
 * Lädt Lead und/oder Kunde anhand `hfx_customer_number` und ermittelt
 * `canEditStammdaten` gespiegelt aus den RLS-Policies. Speichert in die
 * korrekte SSOT-Tabelle abhängig von der Phase mit Mirror-Write auf leads.
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
};

type ContractOwnership = {
  id: string;
  sales_partner_id: string | null;
  created_by: string | null;
};

const isLeadPhase = (p: KundenPhase) => p === "lead" || p === "qualifiziert";

export interface UseKundenDialogDataResult {
  isLoading: boolean;
  lead: LeadRow | null;
  customer: CustomerRow | null;
  contracts: ContractOwnership[];
  ssot: "lead" | "customer";
  canEditStammdaten: boolean;
  canEditReason: string | null;
  initialValues: StammdatenFormValues;
  saveStammdaten: (values: StammdatenFormValues) => Promise<void>;
  isSaving: boolean;
}

export function useKundenDialogData(
  hfxNumber: string | null,
  phase: KundenPhase,
  enabled: boolean,
): UseKundenDialogDataResult {
  const { user } = useAuth();
  const { isAdmin, isSalesLead, isRegionalLead, isSalesPartner, isUser, isVertragsabteilung } =
    useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ssot: "lead" | "customer" = isLeadPhase(phase) ? "lead" : "customer";

  // Lead laden (immer versuchen — kann auch in Customer-Phase noch existieren)
  const leadQ = useQuery({
    queryKey: ["kunden-dialog-lead", hfxNumber],
    enabled: enabled && !!hfxNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,hfx_customer_number,praxis_name,vorname,nachname,email,mobilnummer,plz,ort,adresse,abrechnungszentrum,mp_nummer,nachricht,assigned_to",
        )
        .eq("hfx_customer_number", hfxNumber!)
        .maybeSingle();
      if (error) throw error;
      return (data as LeadRow | null) ?? null;
    },
  });

  // Customer laden (in Lead-Phase i.d.R. null)
  const customerQ = useQuery({
    queryKey: ["kunden-dialog-customer", hfxNumber],
    enabled: enabled && !!hfxNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,hfx_customer_number,praxis_name,vorname,nachname,email,telefon,plz,ort,adresse,abrechnungszentrum,mp_nr,notes",
        )
        .eq("hfx_customer_number", hfxNumber!)
        .maybeSingle();
      if (error) throw error;
      return (data as CustomerRow | null) ?? null;
    },
  });

  // Verträge für Customer-Ownership-Check (nur wenn Customer-Phase + Customer da)
  const contractsQ = useQuery({
    queryKey: ["kunden-dialog-contracts", customerQ.data?.id],
    enabled:
      enabled &&
      ssot === "customer" &&
      !!customerQ.data?.id &&
      !isAdmin &&
      !isSalesLead &&
      !isVertragsabteilung,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,sales_partner_id,created_by")
        .eq("customer_id", customerQ.data!.id);
      if (error) throw error;
      return (data ?? []) as ContractOwnership[];
    },
  });

  // Regional-Team-Check via RPC (Lead-Phase mit Regionalleiter)
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
      // Für jeden Vertrag prüfen, ob sales_partner_id ODER created_by im Team
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

  // Initialwerte — Customer-SSOT bevorzugt, sonst Lead
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

      // ssot === customer
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

      // Mirror-Write auf leads, falls Lead noch existiert
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
    isLoading: leadQ.isLoading || customerQ.isLoading,
    lead: leadQ.data ?? null,
    customer: customerQ.data ?? null,
    contracts: contractsQ.data ?? [],
    ssot,
    canEditStammdaten,
    canEditReason,
    initialValues,
    saveStammdaten,
    isSaving: saveMutation.isPending,
  };
}
