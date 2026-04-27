import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  RESERVATION_STATUS_LABELS,
  type Reservation,
  type ReservationStatus,
} from "./types";
import { ProductInterestPicker } from "@/components/products/ProductInterestPicker";

interface Props {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Welche Status-Werte der aktuelle Nutzer setzen darf. Wird vom Caller bestimmt. */
  allowedStatuses?: ReservationStatus[];
}

interface EditState {
  praxis_name: string;
  arzt_namen: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  telefon: string;
  notes: string;
  status: ReservationStatus;
  interested_products: string[];
}

function toEditState(r: Reservation): EditState {
  return {
    praxis_name: r.praxis_name ?? "",
    arzt_namen: r.arzt_namen ?? "",
    strasse: r.strasse ?? "",
    hausnummer: r.hausnummer ?? "",
    plz: r.plz ?? "",
    ort: r.ort ?? "",
    telefon: r.telefon ?? "",
    notes: r.notes ?? "",
    status: ((r.status as ReservationStatus) ?? "reserviert"),
    interested_products: (r.interested_products as string[] | null) ?? [],
  };
}

export function ReservationEditDialog({
  reservation,
  open,
  onOpenChange,
  allowedStatuses,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditState | null>(null);

  useEffect(() => {
    if (reservation && open) {
      setForm(toEditState(reservation));
    }
  }, [reservation, open]);

  const update = useMutation({
    mutationFn: async (data: EditState) => {
      if (!reservation) throw new Error("Keine Reservierung ausgewählt.");

      const plzChanged = data.plz !== reservation.plz;

      const { error } = await supabase
        .from("praxis_reservations")
        .update({
          praxis_name: data.praxis_name,
          arzt_namen: data.arzt_namen,
          strasse: data.strasse,
          hausnummer: data.hausnummer,
          plz: data.plz,
          ort: data.ort,
          telefon: data.telefon,
          notes: data.notes || null,
          status: data.status,
          interested_products: data.interested_products ?? [],
        })
        .eq("id", reservation.id);

      if (error) throw error;
      return { plzChanged };
    },
    onSuccess: ({ plzChanged }) => {
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
      toast.success(
        plzChanged
          ? "Gespeichert. PLZ-Änderung wird serverseitig neu zugeordnet."
          : "Reservierung gespeichert.",
      );
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
    },
  });

  if (!reservation || !form) return null;

  const statusOptions =
    allowedStatuses ??
    (Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservierung bearbeiten</DialogTitle>
          <DialogDescription>
            Änderungen werden serverseitig validiert. PLZ-Änderungen können den
            zuständigen Außendienst neu zuordnen.
          </DialogDescription>
        </DialogHeader>

        <form
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="edit_praxis_name">Praxisname *</Label>
            <Input
              id="edit_praxis_name"
              value={form.praxis_name}
              onChange={(e) => setForm({ ...form, praxis_name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit_arzt_namen">Arzt / Ansprechpartner *</Label>
            <Input
              id="edit_arzt_namen"
              value={form.arzt_namen}
              onChange={(e) => setForm({ ...form, arzt_namen: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="edit_strasse">Straße *</Label>
              <Input
                id="edit_strasse"
                value={form.strasse}
                onChange={(e) => setForm({ ...form, strasse: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit_hausnummer">Haus-Nr. *</Label>
              <Input
                id="edit_hausnummer"
                value={form.hausnummer}
                onChange={(e) => setForm({ ...form, hausnummer: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="edit_plz">PLZ *</Label>
              <Input
                id="edit_plz"
                value={form.plz}
                maxLength={5}
                onChange={(e) => setForm({ ...form, plz: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="edit_ort">Ort *</Label>
              <Input
                id="edit_ort"
                value={form.ort}
                onChange={(e) => setForm({ ...form, ort: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit_telefon">Telefon</Label>
            <Input
              id="edit_telefon"
              type="tel"
              value={form.telefon}
              onChange={(e) => setForm({ ...form, telefon: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="edit_status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as ReservationStatus })}
            >
              <SelectTrigger id="edit_status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {RESERVATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ProductInterestPicker
            value={form.interested_products}
            onChange={(next) => setForm({ ...form, interested_products: next })}
            hint="Wird bei Konvertierung zum Interessenten übernommen."
          />

          <div>
            <Label htmlFor="edit_notes">Notizen</Label>
            <Textarea
              id="edit_notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
