import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, AlertTriangle, ExternalLink, Info } from "lucide-react";
import type { Reservation } from "./types";
import { ProductInterestPicker } from "@/components/products/ProductInterestPicker";

interface Props {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DuplicateLead {
  id: string;
  hfx_customer_number: string | null;
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  plz: string;
  mobilnummer: string | null;
  adresse: string | null;
  status: string;
  reasons: string[];
}

/**
 * Splits "Dr. Max Mustermann" / "Max Mustermann" into vorname/nachname (best effort).
 */
function splitArztName(name: string | null | undefined): { vorname: string; nachname: string } {
  if (!name) return { vorname: "", nachname: "" };
  // Remove common titles
  const cleaned = name
    .replace(/\b(Dr\.?|Prof\.?|med\.?|Dipl\.?|MBA|MSc|PhD)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return { vorname: "", nachname: "" };
  if (parts.length === 1) return { vorname: "", nachname: parts[0] };
  return { vorname: parts[0], nachname: parts.slice(1).join(" ") };
}

function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/[^\d]/g, "");
}

export function ReservationConvertToLeadDialog({ reservation, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initialNames = useMemo(
    () => splitArztName(reservation?.arzt_namen ?? null),
    [reservation?.arzt_namen],
  );

  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [mobilnummer, setMobilnummer] = useState("");
  const [forceCreate, setForceCreate] = useState(false);
  const [interestedProducts, setInterestedProducts] = useState<string[]>([]);

  // Reset form whenever the dialog reopens with a new reservation
  useEffect(() => {
    if (open && reservation) {
      setVorname(initialNames.vorname);
      setNachname(initialNames.nachname);
      setEmail("");
      setMobilnummer(reservation.telefon ?? "");
      setForceCreate(false);
      setInterestedProducts((reservation.interested_products as string[] | null) ?? []);
    }
  }, [open, reservation, initialNames.vorname, initialNames.nachname]);

  // Already converted?
  const alreadyConverted =
    !!reservation && (reservation.status === "konvertiert" || !!reservation.lead_id);

  // ── Dublettenprüfung gegen leads ───────────────────────────────────────────
  const phoneNorm = normalizePhone(reservation?.telefon);
  const addressKey = `${reservation?.strasse ?? ""} ${reservation?.hausnummer ?? ""}`.trim().toLowerCase();
  const praxisKey = (reservation?.praxis_name ?? "").trim().toLowerCase();
  const emailNorm = email.trim().toLowerCase();

  const { data: duplicates = [], isFetching: dupLoading } = useQuery({
    enabled: open && !!reservation && !alreadyConverted,
    queryKey: [
      "reservation-convert-duplicates",
      reservation?.id,
      reservation?.plz,
      praxisKey,
      phoneNorm,
      addressKey,
      emailNorm,
    ],
    queryFn: async (): Promise<DuplicateLead[]> => {
      if (!reservation) return [];

      // Pull leads in same PLZ (cheap) plus optional email match
      const filters: string[] = [];
      if (reservation.plz) filters.push(`plz.eq.${reservation.plz}`);
      if (emailNorm) filters.push(`email.eq.${emailNorm}`);

      let query = supabase
        .from("leads")
        .select(
          "id, hfx_customer_number, praxis_name, vorname, nachname, email, plz, mobilnummer, adresse, status",
        )
        .limit(50);

      if (filters.length > 0) {
        query = query.or(filters.join(","));
      } else {
        // No PLZ on reservation – nothing useful to compare on
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as Omit<DuplicateLead, "reasons">[];

      // Score & label each candidate
      const candidates: DuplicateLead[] = [];
      for (const row of rows) {
        const reasons: string[] = [];
        if (emailNorm && row.email?.toLowerCase() === emailNorm) reasons.push("E-Mail");
        if (praxisKey && row.praxis_name?.trim().toLowerCase() === praxisKey)
          reasons.push("Praxisname");
        if (
          praxisKey &&
          !reasons.includes("Praxisname") &&
          row.praxis_name &&
          (row.praxis_name.toLowerCase().includes(praxisKey) ||
            praxisKey.includes(row.praxis_name.toLowerCase()))
        ) {
          reasons.push("ähnlicher Praxisname");
        }
        if (phoneNorm && normalizePhone(row.mobilnummer) === phoneNorm) reasons.push("Telefon");
        if (
          addressKey &&
          row.adresse &&
          row.adresse.trim().toLowerCase() === addressKey &&
          row.plz === reservation.plz
        ) {
          reasons.push("Adresse");
        }
        // PLZ alone is not enough – require at least one strong reason
        if (reasons.length > 0) {
          candidates.push({ ...row, reasons });
        }
      }

      // Strongest matches first
      return candidates.sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 10);
    },
  });

  const hasDuplicates = duplicates.length > 0;

  // ── RPC-Aufruf ─────────────────────────────────────────────────────────────
  const convert = useMutation({
    mutationFn: async () => {
      if (!reservation) throw new Error("Keine Reservierung gewählt");
      const { data, error } = await supabase.rpc("convert_reservation_to_lead", {
        p_reservation_id: reservation.id,
        p_vorname: vorname.trim(),
        p_nachname: nachname.trim(),
        p_email: email.trim(),
        p_mobilnummer: mobilnummer.trim(),
        p_force: forceCreate,
        p_interested_products: interestedProducts,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.lead_id) throw new Error("Konvertierung lieferte kein Ergebnis");
      return row as { lead_id: string; hfx_customer_number: string | null };
    },
    onSuccess: (res) => {
      toast.success("Interessent angelegt", {
        description: res.hfx_customer_number
          ? `Neue HFX-Nummer: ${res.hfx_customer_number}`
          : "Lead wurde verknüpft.",
        action: {
          label: "Öffnen",
          onClick: () => navigate(`/pipeline?tab=interessenten&lead=${res.lead_id}`),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Konvertierung fehlgeschlagen";
      // Server-side duplicate-email check
      if (typeof msg === "string" && msg.includes("E-Mail")) {
        toast.error("Doppelte E-Mail", {
          description: "Es existiert bereits ein Interessent mit dieser E-Mail. Bitte prüfen oder bewusst überschreiben.",
        });
      } else {
        toast.error("Konvertierung fehlgeschlagen", { description: msg });
      }
    },
  });

  // ── Render-Hilfen ──────────────────────────────────────────────────────────
  const formValid =
    vorname.trim().length > 0 &&
    nachname.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    mobilnummer.trim().length > 0;
  const submitDisabled = !formValid || convert.isPending || alreadyConverted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Reservierung zu Interessent entwickeln
          </DialogTitle>
          <DialogDescription>
            Aus dieser Reservierung wird ein neuer Interessent angelegt und mit der Reservierung verknüpft.
          </DialogDescription>
        </DialogHeader>

        {!reservation ? null : alreadyConverted ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Bereits konvertiert</AlertTitle>
            <AlertDescription className="space-y-2">
              <div>
                Diese Reservierung wurde bereits zu einem Interessenten entwickelt.
              </div>
              {reservation.lead_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/pipeline?tab=interessenten&lead=${reservation.lead_id}`);
                  }}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Verknüpften Interessenten öffnen
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Übernommene Reservierungs-Daten */}
            <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <div className="font-medium">{reservation.praxis_name}</div>
              <div className="text-muted-foreground text-xs">
                {reservation.strasse} {reservation.hausnummer}, {reservation.plz} {reservation.ort}
              </div>
              {reservation.assigned_ad_name && (
                <div className="text-xs">
                  Zuständiger AD:{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {reservation.assigned_ad_name}
                  </Badge>
                </div>
              )}
            </div>

            {/* Pflichtfelder ergänzen */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="conv-vorname">Vorname *</Label>
                <Input
                  id="conv-vorname"
                  value={vorname}
                  onChange={(e) => setVorname(e.target.value)}
                  placeholder="Max"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conv-nachname">Nachname *</Label>
                <Input
                  id="conv-nachname"
                  value={nachname}
                  onChange={(e) => setNachname(e.target.value)}
                  placeholder="Mustermann"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="conv-email">E-Mail *</Label>
                <Input
                  id="conv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kontakt@praxis.de"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="conv-mobil">Mobilnummer *</Label>
                <Input
                  id="conv-mobil"
                  value={mobilnummer}
                  onChange={(e) => setMobilnummer(e.target.value)}
                  placeholder={reservation.telefon ?? "+49 …"}
                />
              </div>
            </div>

            <ProductInterestPicker
              value={interestedProducts}
              onChange={setInterestedProducts}
              layout="badges"
              hint="Aus der Reservierung übernommen – kann hier angepasst werden."
            />

            {/* Dubletten-Anzeige */}
            {dupLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Prüfe auf Dubletten …
              </div>
            ) : hasDuplicates ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Mögliche Dubletten gefunden ({duplicates.length})</AlertTitle>
                <AlertDescription className="space-y-2">
                  <div className="text-xs">
                    Bitte prüfen, ob bereits ein Interessent existiert, bevor ein neuer angelegt wird.
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {duplicates.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-start justify-between gap-2 rounded border bg-background p-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{d.praxis_name}</div>
                          <div className="text-muted-foreground truncate">
                            {d.vorname} {d.nachname} · {d.email} · PLZ {d.plz}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.reasons.map((r) => (
                              <Badge key={r} variant="secondary" className="text-[10px]">
                                {r}
                              </Badge>
                            ))}
                            {d.hfx_customer_number && (
                              <Badge variant="outline" className="text-[10px]">
                                {d.hfx_customer_number}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 shrink-0"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/pipeline?tab=interessenten&lead=${d.id}`);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 text-xs pt-1">
                    <input
                      type="checkbox"
                      checked={forceCreate}
                      onChange={(e) => setForceCreate(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Trotzdem einen neuen Interessenten anlegen (nur bei eindeutiger Abweichung wählen).
                    </span>
                  </label>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          {!alreadyConverted && (
            <Button
              onClick={() => convert.mutate()}
              disabled={submitDisabled || (hasDuplicates && !forceCreate)}
            >
              {convert.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Interessent anlegen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
