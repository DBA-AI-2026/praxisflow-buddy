import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MapPin, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";

interface Candidate {
  lead_id: string;
  hfx_customer_number: string;
  praxis_name: string;
  plz: string;
  alter_ad_id: string;
  alter_ad_name: string;
  neuer_ad_id: string;
  neuer_ad_name: string;
  matched_rule: string;
}

interface PlzReassignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlzReassignmentDialog({ open, onOpenChange }: PlzReassignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data: candidates = [],
    isLoading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
    isFetched,
  } = useQuery({
    queryKey: ["plz-reassignment-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_plz_reassignment");
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
    enabled: false,
    staleTime: Infinity,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("apply_plz_reassignment");
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["plz-reassignment-preview"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-leads-all"] });
      queryClient.invalidateQueries({ queryKey: ["kundenDialogData"] });
      queryClient.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });
      queryClient.invalidateQueries({ queryKey: ["kunden-dialog-events"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overdue-leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-new-since-yesterday"] });
      queryClient.invalidateQueries({ queryKey: ["lead-current-ad-name"] });
      queryClient.invalidateQueries({ queryKey: ["plz-mappings"] });
      toast({
        title: "Neuzuordnung durchgeführt",
        description: `${count} Lead${count === 1 ? "" : "s"} neu zugewiesen.`,
      });
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
      setConfirmOpen(false);
    },
  });

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setConfirmOpen(false);
    }
    onOpenChange(v);
  };

  const handlePreview = () => {
    refetchPreview();
  };

  const handleApplyClick = () => {
    if (candidates.length === 0) return;
    setConfirmOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            PLZ-Neuzuordnung prüfen
          </DialogTitle>
          <DialogDescription>
            Vergleicht bestehende Leads mit der aktuellen PLZ-Zuordnung. Berücksichtigt
            werden Leads mit den Status <Badge variant="secondary" className="text-xs">neu</Badge>{" "}
            <Badge variant="secondary" className="text-xs">kontaktiert</Badge>{" "}
            <Badge variant="secondary" className="text-xs">qualifiziert</Badge>, die eine
            PLZ haben und derzeit einem anderen Gebietsleiter zugeordnet sind.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {isFetched && !previewLoading ? (
              <span>
                {candidates.length} Lead{candidates.length === 1 ? "" : "s"} würden umgehängt
              </span>
            ) : (
              <span>Vorschau noch nicht geladen</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewLoading}
          >
            {previewLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Lade Vorschau…
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                Vorschau laden
              </>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md min-h-[200px] max-h-[60vh]">
          {previewLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewError ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
              <p className="text-sm text-destructive font-medium">
                Fehler beim Laden der Vorschau
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(previewError as Error).message}
              </p>
            </div>
          ) : !isFetched ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/60 mb-3" />
              <p className="text-sm text-muted-foreground">
                Klicken Sie auf „Vorschau laden", um die betroffenen Leads anzuzeigen.
              </p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-primary/60 mb-3" />
              <p className="text-sm font-medium">Keine Neuzuordnungen notwendig</p>
              <p className="text-xs text-muted-foreground mt-1">
                Aktuell gibt es keine offenen Leads, deren PLZ einem anderen Gebietsleiter zugeordnet ist.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">HFX-Nr.</TableHead>
                  <TableHead className="font-semibold">Praxis</TableHead>
                  <TableHead className="font-semibold w-24">PLZ</TableHead>
                  <TableHead className="font-semibold">Alter AD</TableHead>
                  <TableHead className="font-semibold">Neuer AD</TableHead>
                  <TableHead className="font-semibold">Regel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.lead_id}>
                    <TableCell className="font-mono text-xs">
                      {c.hfx_customer_number}
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">
                      {c.praxis_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.plz}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.alter_ad_name}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-primary">
                      {c.neuer_ad_name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {c.matched_rule}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row items-start sm:items-center">
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Nur Administratoren können die Neuzuordnung anwenden.
            </p>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Schließen
          </Button>
          {isAdmin && (
            <Button
              onClick={handleApplyClick}
              disabled={!isFetched || candidates.length === 0 || applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird angewendet…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {candidates.length} Lead{candidates.length === 1 ? "" : "s"} umhängen
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Apply confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Neuzuordnung anwenden?</AlertDialogTitle>
            <AlertDialogDescription>
              {candidates.length} Lead{candidates.length === 1 ? "" : "s"} wird
              {candidates.length === 1 ? "" : "en"} basierend auf der aktuellen
              PLZ-Zuordnung einem anderen Gebietsleiter zugewiesen. Diese Aktion
              wird in <code className="text-xs bg-muted px-1 rounded">plz_assignment_log</code>{" "}
              protokolliert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {applyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Ja, umhängen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
