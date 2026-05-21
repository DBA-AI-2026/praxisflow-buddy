/**
 * VertragTab — Tab 2 im KundenDialog (Etappe 3a).
 *
 * Lese-Modus: listet alle Verträge des Kunden, jeweils mit Header
 * (Vertragsnummer/Produkt, Status, Laufzeit, Preis) und drei PDF-Buttons:
 *   1. „Vorschau"                — interne Konditionsübersicht
 *   2. „Vertragsdaten als PDF"   — offizielles Vertragsdokument (template)
 *   3. „Manuell hochgeladenes Original" — nur falls document_url vorhanden
 *
 * Zusätzlich Navigations-Stub „Im Vertrags-Modul öffnen" → /vertrieb/vertraege.
 * Schreibende Aktionen (Status-Wechsel, SEPA-Mandat-Mail, Stornierung) folgen
 * in Etappe 3b — TODO im Code unten.
 */
import { useState } from "react";
import { Eye, FileText, Upload, ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { UseKundenDialogDataResult, ContractRow } from "@/hooks/useKundenDialogData";
import {
  previewContractPdf,
  templateContractPdf,
  getContractStorageSignedUrl,
} from "@/lib/contractPdfActions";

interface VertragTabProps {
  data: UseKundenDialogDataResult;
}

export function VertragTab({ data }: VertragTabProps) {
  const { contracts, isLoading, ssot } = data;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Lade Verträge…
      </div>
    );
  }

  if (ssot === "lead" || contracts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
        <div className="text-sm font-medium text-foreground">Noch kein Vertrag</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Für diesen Datensatz existiert noch kein Vertrag.
          Anlage erfolgt aktuell über das Vertrags-Modul.
        </div>
      </div>
    );
  }

  const sorted = [...contracts].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );

  return (
    <div className="space-y-4">
      {sorted.map((c) => (
        <ContractCard key={c.id} contract={c} />
      ))}
      {/* TODO Etappe 3b: hier folgen Aktions-Buttons
          (Status setzen, SEPA-Mandat-Mail erneut senden, Stornierung,
           Kündigung, Verlängerung). Aktuell nur Lese-Modus + Navigation. */}
      <div className="text-xs text-muted-foreground text-center pt-2">
        Aktionen folgen in Kürze. Vorübergehend erreichbar über das Vertrags-Modul.
      </div>
    </div>
  );
}

function ContractCard({ contract }: { contract: ContractRow }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"preview" | "template" | "storage" | null>(null);

  const status = contract.status ?? "—";
  const product = contract.product_name ?? "—";
  const number = contract.contract_number ?? contract.id.slice(0, 8);
  const price =
    contract.monthly_price != null
      ? `${Number(contract.monthly_price).toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} €/Monat`
      : "—";
  const laufzeit = contract.duration_months
    ? `${contract.duration_months} Monate`
    : "—";
  const start = contract.start_date
    ? new Date(contract.start_date).toLocaleDateString("de-DE")
    : "—";

  const runAction = async (
    kind: "preview" | "template" | "storage",
    fn: () => Promise<void>,
  ) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err: any) {
      toast({
        title: "PDF-Fehler",
        description: err?.message ?? "Unbekannter Fehler.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const openInVertraege = () => {
    // Navigations-Stub: /vertrieb/vertraege unterstützt heute nur ?leadId=
    // (kein ?contractId=). User landet auf der Vertragsliste und sucht manuell.
    toast({
      title: "Vertrags-Modul wird geöffnet",
      description: `Bitte suche nach „${number}" oder dem Praxisnamen.`,
    });
    navigate("/vertrieb/vertraege");
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{product}</div>
          <div className="text-xs text-muted-foreground font-mono">{number}</div>
        </div>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs">
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Field label="Preis" value={price} />
        <Field label="Laufzeit" value={laufzeit} />
        <Field label="Start" value={start} />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => runAction("preview", () => previewContractPdf(contract))}
        >
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Vorschau
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => runAction("template", () => templateContractPdf(contract))}
        >
          {busy === "template" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Vertragsdaten als PDF
        </Button>
        {contract.document_url && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() =>
              runAction("storage", async () => {
                const url = await getContractStorageSignedUrl(contract.document_url!);
                window.open(url, "_blank");
              })
            }
          >
            {busy === "storage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Manuell hochgeladenes Original
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 ml-auto"
          onClick={openInVertraege}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Im Vertrags-Modul öffnen
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}
