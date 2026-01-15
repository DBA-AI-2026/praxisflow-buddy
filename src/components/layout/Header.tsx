import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6 pl-14 md:pl-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Suchen..."
            className="w-64 pl-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
          <Bell className="h-4 w-4 md:h-5 md:w-5" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            3
          </span>
        </Button>
      </div>
    </header>
  );
}
