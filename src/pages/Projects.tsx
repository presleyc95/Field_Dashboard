import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { opcoPath, umbrellaPath } from "@/app/paths";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import { PACE_HITCHES, projectList, type ProjectListRow } from "@/data/projects";
import { formatInt, hitchRange } from "@/lib/format";
import { useFocusHitch } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

type UmbrellaRow = { name: string; opcos: number; poles: number; currentPoles: number; pace: number };

export function Projects() {
  const navigate = useNavigate();
  const dataset = useTracker((s) => s.dataset);
  const focus = useFocusHitch();
  const rows = useMemo(
    () => (dataset && focus ? projectList(dataset, focus).sort((a, b) => b.currentPoles - a.currentPoles || b.pace - a.pace || b.poles - a.poles) : null),
    [dataset, focus],
  );

  const umbrellas = useMemo<UmbrellaRow[]>(() => {
    if (!rows) return [];
    const by = new Map<string, UmbrellaRow>();
    for (const r of rows) {
      if (!r.umbrella) continue;
      let u = by.get(r.umbrella);
      if (!u) by.set(r.umbrella, (u = { name: r.umbrella, opcos: 0, poles: 0, currentPoles: 0, pace: 0 }));
      u.opcos++;
      u.poles += r.poles;
      u.currentPoles += r.currentPoles;
      u.pace += r.pace;
    }
    return [...by.values()].sort((a, b) => b.poles - a.poles);
  }, [rows]);

  if (!rows || !focus) {
    return (
      <Panel title="Projects">
        <ConnectionPrompt />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {umbrellas.map((u) => (
          <Link key={u.name} to={umbrellaPath(u.name)} className="group rounded-lg border border-line bg-panel p-4 hover:border-accent">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-fg group-hover:text-accent">{u.name}</span>
              <span className="text-xs text-fg-subtle">{u.opcos} OPCOs</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">This hitch</dt>
                <dd className="font-bold text-accent">{formatInt(u.currentPoles)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Pace / hitch</dt>
                <dd className="font-bold text-fg">{formatInt(u.pace)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">All poles</dt>
                <dd className="font-bold text-fg">{formatInt(u.poles)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      <Panel
        title={`OPCOs · ${rows.length}`}
        actions={
          <span className="text-xs text-fg-subtle">
            This hitch = {hitchRange(focus)} · pace = average of the last {PACE_HITCHES} hitches
          </span>
        }
      >
        <Table columns={COLUMNS} rows={rows} rowKey={(r) => r.project.name} onRowClick={(r) => navigate(opcoPath(r.project.name))} />
      </Panel>
    </div>
  );
}

const COLUMNS: Column<ProjectListRow>[] = [
  {
    header: "OPCO",
    cell: (r) => (
      <Link to={opcoPath(r.project.name)} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-medium text-fg hover:text-accent">
        {r.project.name}
      </Link>
    ),
  },
  {
    header: "Umbrella",
    cell: (r) =>
      r.umbrella ? (
        <Link to={umbrellaPath(r.umbrella)} onClick={(e) => e.stopPropagation()} className="text-fg-muted hover:text-accent">
          {r.umbrella}
        </Link>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  { header: "This hitch", cell: (r) => (r.currentPoles ? formatInt(r.currentPoles) : <span className="text-fg-subtle">0</span>), numeric: true },
  { header: "Pace / hitch", cell: (r) => formatInt(r.pace), numeric: true },
  { header: "All poles", cell: (r) => formatInt(r.poles), numeric: true },
  { header: "Permits", cell: (r) => formatInt(r.permits), numeric: true },
  { header: "Last worked", cell: (r) => (r.lastWorked ? formatShort(r.lastWorked, true) : "—"), className: "whitespace-nowrap" },
];
