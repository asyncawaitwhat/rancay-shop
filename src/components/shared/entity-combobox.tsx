"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/providers/language-provider";

export interface ComboItem {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  keywords?: string;
}

/**
 * A searchable single-select. Selection is ONLY possible from the list — there
 * is no free text entry, which is required for choosing clients and products.
 */
export function EntityCombobox({
  items,
  value,
  onSelect,
  placeholder,
  emptyText,
  disabled,
  className,
}: {
  items: ComboItem[];
  value?: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = items.find((i) => i.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      `${i.label} ${i.sublabel || ""} ${i.keywords || ""}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder || t("action.select")}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("action.search")}
            className="h-10 border-0 focus-visible:ring-0 shadow-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {emptyText || t("common.noResults")}
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  onSelect(item.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-start text-sm hover:bg-accent disabled:opacity-50 disabled:pointer-events-none",
                  item.id === value && "bg-accent"
                )}
              >
                <Check className={cn("h-4 w-4", item.id === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
