import { Lock, PencilLine, Search as SearchIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { permitPath } from "@/app/paths";
import { Button } from "@/components/Button";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { daysBetween, formatShort, localToday } from "@/data/dates";
import { awaitingUpload } from "@/data/metrics";
import type { Dataset, TrackerRecord } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatInt, formatNumber, hitchRange, rowLabel } from "@/lib/format";
import { useTracker } from "@/state/tracker";
import { markKey, useUploads } from "@/state/uploads";

const PAGE = 100;

const AGES = [
  { value: 0, label: "Any age" },
  { value: 14, label: "Older than 2 weeks" },
  { value: 30, label: "Older than 30 days" },
  { value: 90, label: "Older than 90 days" },
];

export function UploadQueue() {
  const dataset = useTracker((s) => s.dataset);
  const fileName = useTracker((s) => s.fileName);
  const { editMode, canWrite, pending, enableEditing, disableEditing, toggle, add, error } = useUploads();
  const [hitch, setHitch] = useState("all");
  const [opco, setOpco] = useState("all");
  const [task, setTask] = useState("all");
  const [age, setAge] = useState(0);
  const [text, setText] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const query = useDeferredValue(text.trim().toLowerCase());
  const today = localToday();

  const queue = useMemo(() => (dataset ? dataset.records.filter(awaitingUpload) : []), [dataset]);
  const shown = useMemo(() => {
    const rows = queue.filter(
      (r) =>
        (hitch === "all" || String(r.hitchId) === hitch) &&
        (opco === "all" || r.opco === opco || (opco.startsWith("u:") && r.umbrella === opco.slice(2))) &&
        (task === "all" || r.task === task) &&
        (!age || (r.date !== null && daysBetween(r.date, today) > age)) &&
        (!query ||
          r.tech?.toLowerCase().includes(query) ||
          r.partner?.toLowerCase().includes(query) ||
          r.permitId?.toLowerCase().includes(query)),
    );
    return rows.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : (a.date ?? "") > (b.date ?? "") ? 1 : a.excelRow - b.excelRow) * (newestFirst ? -1 : 1));
  }, [queue, hitch, opco, task, age, query, newestFirst, today]);

  if (!dataset) {
    return (
      <Panel title="Upload queue">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const poles = queue.reduce((n, r) => n + (r.poles ?? 0), 0);
  const oldest = queue.reduce<string | null>((m, r) => (r.date && (!m || r.date < m) ? r.date : m), null);
  const markedCount = Object.values(pending).filter((m) => m.source === fileName).length;
  const shownMarked = shown.filter((r) => pending[markKey(r)]).length;
  const filtersActive = hitch !== "all" || opco !== "all" || task !== "all" || age > 0 || !!query;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Awaiting upload" value={formatInt(queue.length)} invert footnote="Completed jobs not marked Yes" />
        <KpiCard label="Poles" value={formatInt(poles)} footnote="On those rows" />
        <KpiCard
          label="Oldest"
          value={oldest ? formatShort(oldest, true) : "—"}
          footnote={oldest ? `${formatInt(daysBetween(oldest, today))} days ago` : undefined}
        />
        <KpiCard label="Marked, not saved" value={formatInt(markedCount)} footnote={editMode ? "In the tray at the bottom right" : "Turn on editing to mark rows"} />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {editMode ? (
            <div className="flex items-center gap-3 text-sm">
              <PencilLine size={18} className="text-accent" />
              <div>
                <div className="font-medium text-fg">Editing is on</div>
                <div className="text-xs text-fg-muted">
                  Tick rows that are uploaded, then save from the tray. Only "Uploaded to Katapult" changes, in {fileName}.
                  {!canWrite && " This session still needs permission; you'll be asked when you save."}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Lock size={18} className="text-fg-subtle" />
              <div>
                <div className="font-medium text-fg">View only</div>
                <div className="text-xs text-fg-muted">The field admin turns on editing to mark jobs uploaded. The browser asks for permission to change the tracker folder.</div>
              </div>
            </div>
          )}
          {editMode ? (
            <Button onClick={disableEditing}>Turn off editing</Button>
          ) : (
            <Button variant="primary" onClick={() => void enableEditing()}>
              <PencilLine size={16} /> Turn on editing
            </Button>
          )}
        </div>
        {error && !editMode && <p className="mt-3 text-xs text-negative">{error.message}</p>}
      </Panel>

      <Panel
        title={`Queue · ${formatInt(shown.length)}${filtersActive ? ` of ${formatInt(queue.length)}` : ""}`}
        actions={
          editMode && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => add(shown.filter((r) => !pending[markKey(r)]))}
                disabled={shown.length === 0 || shownMarked === shown.length}
                className="rounded border border-line px-2 py-1 uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Mark all {formatInt(shown.length)} shown
              </button>
              {shownMarked > 0 && (
                <button
                  type="button"
                  onClick={() => shown.filter((r) => pending[markKey(r)]).forEach(toggle)}
                  className="rounded border border-line px-2 py-1 uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
                >
                  Unmark {formatInt(shownMarked)}
                </button>
              )}
            </div>
          )
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select label="Hitch" value={hitch} onChange={setHitch} options={hitchOptions(dataset, queue)} />
          <Select label="OPCO" value={opco} onChange={setOpco} options={opcoOptions(queue)} />
          <Select
            label="Task"
            value={task}
            onChange={setTask}
            options={[{ value: "all", label: "All tasks" }, ...[...new Set(queue.map((r) => r.task ?? ""))].sort().map((t) => ({ value: t, label: t }))]}
          />
          <Select label="Age" value={String(age)} onChange={(v) => setAge(Number(v))} options={AGES.map((a) => ({ value: String(a.value), label: a.label }))} />
          <label className="flex flex-col gap-1">
            <span className="label-caps">Tech or permit</span>
            <span className="flex items-center gap-2 rounded border border-line bg-canvas px-2 focus-within:border-accent">
              <SearchIcon size={14} className="text-fg-subtle" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Filter"
                className="h-9 w-40 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                style={{ outline: "none" }}
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="h-9 rounded border border-line px-3 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
          >
            {newestFirst ? "Newest first" : "Oldest first"}
          </button>
        </div>

        <Table
          columns={columns(editMode, pending, toggle, today)}
          rows={shown.slice(0, limit)}
          exportRows={shown}
          exportName="Upload queue"
          rowKey={(r) => r.id}
          onRowClick={editMode ? toggle : undefined}
          rowClassName={(r) => (pending[markKey(r)] ? "bg-accent/10" : undefined)}
          empty={queue.length ? "Nothing matches these filters" : "Nothing is waiting for upload"}
        />
        {shown.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
          >
            Show {Math.min(PAGE, shown.length - limit)} more
          </button>
        )}
      </Panel>
    </div>
  );
}

