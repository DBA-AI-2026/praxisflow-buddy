import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  FileText,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CircleCheck,
  CircleMinus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type CreditCheckResult = {
  score: number;
  rating: "gruen" | "gelb" | "rot";
  checkedAt: string;
  mock?: boolean;
};

type ContractCreditState = {
  loading: boolean;
  result: CreditCheckResult | null;
  approvalNote: string;
};

const ratingConfig = {
  gruen: {
    label: "Positiv",
    color: "bg-green-500/10 text-green-700 border-green-500/20",
    icon: CircleCheck,
  },
  gelb: {
    label: "Eingeschränkt",
    color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    icon: AlertTriangle,
  },
  rot: {
    label: "Negativ",
    color: "bg-red-500/10 text-red-700 border-red-500/20",
    icon: CircleMinus,
  },
};

export function PendingContractApprovals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creditStates, setCreditStates] = useState<
    Record<string, ContractCreditState>
  >({});

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["pending-contracts-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("status", "gezeichnet")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getCreditState = (id: string): ContractCreditState =>
    creditStates[id] ?? { loading: false, result: null, approvalNote: "" };

  const updateCreditState = (
    id: string,
    update: Partial<ContractCreditState>
  ) => {
    setCreditStates((prev) => ({
      ...prev,
      [id]: { ...getCreditState(id), ...update },
    }));
  };

  const handleCreditCheck = async (contractId: string, customerName: string) => {
    updateCreditState(contractId, { loading: true, result: null });

    try {
      const { data, error } = await supabase.functions.invoke(
        "creditreform-check",
        { body: { contractId, customerName } }
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Prüfung fehlgeschlagen");

      const result = data.data as CreditCheckResult;
      updateCreditState(contractId, { loading: false, result });

      // Save to DB
      await supabase
        .from("contracts")
        .update({
          creditreform_score: result.score,
          creditreform_rating: result.rating,
          creditreform_checked_at: result.checkedAt,
          creditreform_checked_by: user?.id,
        } as any)
        .eq("id", contractId);

      toast({
        title: "Bonitätsprüfung abgeschlossen",
        description: `Score: ${result.score} – ${ratingConfig[result.rating].label}`,
      });
    } catch (err: any) {
      updateCreditState(contractId, { loading: false });
      toast({
        title: "Fehler bei Bonitätsprüfung",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (contractId: string) => {
    const state = getCreditState(contractId);

    // Find the contract to check if it already has a credit check from DB
    const contract = contracts.find((c) => c.id === contractId);
    const hasCheck =
      state.result != null ||
      (contract as any)?.creditreform_rating != null;

    if (!hasCheck) {
      toast({
        title: "Bonitätsprüfung erforderlich",
        description:
          "Bitte führen Sie zuerst eine Creditreform-Prüfung durch.",
        variant: "destructive",
      });
      return;
    }

    const rating =
      state.result?.rating ?? (contract as any)?.creditreform_rating;
    const needsNote = rating === "gelb" || rating === "rot";

    if (needsNote && !state.approvalNote.trim()) {
      toast({
        title: "Begründung erforderlich",
        description:
          "Bei eingeschränkter oder negativer Bonität ist eine Begründung für die Freigabe erforderlich.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("contracts")
      .update({
        status: "aktiv",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        ...(needsNote
          ? { creditreform_approval_note: state.approvalNote.trim() }
          : {}),
      } as any)
      .eq("id", contractId);

    if (error) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Vertrag freigegeben",
      description: "Der Vertrag wurde erfolgreich aktiviert.",
    });
    queryClient.invalidateQueries({ queryKey: ["pending-contracts-approval"] });
    queryClient.invalidateQueries({ queryKey: ["contracts"] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Verträge zur Freigabe
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-primary" />
          Verträge zur Freigabe
          {contracts.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {contracts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Verträge zur Freigabe vorhanden.
          </p>
        ) : (
          <div className="space-y-4">
            {contracts.map((c) => {
              const state = getCreditState(c.id);
              const dbRating = (c as any)?.creditreform_rating;
              const dbScore = (c as any)?.creditreform_score;
              const activeResult = state.result ?? (dbRating ? { score: dbScore, rating: dbRating } as CreditCheckResult : null);
              const cfg = activeResult ? ratingConfig[activeResult.rating] : null;
              const needsNote =
                activeResult &&
                (activeResult.rating === "gelb" || activeResult.rating === "rot");

              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                >
                  {/* Contract info row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.customer_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.product_name} · {c.license_count} Lizenz
                        {c.license_count !== 1 ? "en" : ""} ·{" "}
                        {format(new Date(c.created_at), "dd.MM.yyyy", {
                          locale: de,
                        })}
                      </p>
                      {c.hfx_customer_number && (
                        <span className="text-xs text-muted-foreground/70">
                          {c.hfx_customer_number}
                        </span>
                      )}
                    </div>

                    {/* Credit check button */}
                    {!activeResult && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreditCheck(c.id, c.customer_name)}
                        disabled={state.loading}
                        className="shrink-0 gap-1.5"
                      >
                        {state.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Bonität prüfen
                      </Button>
                    )}
                  </div>

                  {/* Credit check result */}
                  {activeResult && cfg && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={cfg.color}>
                          <cfg.icon className="h-3 w-3 mr-1" />
                          {cfg.label} – Score {activeResult.score}
                        </Badge>
                        {activeResult.rating !== "gruen" && (
                          <span className="text-xs text-muted-foreground">
                            Freigabe mit Begründung möglich
                          </span>
                        )}
                      </div>

                      {/* Justification textarea for yellow/red */}
                      {needsNote && (
                        <Textarea
                          placeholder="Begründung für die Freigabe trotz eingeschränkter Bonität…"
                          value={state.approvalNote}
                          onChange={(e) =>
                            updateCreditState(c.id, {
                              approvalNote: e.target.value,
                            })
                          }
                          className="text-sm"
                          rows={2}
                        />
                      )}

                      {/* Approve button */}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(c.id)}
                          className="gap-1.5"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Freigeben
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
