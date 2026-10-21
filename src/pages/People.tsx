import { Search as SearchIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { opcoPath, personPath } from "@/app/paths";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import type { PersonRow } from "@/data/people";
import { cn } from "@/lib/cn";
import { formatInt, formatRate } from "@/lib/format";
import { usePeopleDirectory } from "@/state/people";

const SORTS: { key: string; label: string; compare: (a: PersonRow, b: PersonRow) => number }[] = [
  { key: "poles", label: "Poles", compare: (a, b) => b.poles - a.poles },
  { key: "rate", label: "Poles / tech-day", compare: (a, b) => (b.polesPerTechDay ?? -1) - (a.polesPerTechDay ?? -1) },
  { key: "recent", label: "Last worked", compare: (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") },
  { key: "name", label: "Name", compare: (a, b) => a.name.localeCompare(b.name) },
];

export function People() {
  const navigate = useNavigate();
  const directory = usePeopleDirectory();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("poles");
  const query = useDeferredValue(filter.trim().toLowerCase());

  const rows = useMemo(() => {
    if (!directory) return [];
    const compare = SORTS.find((s) => s.key === sort)!.compare;
    return directory.filter((p) => !query || p.name.toLowerCase().includes(query)).sort(compare);
  }, [directory, query, sort]);

  if (!directory) {
    return (
      <Panel title="People">
        <ConnectionPrompt />
      </Panel>
    );
  }

  return (
    <Panel
      title={`People · ${rows.length}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-line bg-canvas px-2 focus-within:border-accent">
            <SearchIcon size={14} className="text-fg-subtle" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name"
              aria-label="Filter by name"
              className="h-8 w-40 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              style={{ outline: "none" }}
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort by"
            className="h-8 rounded border border-line bg-canvas px-2 text-sm text-fg"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <Table columns={COLUMNS} rows={rows} rowKey={(p) => p.name} onRowClick={(p) => navigate(personPath(p.name))} empty="No one matches" />
    </Panel>
  );
}

const COLUMNS: Column<PersonRow>[] = [
  {
    header: "Name",
    cell: (p) => (
      <span className="whitespace-nowrap">
        <Link to={personPath(p.name)} onClick={(e) => e.stopPropagation()} className="text-fg hover:text-accent">
          {p.name}
        </Link>
        {p.partnerOnly && <span className={cn("ml-2 text-xs text-fg-subtle")}>partner only</span>}
      </span>
    ),
  },
  { header: "Poles", cell: (p) => formatInt(p.poles), numeric: true },
  { header: "Tech-days", cell: (p) => formatInt(p.techDays), numeric: true },
  { header: "Poles / tech-day", cell: (p) => formatRate(p.polesPerTechDay), numeric: true },
  { header: "Hitches", cell: (p) => formatInt(p.hitches), numeric: true },
  {
    header: "Most worked",
    cell: (p) =>
      p.topOpco ? (
        <Link to={opcoPath(p.topOpco)} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-fg-soft hover:text-accent">
          {p.topOpco}
        </Link>
      ) : (
        "—"
      ),
  },
  { header: "Last worked", cell: (p) => (p.lastDate ? formatShort(p.lastDate, true) : "—"), className: "whitespace-nowrap" },
];
