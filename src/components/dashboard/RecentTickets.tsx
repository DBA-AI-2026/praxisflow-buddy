import { Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const tickets = [
  {
    id: "TK-2024-001",
    praxis: "Dr. med. Müller",
    typ: "Support 1st Level",
    status: "offen",
    zeit: "vor 15 Min",
  },
  {
    id: "TK-2024-002",
    praxis: "Zahnarztpraxis Schmidt",
    typ: "Demo-Termin",
    status: "geplant",
    zeit: "vor 1 Std",
  },
  {
    id: "TK-2024-003",
    praxis: "MVZ Gesundheit",
    typ: "Support 2nd Level",
    status: "in Bearbeitung",
    zeit: "vor 2 Std",
  },
  {
    id: "TK-2024-004",
    praxis: "Praxis Dr. Weber",
    typ: "Schulung",
    status: "offen",
    zeit: "vor 3 Std",
  },
];

const statusColors: Record<string, string> = {
  offen: "badge-warning",
  geplant: "badge-info",
  "in Bearbeitung": "badge-success",
  geschlossen: "badge-status bg-muted text-muted-foreground",
};

export function RecentTickets() {
  return (
    <div className="card-elevated">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Aktuelle Tickets</h3>
        <Link
          to="/tickets"
          className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Alle anzeigen
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="divide-y divide-border">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{ticket.id}</span>
                <span className={`badge-status ${statusColors[ticket.status]}`}>
                  {ticket.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {ticket.praxis} · {ticket.typ}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {ticket.zeit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
