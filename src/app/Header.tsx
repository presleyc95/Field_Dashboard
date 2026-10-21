import { RefreshCw, Search } from "lucide-react";
import { useLocation } from "react-router";
import { formatShort } from "@/data/dates";
import { cn } from "@/lib/cn";
import { hitchRange } from "@/lib/format";
import { useHitchStatus } from "@/state/hooks";
import { useTracker } from "@/state/tracker";
import { pageLabel } from "./nav";

export function Header() {
  const { pathname } = useLocation();
  const status = useHitchStatus();
  const dataThrough = useTracker((s) => s.dataset?.dataThrough);
  const ready = useTracker((s) => s.phase === "ready");
  const refreshing = useTracker((s) => s.refreshing);
  const reload = useTracker((s) => s.reload);

  const hitchText = !status
    ? "—"
    : status.kind === "on"
      ? `${hitchRange(status.hitch)} · Day ${status.day}/${status.hitch.days}`
      : status.next
        ? `Off · next ${formatShort(status.next.start)}`
        : "Off";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-6">
      <div className="truncate text-sm uppercase tracking-wider text-fg-muted">
        Field Ops <span className="text-fg-subtle">/</span>{" "}
        <span className="text-accent">{pageLabel(pathname)}</span>
      </div>

      <div className="flex items-center gap-4 text-xs uppercase tracking-wider text-fg-subtle">
        <span className="hidden md:inline">
          Hitch: <span className="text-fg-soft">{hitchText}</span>
        </span>
        <span className="hidden md:inline">
          Data through: <span className="text-fg-soft">{dataThrough ? formatShort(dataThrough) : "—"}</span>
        </span>
        <button
          type="button"
          aria-label="Search (Ctrl+K)"
          title="Search (Ctrl+K)"
          className="rounded p-1.5 text-fg-muted hover:bg-raised hover:text-accent"
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          aria-label="Reload data"
          title="Reload data"
          disabled={!ready || refreshing}
          onClick={() => void reload()}
          className="rounded p-1.5 text-fg-muted hover:bg-raised hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        >
          <RefreshCw size={16} className={cn(refreshing && "animate-spin text-accent")} />
        </button>
      </div>
    </header>
  );
}
