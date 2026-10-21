import { Search as SearchIcon, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { opcoPath, permitPath, personPath } from "@/app/paths";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import { type MatchTier, type PermitHit, parseQuery } from "@/data/search";
import type { TrackerRecord } from "@/data/types";
import { formatInt } from "@/lib/format";
import { useSearchIndex } from "@/state/search";

const PAGE = 50;

const TIER_LABEL: Record<MatchTier, string> = {
  0: "Exact",
  1: "Starts with",
  2: "Contains",
  3: "Close spelling",
  4: "Filter",
};

const EXAMPLES = ["0735", "opco:aep status:progress", 'tech:"wayne campbell" task:pci', "status:awaiting"];

export function Search() {
  const index = useSearchIndex();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [input, setInput] = useState(urlQuery);
  const query = useDeferredValue(input);
  const [limit, setLimit] = useState(PAGE);

  // Follow the URL when it changes from outside (e.g. "See all results" in the palette).
  useEffect(() => setInput(urlQuery), [urlQuery]);

  // Keep the query in the URL so results can be shared and survive a reload.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (input !== urlQuery) setParams(input ? { q: input } : {}, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [input, urlQuery, setParams]);

  useEffect(() => setLimit(PAGE), [query]);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const results = useMemo(() => {
    if (!index || !query.trim()) return null;
    return {
      permits: index.permits(parsed, limit),
      people: index.people(parsed.text, 12),
      opcos: index.opcos(parsed.text, 12),
      umbrellas: index.umbrellas(parsed.text),
      notes: index.notes(parsed.text, 25),
    };
  }, [index, parsed, query, limit]);

  if (!index) {
    return (
      <Panel title="Search">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const filterChips = Object.entries(parsed.filters).flatMap(([k, values]) => values.map((v) => `${k}: ${v}`));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center gap-3 rounded border border-line bg-canvas px-3 focus-within:border-accent">
          <SearchIcon size={18} className="shrink-0 text-accent" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Permit ID (or part of one), name, OPCO, note…"
            aria-label="Search"
            className="h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            style={{ outline: "none" }}
          />
          {input && (
            <button type="button" aria-label="Clear" onClick={() => setInput("")} className="text-fg-subtle hover:text-fg">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          {filterChips.length > 0 ? (
            <>
              <span className="uppercase tracking-wider">Filters:</span>
              {filterChips.map((c) => (
                <span key={c} className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-accent">
                  {c}
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="uppercase tracking-wider">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setInput(ex)}
                  className="rounded border border-line px-1.5 py-0.5 text-fg-muted hover:border-accent hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </>
          )}
        </div>
      </Panel>

      {results && (
        <>
          <Panel
            title={`Permits · ${formatInt(results.permits.total)}`}
            actions={
              results.permits.total > results.permits.hits.length && (
                <span className="text-xs text-fg-subtle">
                  Showing {formatInt(results.permits.hits.length)}
                </span>
              )
            }
          >
            <Table columns={PERMIT_COLUMNS} rows={results.permits.hits} rowKey={(h) => h.permit.key} empty="No permits match" />
            {results.permits.total > results.permits.hits.length && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
              >
                Show {Math.min(PAGE, results.permits.total - results.permits.hits.length)} more
              </button>
            )}
          </Panel>

          {(results.people.length > 0 || results.opcos.length > 0 || results.umbrellas.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title={`People · ${results.people.length}`}>
                <LinkList
                  items={results.people.map((p) => ({
                    key: p.name,
                    to: personPath(p.name),
                    label: p.name,
                    detail: `${formatInt(p.rowsAsLogger)} logged · ${formatInt(p.rowsAsPartner)} as partner`,
                  }))}
                  empty="No people match"
                />
              </Panel>
              <Panel title={`OPCOs · ${results.opcos.length}`}>
                <LinkList
                  items={[
                    ...results.umbrellas.map((u) => ({
                      key: `u:${u.name}`,
                      to: `/search?q=${encodeURIComponent(`opco:${u.name.toLowerCase()}`)}`,
                      label: `${u.name} umbrella`,
                      detail: u.opcos.join(", "),
                    })),
                    ...results.opcos.map((o) => ({
                      key: o.name,
                      to: opcoPath(o.name),
                      label: o.name,
                      detail: `${o.umbrella ? `${o.umbrella} · ` : ""}${formatInt(o.recordCount)} rows`,
                    })),
                  ]}
                  empty="No OPCOs match"
                />
              </Panel>
            </div>
          )}

          {results.notes.total > 0 && (
            <Panel title={`Notes · ${formatInt(results.notes.total)}`}>
              <Table columns={noteColumns(parsed.text)} rows={results.notes.records} rowKey={(r) => r.id} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

const PERMIT_COLUMNS: Column<PermitHit>[] = [
  {
    header: "Permit ID",
    cell: (h) => (
      <Link to={permitPath(h.permit.id)} className="font-medium text-fg hover:text-accent">
        {h.permit.id}
      </Link>
    ),
  },
  { header: "OPCO", cell: (h) => h.permit.opcos.join(", ") },
  { header: "Tasks", cell: (h) => <span className="text-xs text-fg-muted">{h.permit.tasks.join(" · ")}</span> },
  { header: "Last worked", cell: (h) => (h.permit.lastDate ? formatShort(h.permit.lastDate, true) : "—"), className: "whitespace-nowrap" },
  { header: "Rows", cell: (h) => formatInt(h.permit.recordIds.length), numeric: true },
  { header: "Status", cell: (h) => <StatusBadge status={h.overall} short /> },
  { header: "Match", cell: (h) => <span className="text-xs text-fg-subtle">{TIER_LABEL[h.tier]}</span> },
];

function noteColumns(text: string): Column<TrackerRecord>[] {
  return [
    { header: "Date", cell: (r) => (r.date ? formatShort(r.date, true) : "—"), className: "whitespace-nowrap" },
    { header: "Tech", cell: (r) => r.tech ?? "—", className: "whitespace-nowrap" },
    {
      header: "Permit",
      cell: (r) =>
        r.permitId && r.permitKey ? (
          <Link to={permitPath(r.permitId)} className="text-fg hover:text-accent">
            {r.permitId}
          </Link>
        ) : (
          (r.permitId ?? "—")
        ),
    },
    { header: "Note", cell: (r) => <Highlight text={r.notes ?? ""} term={text} /> },
  ];
}

function Highlight({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-accent/25 text-fg">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

type LinkItem = { key: string; to: string; label: string; detail: string };

function LinkList({ items, empty }: { items: LinkItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-xs uppercase tracking-wider text-fg-subtle">{empty}</p>;
  return (
    <ul className="divide-y divide-line-subtle">
      {items.map((item) => (
        <li key={item.key}>
          <Link to={item.to} className="flex items-center justify-between gap-4 py-2 text-sm hover:text-accent">
            <span className="truncate text-fg">{item.label}</span>
            <span className="shrink-0 truncate text-xs text-fg-subtle">{item.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
