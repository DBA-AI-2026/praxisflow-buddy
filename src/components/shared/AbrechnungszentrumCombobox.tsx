import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ABRECHNUNGSZENTREN, isKnownAbrechnungszentrum } from "@/lib/abrechnungszentren";

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AbrechnungszentrumCombobox({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const legacy = value && !isKnownAbrechnungszentrum(value) ? value : null;
  const options: string[] = legacy ? [legacy, ...ABRECHNUNGSZENTREN] : [...ABRECHNUNGSZENTREN];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Abrechnungszentrum"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value ? (legacy ? `${value} (alter Wert)` : value) : "Bitte wählen"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Suchen…" />
          <CommandList>
            <CommandEmpty>Kein Treffer.</CommandEmpty>
            <CommandGroup>
              {options.map((opt, i) => (
                <CommandItem
                  key={`${i}-${opt}`}
                  value={`${i}::${opt}`}
                  keywords={[opt]}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                  {legacy && i === 0 && <span className="ml-1 text-muted-foreground">(alter Wert)</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
