import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const praxen = [
  {
    name: "Dr. med. Müller",
    mpNr: "MP-123456",
    produkt: "HFX GOÄ",
    module: ["GOÄ-Prüfung", "Live-Check"],
    preis: "–",
    datum: "12.01.2025",
  },
  {
    name: "Zahnarztpraxis Schmidt",
    mpNr: "MP-789012",
    produkt: "HFX GOZ Live-Check",
    module: ["GOZ-Prüfung"],
    preis: "–",
    datum: "10.01.2025",
  },
  {
    name: "MVZ Gesundheit",
    mpNr: "MP-345678",
    produkt: "HFX EBM",
    module: ["EBM-Prüfung", "Benchmark"],
    preis: "–",
    datum: "08.01.2025",
  },
];

export function RecentPraxen() {
  return (
    <div className="card-elevated">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Neue Kunden</h3>
        <Link
          to="/pipeline?tab=bestandskunden"
          className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Alle anzeigen
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>MP-Nr</th>
              <th>Produkt</th>
              <th>Preis/Monat</th>
              <th>Buchung</th>
            </tr>
          </thead>
          <tbody>
            {praxen.map((praxis) => (
              <tr key={praxis.mpNr}>
                <td className="font-medium text-foreground">{praxis.name}</td>
                <td className="text-muted-foreground font-mono text-xs">
                  {praxis.mpNr}
                </td>
                <td>
                  <div>
                    <span className="text-foreground">{praxis.produkt}</span>
                    <div className="flex gap-1 mt-1">
                      {praxis.module.map((mod) => (
                        <span
                          key={mod}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground"
                        >
                          {mod}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="font-medium text-foreground">{praxis.preis}</td>
                <td className="text-muted-foreground">{praxis.datum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
