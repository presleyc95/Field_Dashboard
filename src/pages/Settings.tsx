import { FolderOpen, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/Button";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import type { SourceInfo } from "@/data/types";
import { formatInt, formatTime, hitchRange } from "@/lib/format";
import { type LoadedFile, useTracker } from "@/state/tracker";

export function Settings() {
  const { phase, folder, files, loadedAt, loadMs, dataset, refreshing, error } = useTracker();
  const { connectFolder, reload, disconnect } = useTracker.getState();

  return (
    <div className="space-y-4">
      <Panel title="Tracker connection">
        {phase !== "ready" ? (
          <ConnectionPrompt />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Folder" value={folder?.name ?? "—"} />
              <Field
                label="Loaded"
                value={loadedAt ? `${formatTime(loadedAt)}${loadMs ? ` (${(loadMs / 1000).toFixed(1)} s)` : ""}` : "—"}
              />
            </dl>

            <div>
              <div className="label-caps mb-2">Workbooks</div>
              <Table
                columns={workbookColumns(files)}
                rows={dataset?.sources ?? []}
                rowKey={(s) => s.name}
              />
            </div>

            {error && <p className="text-xs text-negative">{error}</p>}
            <p className="text-xs text-fg-subtle">
              Every workbook in the folder named like "TSG Field Tracker - Master 2026.xlsx" is loaded and combined into
              one history; the newest year is the current one. When next year's tracker is added to the folder, it's picked
              up on its own. Past years are read once and kept in this browser, so only the current year is read on each
              load. The dashboard checks the workbooks every 30 seconds and reloads when one is saved.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void reload()} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} /> Reload now
              </Button>
              <Button onClick={() => void connectFolder()}>
                <FolderOpen size={16} /> Change folder
              </Button>
              <Button onClick={() => void disconnect()}>
                <Unplug size={16} /> Disconnect
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {dataset && (
        <Panel title="What was loaded">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
            <Field label="Rows" value={formatInt(dataset.records.length)} />
            <Field label="Permits" value={formatInt(dataset.permits.length)} />
            <Field label="People" value={formatInt(dataset.people.length)} />
            <Field label="OPCOs" value={formatInt(dataset.opcos.length)} />
            <Field label="Data through" value={dataset.dataThrough ? formatShort(dataset.dataThrough, true) : "—"} />
            <Field
              label="Hitches listed"
              value={`${dataset.hitches.filter((h) => !h.inferred).length} (to ${formatShort(
                dataset.hitches.filter((h) => !h.inferred).at(-1)?.end ?? dataset.today,
                true,
              )})`}
            />
            <Field
              label="Continued pattern"
              value={(() => {
                const inferred = dataset.hitches.filter((h) => h.inferred);
                return inferred.length ? `${inferred.length} more, to ${hitchRange(inferred.at(-1)!)}` : "Not needed";
              })()}
            />
            <Field
              label="Clean-up"
              value={`${formatInt(dataset.issues.filter((i) => i.kind === "fixed").length)} fixed · ${formatInt(
                dataset.issues.filter((i) => i.kind === "flag").length,
              )} flagged`}
            />
          </dl>
        </Panel>
      )}
    </div>
  );
}

function workbookColumns(files: LoadedFile[]): Column<SourceInfo>[] {
  const fileFor = (name: string) => files.find((f) => f.name === name);
  return [
    {
      header: "Workbook",
      cell: (s) => (
        <span className="whitespace-nowrap text-fg">
          {s.name}
          {s.current && (
            <span className="ml-2 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
              Current
            </span>
          )}
        </span>
      ),
    },
    { header: "Rows", cell: (s) => formatInt(s.rows), numeric: true },
    {
      header: "Dates",
      cell: (s) => (s.firstDate && s.lastDate ? `${formatShort(s.firstDate, true)} – ${formatShort(s.lastDate, true)}` : "—"),
      className: "whitespace-nowrap",
    },
    {
      header: "Overlap",
      cell: (s) => (s.replaced ? <span title="Rows also in a newer workbook; the newer copy is used">{formatInt(s.replaced)} replaced</span> : "—"),
      className: "whitespace-nowrap text-xs",
    },
    { header: "Last saved", cell: (s) => { const f = fileFor(s.name); return f ? formatTime(f.lastModified) : "—"; }, className: "whitespace-nowrap" },
    {
      header: "Read",
      cell: (s) => (s.current ? "Every load" : fileFor(s.name)?.cached ? "From cache" : "Parsed, now cached"),
      className: "whitespace-nowrap text-xs text-fg-subtle",
    },
  ];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-1 truncate text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}
