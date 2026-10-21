import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { opcoPath, personPath } from "@/app/paths";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { type Group, groupRecords, isProduction, recordsInHitch } from "@/data/metrics";
import type { Dataset, TrackerRecord } from "@/data/types";
import { formatInt, formatRate, hitchRange } from "@/lib/format";
import { useFocusHitch, useHitchSummaries } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

type TeamCard = Group & { opcos: string[]; tasks: string[] };
type Pairing = Group & { hitches: number };

export function Teams() {
  const dataset = useTracker((s) => s.dataset);
  const summaries = useHitchSummaries();
  const focus = useFocusHitch();
  const [params, setParams] = useSearchParams();

  const requested = Number(params.get("h"));
  const hitchId = params.has("h") && dataset?.hitches[requested] ? requested : (focus?.id ?? null);

  const cards = useMemo(() => (dataset && hitchId !== null ? teamCards(dataset, recordsInHitch(dataset, hitchId)) : []), [dataset, hitchId]);
  const pairings = useMemo(() => (dataset ? pairingsOf(dataset) : []), [dataset]);

  if (!dataset || !summaries || hitchId === null) {
    return (
      <Panel title="Teams">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const hitch = dataset.hitches[hitchId]!;
  const options = summaries.filter((s) => s.rows > 0).reverse();
  const paired = cards.filter((c) => c.key.includes(" + ")).length;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Hitch</span>
            <select
              value={hitchId}
              onChange={(e) => setParams({ h: e.target.value }, { replace: true })}
              className="rounded border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent"
            >
              {options.map((s) => (
                <option key={s.hitch.id} value={s.hitch.id}>
                  {hitchRange(s.hitch)}
                  {s.state === "current" ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="text-right text-xs text-fg-subtle">
            {cards.length} teams in {hitchRange(hitch)} · {paired} paired, {cards.length - paired} solo
            <div>A team is the person who logs rows plus whoever they were paired with.</div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((t, i) => (
          <TeamCardView key={t.key} team={t} rank={i + 1} />
        ))}
      </div>

      <Panel title="Pairings this year" actions={<span className="text-xs text-fg-subtle">Pairs who worked together most</span>}>
        <Table columns={PAIRING_COLUMNS} rows={pairings.slice(0, 30)} exportRows={pairings} rowKey={(p) => p.key} exportName="Pairings" />
      </Panel>
    </div>
  );
}

function TeamCardView({ team: t, rank }: { team: TeamCard; rank: number }) {
  const names = t.key.split(" + ");
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          {names.map((name, i) => (
            <div key={name} className="truncate">
              {i > 0 && <span className="text-fg-subtle">+ </span>}
              <Link to={personPath(name)} className="font-medium text-fg hover:text-accent">
                {name}
              </Link>
            </div>
          ))}
          {names.length === 1 && <div className="text-xs text-fg-subtle">Solo</div>}
        </div>
        <span className="text-xs tabular-nums text-fg-subtle">#{rank}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Poles" value={formatInt(t.poles)} accent />
        <Stat label="Days" value={formatInt(t.workDays)} />
        <Stat label="Per day" value={formatRate(t.workDays ? t.poles / t.workDays : null)} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-wider">
        {t.opcos.map((o) => (
          <Link key={o} to={opcoPath(o)} className="rounded border border-line px-1.5 py-0.5 text-fg-muted hover:border-accent hover:text-accent">
            {o}
          </Link>
        ))}
        {t.tasks.map((task) => (
          <span key={task} className="rounded bg-raised px-1.5 py-0.5 text-fg-subtle">
            {task}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className={accent ? "text-lg font-bold text-accent" : "text-lg font-bold text-fg"}>{value}</dd>
    </div>
  );
}

function teamCards(dataset: Dataset, records: TrackerRecord[]): TeamCard[] {
  return groupRecords(records, "team").map((g) => {
    const rows = g.recordIds.map((id) => dataset.records[id]!);
    return {
      ...g,
      opcos: topBy(rows, (r) => r.opco, 3),
      tasks: topBy(rows.filter(isProduction), (r) => r.task, 3),
    };
  });
}

function topBy(rows: TrackerRecord[], value: (r: TrackerRecord) => string | null, n: number): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = value(r);
    if (v) counts.set(v, (counts.get(v) ?? 0) + (r.poles ?? 0) + 0.001);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

/** Pairs (not solo) across all data, most days together first. */
function pairingsOf(dataset: Dataset): Pairing[] {
  return groupRecords(
    dataset.records.filter((r) => r.partner),
    "team",
  )
    .map((g) => ({ ...g, hitches: new Set(g.recordIds.map((id) => dataset.records[id]!.hitchId).filter((h) => h !== null)).size }))
    .sort((a, b) => b.workDays - a.workDays || b.poles - a.poles);
}

const PAIRING_COLUMNS: Column<Pairing>[] = [
  {
    header: "Pair",
    cell: (p) => (
      <span className="whitespace-nowrap">
        {p.key.split(" + ").map((name, i) => (
          <span key={name}>
            {i > 0 && <span className="text-fg-subtle"> + </span>}
            <Link to={personPath(name)} className="text-fg hover:text-accent">
              {name}
            </Link>
          </span>
        ))}
      </span>
    ),
  },
  { header: "Hitches", cell: (p) => formatInt(p.hitches), numeric: true },
  { header: "Days", cell: (p) => formatInt(p.workDays), numeric: true },
  { header: "Poles", cell: (p) => formatInt(p.poles), numeric: true },
  { header: "Poles / day", cell: (p) => formatRate(p.workDays ? p.poles / p.workDays : null), numeric: true },
];