function columns(
  editMode: boolean,
  pending: Record<string, unknown>,
  toggle: (r: TrackerRecord) => void,
  today: string,
): Column<TrackerRecord>[] {
  const cols: Column<TrackerRecord>[] = [
    {
      header: "Date",
      exportValue: (r) => r.date,
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.date ? formatShort(r.date, true) : "—"}
          {r.date && <span className="block text-xs text-fg-subtle">{daysBetween(r.date, today)}d ago</span>}
        </span>
      ),
    },
    {
      header: "Permit",
      cell: (r) =>
        r.permitId && r.permitKey ? (
          <Link to={permitPath(r.permitId)} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:text-accent">
            {r.permitId}
          </Link>
        ) : (
          <span className="text-fg-muted">{r.permitId ?? "—"}</span>
        ),
    },
    { header: "OPCO", cell: (r) => r.opco ?? "—", className: "whitespace-nowrap" },
    { header: "Team", cell: (r) => (r.partner ? `${r.tech} + ${r.partner}` : (r.tech ?? "—")), className: "whitespace-nowrap" },
    { header: "Task", cell: (r) => r.task ?? "—", className: "whitespace-nowrap" },
    { header: "Poles", cell: (r) => formatNumber(r.poles), numeric: true },
    { header: "Row", cell: (r) => <span className="whitespace-nowrap text-fg-subtle">{rowLabel(r)}</span>, numeric: true },
  ];
  if (!editMode) return cols;
  return [
    {
      header: "Uploaded",
      noExport: true,
      cell: (r) => (
        <input
          type="checkbox"
          checked={!!pending[markKey(r)]}
          onChange={() => toggle(r)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Mark row ${r.excelRow} uploaded`}
          className={cn("size-4 cursor-pointer accent-[var(--color-accent)]")}
        />
      ),
    },
    ...cols,
  ];
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded border border-line bg-canvas px-2 text-sm text-fg focus:border-accent">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function hitchOptions(dataset: Dataset, queue: TrackerRecord[]) {
  const counts = new Map<number, number>();
  for (const r of queue) if (r.hitchId !== null) counts.set(r.hitchId, (counts.get(r.hitchId) ?? 0) + 1);
  return [
    { value: "all", label: "All hitches" },
    ...[...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([id, n]) => ({ value: String(id), label: `${hitchRange(dataset.hitches[id]!)} (${n})` })),
  ];
}

function opcoOptions(queue: TrackerRecord[]) {
  const opcos = new Map<string, number>();
  const umbrellas = new Map<string, number>();
  for (const r of queue) {
    if (r.opco) opcos.set(r.opco, (opcos.get(r.opco) ?? 0) + 1);
    if (r.umbrella) umbrellas.set(r.umbrella, (umbrellas.get(r.umbrella) ?? 0) + 1);
  }
  return [
    { value: "all", label: "All OPCOs" },
    ...[...umbrellas.entries()].sort().map(([u, n]) => ({ value: `u:${u}`, label: `${u} umbrella (${n})` })),
    ...[...opcos.entries()].sort().map(([o, n]) => ({ value: o, label: `${o} (${n})` })),
  ];
}
