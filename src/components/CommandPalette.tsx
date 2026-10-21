import { ArrowRight, Building2, FileText, Search, Umbrella, User } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { opcoPath, permitPath, personPath, searchPath } from "@/app/paths";
import { formatShort } from "@/data/dates";
import { parseQuery } from "@/data/search";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { usePalette, useSearchIndex } from "@/state/search";
import { StatusBadge } from "./StatusBadge";

type Item = {
  key: string;
  group: string;
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  to: string;
};

/** Ctrl+K search over permits, people and OPCOs. Enter opens the highlighted result. */
export function CommandPalette() {
  const { open, setOpen } = usePalette();
  if (!open) return null;
  return <PaletteDialog onClose={() => setOpen(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const index = useSearchIndex();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const q = deferred.trim();
    if (!index || !q) return [];
    const parsed = parseQuery(q);
    const out: Item[] = [];
    const { hits, total } = index.permits(parsed, 6);
    for (const h of hits) {
      out.push({
        key: `p:${h.permit.key}`,
        group: `Permits${total > hits.length ? ` (${formatInt(total)})` : ""}`,
        icon: <FileText size={16} />,
        label: h.permit.id,
        detail: (
          <span className="flex items-center gap-2">
            <span className="truncate">{h.permit.opcos.join(", ")}</span>
            {h.permit.lastDate && <span>{formatShort(h.permit.lastDate, true)}</span>}
            <StatusBadge status={h.overall} short />
          </span>
        ),
        to: permitPath(h.permit.id),
      });
    }
    if (parsed.text) {
      for (const p of index.people(parsed.text, 4)) {
        out.push({
          key: `t:${p.name}`,
          group: "People",
          icon: <User size={16} />,
          label: p.name,
          detail: `${formatInt(p.rowsAsLogger + p.rowsAsPartner)} rows`,
          to: personPath(p.name),
        });
      }
      for (const u of index.umbrellas(parsed.text)) {
        out.push({
          key: `u:${u.name}`,
          group: "OPCOs",
          icon: <Umbrella size={16} />,
          label: `${u.name} (umbrella)`,
          detail: `${u.opcos.length} OPCOs`,
          to: searchPath(`opco:${u.name.toLowerCase()}`),
        });
      }
      for (const o of index.opcos(parsed.text, 4)) {
        out.push({
          key: `o:${o.name}`,
          group: "OPCOs",
          icon: <Building2 size={16} />,
          label: o.name,
          detail: o.umbrella ? `${o.umbrella} · ${formatInt(o.recordCount)} rows` : `${formatInt(o.recordCount)} rows`,
          to: opcoPath(o.name),
        });
      }
    }
    out.push({
      key: "all",
      group: "",
      icon: <Search size={16} />,
      label: `See all results for "${q}"`,
      to: searchPath(q),
    });
    return out;
  }, [deferred, index]);

  useEffect(() => setActive(0), [items]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-accent" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search permits, people, OPCOs…"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            style={{ outline: "none" }}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {!index ? (
            <p className="px-3 py-6 text-center text-xs uppercase tracking-wider text-fg-subtle">
              Connect the tracker to search
            </p>
          ) : !query.trim() ? (
            <p className="px-3 py-6 text-center text-xs text-fg-subtle">
              Type a Permit ID (or part of one), a name or an OPCO. Filters: <code className="text-fg-muted">opco:</code>{" "}
              <code className="text-fg-muted">tech:</code> <code className="text-fg-muted">task:</code>{" "}
              <code className="text-fg-muted">status:</code>
            </p>
          ) : (
            items.map((item, i) => {
              const header = item.group && item.group !== lastGroup ? item.group : null;
              lastGroup = item.group || lastGroup;
              return (
                <div key={item.key}>
                  {header && <div className="label-caps px-3 pt-3 pb-1">{header}</div>}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm",
                      i === active ? "bg-raised text-fg" : "text-fg-soft",
                      item.key === "all" && "mt-2 border-t border-line-subtle text-fg-muted",
                    )}
                  >
                    <span className={cn("shrink-0", i === active ? "text-accent" : "text-fg-subtle")}>{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.detail && <span className="min-w-0 shrink-0 text-xs text-fg-subtle">{item.detail}</span>}
                    {i === active && <ArrowRight size={14} className="shrink-0 text-accent" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Opens the palette on Ctrl+K (⌘K on a Mac). */
export function usePaletteShortcut() {
  const setOpen = usePalette((s) => s.setOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
