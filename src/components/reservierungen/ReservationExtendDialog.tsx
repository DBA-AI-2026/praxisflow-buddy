import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { addMonths, format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import type { Reservation } from "./types";

interface Props {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXTENSIONS = [1, 3, 6, 12] as const;

export function ReservationExtendDialog({ reservation, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState<number>(3);

  const extend = useMutation({
    mutationFn: async () => {
      if (!reservation) throw new Error("Keine Reservierung ausgewählt.");
      const base =
        new Date(reservation.reserved_until) > new Date()
          ? new Date(reservation.reserved_until)
          : new Date();
      const newUntil = addMonths(base, months);

      const { error } = await supabase
        .from("praxis_reservations")
        .update({
          reserved_until: newUntil.toISOString(),
          reservation_months: (reservation.reservation_months ?? 0) + months,
          status: "reserviert",
        })
        .eq("id", reservation.id);

      if (error) throw error;
      return newUntil;
    },
    onSuccess: (newUntil) => {
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
      toast.success("Reservierung verlängert", {
        description: `Neues Enddatum: ${format(newUntil, "dd.MM.yyyy", { locale: de })}`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Verlängerung fehlgeschlagen", {
        description: error.message.includes("Only admins")
          ? "Nur Administratoren können das Enddatum ändern."
          : error.message,
      });
    },
  });

  if (!reservation) return null;

  const previewBase =
    new Date(reservation.reserved_until) > new Date()
      ? new Date(reservation.reserved_until)
      : new Date();
  const preview = addMonths(previewBase, months);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Reservierung verlängern</DialogTitle>
          <DialogDescription>
            Aktuelles Enddatum:{" "}
            {format(new Date(reservation.reserved_until), "dd.MM.yyyy", { locale: de })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Verlängerung</Label>
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTENSIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    + {m} {m === 1 ? "Monat" : "Monate"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            Neues Enddatum:{" "}
            <span className="font-medium">
              {format(preview, "dd. MMMM yyyy", { locale: de })}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => extend.mutate()} disabled={extend.isPending}>
            {extend.isPending ? "Speichern…" : "Verlängern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
