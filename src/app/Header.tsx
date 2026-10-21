import { RefreshCw, Search } from "lucide-react";
import { useLocation } from "react-router";
import { pageLabel } from "./nav";

export function Header() {
  const { pathname } = useLocation();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-6">
      <div className="truncate text-sm uppercase tracking-wider text-fg-muted">
        Field Ops <span className="text-fg-subtle">/</span>{" "}
        <span className="text-accent">{pageLabel(pathname)}</span>
      </div>

      <div className="flex items-center gap-4 text-xs uppercase tracking-wider text-fg-subtle">
        <span className="hidden md:inline">Hitch: —</span>
        <span className="hidden md:inline">Data through: —</span>
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
          className="rounded p-1.5 text-fg-muted hover:bg-raised hover:text-accent"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}
