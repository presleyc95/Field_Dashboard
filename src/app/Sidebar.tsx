import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { type Phase, useTracker } from "@/state/tracker";
import { NAV_ITEMS } from "./nav";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        {!collapsed && (
          <div>
            <div className="text-lg font-bold tracking-wider text-accent">FIELD OPS</div>
            <div className="text-xs text-fg-subtle">v{__APP_VERSION__} TSG FIELD</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded p-1 text-fg-muted hover:bg-raised hover:text-accent"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium uppercase tracking-wider transition-colors",
                isActive
                  ? "bg-accent text-accent-fg"
                  : "text-fg-muted hover:bg-raised hover:text-fg",
                collapsed && "justify-center px-0",
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && <ConnectionStatus />}
    </aside>
  );
}

const STATUS_TEXT: Record<Phase, string> = {
  starting: "Starting",
  unsupported: "Use Chrome or Edge",
  "needs-folder": "No tracker connected",
  "needs-permission": "Access needed",
  "choose-file": "Choose workbook",
  loading: "Loading",
  ready: "Tracker connected",
  error: "Load failed",
};

function ConnectionStatus() {
  const phase = useTracker((s) => s.phase);
  const fileName = useTracker((s) => s.fileName);
  const rows = useTracker((s) => s.dataset?.records.length);
  const refreshing = useTracker((s) => s.refreshing);

  const dot =
    phase === "ready"
      ? "bg-positive"
      : phase === "error" || phase === "unsupported"
        ? "bg-negative"
        : phase === "loading" || phase === "starting"
          ? "bg-accent animate-pulse"
          : "bg-warning";

  return (
    <NavLink
      to="/settings"
      className="m-3 block rounded border border-line bg-raised/60 p-3 text-xs hover:border-accent"
    >
      <div className="flex items-center gap-2 font-medium uppercase tracking-wider text-fg">
        <span className={cn("size-2 shrink-0 rounded-full", refreshing ? "bg-accent animate-pulse" : dot)} aria-hidden />
        {refreshing ? "Reloading" : STATUS_TEXT[phase]}
      </div>
      <div className="mt-2 space-y-0.5 uppercase text-fg-subtle">
        <div className="truncate" title={fileName ?? undefined}>
          Tracker: {fileName ? fileName.replace(/\.xlsx$/i, "") : "—"}
        </div>
        <div>Rows: {rows !== undefined ? formatInt(rows) : "—"}</div>
        <div>Mode: view only</div>
      </div>
    </NavLink>
  );
}
