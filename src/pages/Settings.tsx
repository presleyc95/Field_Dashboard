import { FolderOpen, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/Button";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { formatShort } from "@/data/dates";
import { formatInt, formatTime, hitchRange } from "@/lib/format";
import { useTracker } from "@/state/tracker";

export function Settings() {
  const { phase, folder, fileName, fileModified, loadedAt, loadMs, dataset, refreshing, error } = useTracker();
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
              <Field label="Workbook" value={fileName ?? "—"} />
              <Field label="File last saved" value={fileModified ? formatTime(fileModified) : "—"} />
              <Field
                label="Loaded"
                value={loadedAt ? `${formatTime(loadedAt)}${loadMs ? ` (${(loadMs / 1000).toFixed(1)} s)` : ""}` : "—"}
              />
            </dl>
            {error && <p className="text-xs text-negative">{error}</p>}
            <p className="text-xs text-fg-subtle">
              The dashboard checks the workbook every 30 seconds and reloads when it's saved, whether by you or
              through OneDrive.
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
