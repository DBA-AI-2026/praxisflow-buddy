import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { X, Filter } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_VALUES,
} from "./types";

export interface ReservationFilters {
  search: string;
  status: string; // "all" or ReservationStatus
  assignedAd: string; // "all" or user_id
  creator: string; // "all" or user_id
  plz: string;
  ort: string;
  onlyMine: boolean;
  onlyAssignedToMe: boolean;
  activity: "all" | "active" | "expired";
  product: string; // "all" or product name
}

export const DEFAULT_FILTERS: ReservationFilters = {
  search: "",
  status: "all",
  assignedAd: "all",
  creator: "all",
  plz: "",
  ort: "",
  onlyMine: false,
  onlyAssignedToMe: false,
  activity: "all",
  product: "all",
};

interface PersonOption {
  id: string;
  name: string;
}

interface Props {
  filters: ReservationFilters;
  onChange: (next: ReservationFilters) => void;
  ads: PersonOption[];
  creators: PersonOption[];
}

export function ReservationFiltersBar({ filters, onChange, ads, creators }: Props) {
  const update = <K extends keyof ReservationFilters>(
    key: K,
    value: ReservationFilters[K],
  ) => onChange({ ...filters, [key]: value });

  const reset = () => onChange(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.search ||
    filters.status !== "all" ||
    filters.assignedAd !== "all" ||
    filters.creator !== "all" ||
    filters.plz ||
    filters.ort ||
    filters.onlyMine ||
    filters.onlyAssignedToMe ||
    filters.activity !== "all";

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </div>

        <Input
          placeholder="Suche (Praxis, Arzt, Telefon)…"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
          className="h-8 w-56 text-xs"
        />

        <Select value={filters.status} onValueChange={(v) => update("status", v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {RESERVATION_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {RESERVATION_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.assignedAd} onValueChange={(v) => update("assignedAd", v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Zuständiger AD" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle AD</SelectItem>
            <SelectItem value="__none__">Ohne Zuordnung</SelectItem>
            {ads.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.creator} onValueChange={(v) => update("creator", v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Ersteller" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Ersteller</SelectItem>
            {creators.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="PLZ"
          value={filters.plz}
          onChange={(e) => update("plz", e.target.value)}
          className="h-8 w-20 text-xs"
          maxLength={5}
        />
        <Input
          placeholder="Ort"
          value={filters.ort}
          onChange={(e) => update("ort", e.target.value)}
          className="h-8 w-32 text-xs"
        />

        <Select value={filters.activity} onValueChange={(v) => update("activity", v as ReservationFilters["activity"])}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Aktiv & Abgelaufen</SelectItem>
            <SelectItem value="active">Nur aktive</SelectItem>
            <SelectItem value="expired">Nur abgelaufene</SelectItem>
          </SelectContent>
        </Select>

        <Toggle
          size="sm"
          pressed={filters.onlyMine}
          onPressedChange={(v) => update("onlyMine", v)}
          className="h-8 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Nur meine
        </Toggle>
        <Toggle
          size="sm"
          pressed={filters.onlyAssignedToMe}
          onPressedChange={(v) => update("onlyAssignedToMe", v)}
          className="h-8 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Mir zugewiesen
        </Toggle>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 gap-1">
            <X className="h-3 w-3" />
            Zurücksetzen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
