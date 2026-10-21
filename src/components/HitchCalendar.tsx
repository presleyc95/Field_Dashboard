import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { addDays, dayNumber, localToday } from "@/data/dates";
import { HitchIndex } from "@/data/hitches";
import type { Dataset } from "@/data/types";
import { cn } from "@/lib/cn";
import { compact } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Props = {
  dataset: Dataset;
  selectedId: number;
  onSelect: (hitchId: number) => void;
};

/**
 * Month calendar of the hitch schedule: hitch days in the accent (the selected hitch brighter),
 * the hitch day number, and poles logged each day. Two months side by side on wide screens.
 */
export function HitchCalendar({ dataset, selectedId, onSelect }: Props) {
  const selected = dataset.hitches[selectedId];
  const [month, setMonth] = useState(() => monthOf(selected?.start ?? localToday()));
  const [lastSelected, setLastSelected] = useState(selectedId);
  // Jump to the selected hitch's month when the selection changes elsewhere on the page.
  if (selectedId !== lastSelected) {
    setLastSelected(selectedId);
    if (selected) setMonth(monthOf(selected.start));
  }

  const index = useMemo(() => new HitchIndex(dataset.hitches), [dataset]);
  const polesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dataset.records) if (r.date) m.set(r.date, (m.get(r.date) ?? 0) + (r.poles ?? 0));
    return m;
  }, [dataset]);
  const today = localToday();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <NavButton label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft size={16} />
          </NavButton>
          <NavButton label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight size={16} />
          </NavButton>
          <button
            type="button"
            onClick={() => setMonth(monthOf(today))}
            className="rounded border border-line px-2 py-1 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
          >
            Today
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          <Key className="bg-accent" label="Selected hitch" />
          <Key className="bg-accent/30" label="Hitch day" />
          <Key className="bg-raised" label="Off" />
          <Key className="ring-1 ring-fg" label="Today" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[month, shiftMonth(month, 1)].map((m, i) => (
          <MonthGrid
            key={m}
            month={m}
            className={i === 1 ? "hidden lg:block" : undefined}
            render={(date) => {
              const found = index.find(date);
              const poles = polesByDate.get(date);
              const isSelected = found?.hitch.id === selectedId;
              return (
                <button
                  type="button"
                  disabled={!found}
                  onClick={() => found && onSelect(found.hitch.id)}
                  title={
                    found
                      ? `Hitch ${found.hitch.start} – ${found.hitch.end}, day ${found.day}${poles ? ` · ${poles} poles` : ""}`
                      : poles
                        ? `Off hitch · ${poles} poles`
                        : "Off"
                  }
                  className={cn(
                    "flex h-14 w-full flex-col justify-between rounded p-1 text-left text-xs transition-colors",
                    found ? (isSelected ? "bg-accent text-accent-fg" : "bg-accent/20 text-fg hover:bg-accent/40") : "bg-raised/40 text-fg-subtle",
                    date === today && "ring-2 ring-fg",
                    !found && "cursor-default",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-medium">{Number(date.slice(8))}</span>
                    {found && <span className={cn("text-[10px]", isSelected ? "text-accent-fg/80" : "text-fg-muted")}>D{found.day}</span>}
                  </span>
                  <span className={cn("text-[10px] tabular-nums", isSelected ? "text-accent-fg" : poles ? "text-fg-soft" : "text-transparent")}>
                    {poles ? compact(poles) : "·"}
                  </span>
                </button>
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ month, render, className }: { month: string; render: (date: string) => ReactNode; className?: string }) {
  const first = `${month}-01`;
  const startWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const days = daysInMonth(month);
  const cells: (string | null)[] = [...Array<null>(startWeekday).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const [y, m] = month.split("-").map(Number) as [number, number];

  return (
    <div className={className}>
      <div className="mb-2 text-sm font-medium uppercase tracking-wider text-fg-soft">
        {MONTHS[m - 1]} {y}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] uppercase tracking-wider text-fg-subtle">
            {d}
          </div>
        ))}
        {cells.map((date, i) => (
          <div key={date ?? `blank-${i}`}>{date ? render(date) : null}</div>
        ))}
      </div>
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded border border-line p-1 text-fg-muted hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

/** "2026-10" for a date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const next = `${shiftMonth(month, 1)}-01`;
  return dayNumber(next) - dayNumber(`${month}-01`);
}

