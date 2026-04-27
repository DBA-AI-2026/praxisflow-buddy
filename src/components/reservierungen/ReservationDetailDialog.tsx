import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Building2,
  MapPin,
  Phone,
  User,
  Users,
  CalendarClock,
  StickyNote,
  Link as LinkIcon,
  Hash,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ReservationStatusBadge } from "./ReservationStatusBadge";
import {
  getDaysLeft,
  getEffectiveStatus,
  type Reservation,
} from "./types";
import { ProductInterestBadges } from "@/components/products/ProductInterestPicker";

interface Props {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function ReservationDetailDialog({ reservation, open, onOpenChange }: Props) {
  const { data: linked } = useQuery({
    enabled: !!reservation && open,
    queryKey: [
      "reservation_links",
      reservation?.id,
      reservation?.lead_id,
      reservation?.customer_id,
      reservation?.contract_id,
    ],
    queryFn: async () => {
      if (!reservation) return { lead: null, customer: null, contract: null };

      const [leadRes, customerRes, contractRes] = await Promise.all([
        reservation.lead_id
          ? supabase
              .from("leads")
              .select("id, hfx_customer_number, praxis_name, vorname, nachname, status")
              .eq("id", reservation.lead_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        reservation.customer_id
          ? supabase
              .from("customers")
              .select("id, hfx_customer_number, praxis_name, vorname, nachname")
              .eq("id", reservation.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        reservation.contract_id
          ? supabase
              .from("contracts")
              .select("id, contract_number, product_name, status")
              .eq("id", reservation.contract_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        lead: leadRes.data ?? null,
        customer: customerRes.data ?? null,
        contract: contractRes.data ?? null,
      };
    },
  });

  if (!reservation) return null;

  const effectiveStatus = getEffectiveStatus(reservation);
  const daysLeft = getDaysLeft(reservation.reserved_until);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {reservation.praxis_name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <ReservationStatusBadge status={effectiveStatus} />
            <span className="text-xs text-muted-foreground">
              Erfasst am{" "}
              {format(new Date(reservation.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={User} label="Ansprechpartner / Arzt">
            {reservation.arzt_namen || "—"}
          </Field>
          <Field icon={Phone} label="Telefon">
            {reservation.telefon || "—"}
          </Field>
          <Field icon={MapPin} label="Adresse">
            {reservation.strasse} {reservation.hausnummer}
            <br />
            <span className="text-muted-foreground">
              {reservation.plz} {reservation.ort}
            </span>
          </Field>
          <Field icon={CalendarClock} label="Reserviert bis">
            {format(new Date(reservation.reserved_until), "dd.MM.yyyy", { locale: de })}
            <span className="ml-2 text-xs text-muted-foreground">
              ({reservation.reservation_months} Monate ·{" "}
              {daysLeft >= 0 ? `${daysLeft} Tage übrig` : `${Math.abs(daysLeft)} Tage abgelaufen`})
            </span>
          </Field>
          <Field icon={User} label="Ersteller">
            {reservation.reserved_by_name || "—"}
          </Field>
          <Field icon={Users} label="Zuständiger AD">
            {reservation.assigned_ad_name || (
              <span className="text-muted-foreground italic">Kein AD zugeordnet</span>
            )}
            {reservation.assignment_source ? (
              <Badge variant="outline" className="ml-2 text-[10px]">
                {reservation.assignment_source}
              </Badge>
            ) : null}
          </Field>
        </div>

        {reservation.interested_products && reservation.interested_products.length > 0 ? (
          <>
            <Separator />
            <Field label="Interesse an">
              <ProductInterestBadges products={reservation.interested_products as string[]} />
            </Field>
          </>
        ) : null}

        {reservation.notes ? (
          <>
            <Separator />
            <Field icon={StickyNote} label="Notizen">
              <p className="whitespace-pre-wrap text-sm">{reservation.notes}</p>
            </Field>
          </>
        ) : null}

        {(linked?.lead || linked?.customer || linked?.contract) && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <LinkIcon className="h-3 w-3" />
                Verknüpfte Objekte
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                {linked.lead ? (
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">Lead</div>
                    <div className="font-medium">{linked.lead.praxis_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {linked.lead.hfx_customer_number || linked.lead.id.slice(0, 8)}
                    </div>
                  </div>
                ) : null}
                {linked.customer ? (
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">Kunde</div>
                    <div className="font-medium">{linked.customer.praxis_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {linked.customer.hfx_customer_number}
                    </div>
                  </div>
                ) : null}
                {linked.contract ? (
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">Vertrag</div>
                    <div className="font-medium">{linked.contract.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {linked.contract.contract_number || linked.contract.id.slice(0, 8)} ·{" "}
                      {linked.contract.status}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}

        <Separator />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Hash className="h-3 w-3" />
          <span className="font-mono">{reservation.id}</span>
          {reservation.converted_at ? (
            <span>
              · Konvertiert am{" "}
              {format(new Date(reservation.converted_at), "dd.MM.yyyy", { locale: de })}
            </span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
