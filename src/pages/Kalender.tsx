import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  praxis: string;
  typ: "demo" | "schulung" | "support";
  time: string;
  teamsLink?: string;
}

const events: Record<string, CalendarEvent[]> = {
  "2025-01-20": [
    {
      id: "1",
      title: "Demo HFX GOÄ",
      praxis: "Zahnarztpraxis Schmidt",
      typ: "demo",
      time: "10:00",
      teamsLink: "https://teams.microsoft.com/...",
    },
    {
      id: "2",
      title: "Support-Termin",
      praxis: "MVZ Gesundheit",
      typ: "support",
      time: "14:00",
    },
  ],
  "2025-01-22": [
    {
      id: "3",
      title: "Einführungsschulung",
      praxis: "Praxis Dr. Weber",
      typ: "schulung",
      time: "14:00",
      teamsLink: "https://teams.microsoft.com/...",
    },
  ],
  "2025-01-24": [
    {
      id: "4",
      title: "Demo HFX EBM",
      praxis: "Klinikum Nord",
      typ: "demo",
      time: "09:00",
      teamsLink: "https://teams.microsoft.com/...",
    },
  ],
};

const typColors: Record<string, string> = {
  demo: "bg-primary/10 border-primary/30 text-primary",
  schulung: "bg-accent/10 border-accent/30 text-accent",
  support: "bg-warning/10 border-warning/30 text-warning",
};

export default function Kalender() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingDay = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const formatDateKey = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;
  };

  const days = [];
  for (let i = 0; i < startingDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthNames = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];

  const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <MainLayout title="Kalender" subtitle="Terminübersicht für Demos und Schulungen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold text-foreground min-w-48 text-center">
            {monthNames[month]} {year}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => setCurrentDate(new Date(2025, 0, 1))}
        >
          Heute
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="card-elevated overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dateKey = day ? formatDateKey(day) : null;
            const dayEvents = dateKey ? events[dateKey] || [] : [];
            const isToday =
              day === 15 && month === 0 && year === 2025; // Simulated today

            return (
              <div
                key={index}
                className={`min-h-32 border-b border-r border-border p-2 ${
                  day ? "bg-card" : "bg-muted/30"
                }`}
              >
                {day && (
                  <>
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                        isToday
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className={`rounded px-2 py-1 text-xs border ${
                            typColors[event.typ]
                          }`}
                        >
                          <div className="font-medium">{event.time}</div>
                          <div className="truncate">{event.title}</div>
                          <div className="truncate text-[10px] opacity-80">
                            {event.praxis}
                          </div>
                          {event.teamsLink && (
                            <a
                              href={event.teamsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 hover:underline"
                            >
                              <Video className="h-3 w-3" />
                              Teams
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-primary/20 border border-primary/30" />
          <span className="text-muted-foreground">Demo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-accent/20 border border-accent/30" />
          <span className="text-muted-foreground">Schulung</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-warning/20 border border-warning/30" />
          <span className="text-muted-foreground">Support</span>
        </div>
      </div>
    </MainLayout>
  );
}
