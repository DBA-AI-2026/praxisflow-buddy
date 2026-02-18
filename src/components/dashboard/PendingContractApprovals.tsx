import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export function PendingContractApprovals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const handleApprove = async (contractId: string) => {
    const { error } = await supabase
      .from("contracts")
      .update({
        status: "aktiv",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      } as any)
      .eq("id", contractId);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Vertrag freigegeben", description: "Der Vertrag wurde erfolgreich aktiviert." });
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
          <div className="space-y-3">
            {contracts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.customer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.product_name} · {c.license_count} Lizenz{c.license_count !== 1 ? "en" : ""} ·{" "}
                    {format(new Date(c.created_at), "dd.MM.yyyy", { locale: de })}
                  </p>
                  {c.hfx_customer_number && (
                    <span className="text-xs text-muted-foreground/70">{c.hfx_customer_number}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => handleApprove(c.id)}
                  className="shrink-0 gap-1.5"
                >
                  <CheckCircle className="h-4 w-4" />
                  Freigeben
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
