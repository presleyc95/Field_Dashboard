import { AlertTriangle, Check, LoaderCircle, Save, Trash2, X } from "lucide-react";
import { formatShort } from "@/data/dates";
import type { SaveStep } from "@/file/writeback";
import { BACKUP_DIR } from "@/file/writeback";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { useTracker } from "@/state/tracker";
import { markKey, useUploads } from "@/state/uploads";
import { Button } from "./Button";

const STEPS: { step: SaveStep; label: string }[] = [
  { step: "reading", label: "Reading the tracker as it is now" },
  { step: "checking", label: "Checking each row still matches" },
  { step: "backing-up", label: "Keeping a backup copy" },
  { step: "writing", label: "Saving the marked cells" },
  { step: "logging", label: "Adding to the save log" },
  { step: "confirming", label: "Confirming the cells say Yes" },
];

const SKIP_LABEL = { "not-found": "Row not found", changed: "Row changed", "already-uploaded": "Already marked" } as const;

/**
 * The pending-changes tray: a small bar at the bottom right while marks are waiting, which opens
 * the review-and-save dialog.
 */
export function UploadTray() {
  const fileName = useTracker((s) => s.fileName);
  const { editMode, pending, trayOpen, setTrayOpen, report, error, saving } = useUploads();
  const marks = Object.values(pending).filter((m) => m.source === fileName);
  const show = editMode && (marks.length > 0 || report || error);
  if (!show) return null;

  return (
    <>
      {!trayOpen && (
        <button
          type="button"
          onClick={() => setTrayOpen(true)}
          className="fixed right-6 bottom-6 z-40 flex items-center gap-3 rounded-lg border border-accent bg-panel px-4 py-3 text-sm shadow-2xl hover:bg-raised"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-accent font-bold text-accent-fg">{marks.length}</span>
          <span className="text-left">
            <span className="block font-medium text-fg">{marks.length === 1 ? "1 row" : `${formatInt(marks.length)} rows`} marked uploaded</span>
            <span className="block text-xs text-fg-muted">{saving ? "Saving…" : "Review and save"}</span>
          </span>
        </button>
      )}
      {trayOpen && <SaveDialog onClose={() => !saving && setTrayOpen(false)} />}
    </>
  );
}

function SaveDialog({ onClose }: { onClose: () => void }) {
  const fileName = useTracker((s) => s.fileName);
  const { pending, remove, clear, save, saving, report, error, dismissReport } = useUploads();
  const marks = Object.values(pending)
    .filter((m) => m.source === fileName)
    .sort((a, b) => a.excelRow - b.excelRow);
  const stepIndex = saving ? STEPS.findIndex((s) => s.step === saving) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save uploaded marks"
        className="flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-fg">Mark as uploaded to Katapult</h2>
          <button type="button" aria-label="Close" onClick={onClose} disabled={!!saving} className="text-fg-subtle hover:text-accent disabled:opacity-40">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {report && <ReportView />}
          {error && (
            <div className="mb-4 flex gap-2 rounded border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          {marks.length > 0 && (
            <>
              <p className="text-sm text-fg-muted">
                Saving sets <span className="text-fg">Uploaded to Katapult = Yes</span> on these {formatInt(marks.length)} rows of{" "}
                <span className="text-fg">{fileName}</span>, and changes nothing else in the workbook.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-fg-subtle">
                <li>· Close the tracker in Excel first; if it's open, the save is refused and nothing changes.</li>
                <li>· Each row is checked first (date, tech, permit); rows that moved or changed are skipped, never guessed.</li>
                <li>· A backup copy is kept in the "{BACKUP_DIR}" folder next to the tracker (last 10).</li>
              </ul>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-fg-muted">
                    <th className="py-2 pr-3 font-medium">Row</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Permit</th>
                    <th className="py-2 pr-3 font-medium">Team</th>
                    <th className="py-2 pr-3 font-medium">Task</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {marks.map((m) => (
                    <tr key={markKey(m)} className="border-b border-line-subtle">
                      <td className="py-1.5 pr-3 tabular-nums text-fg-subtle">{m.excelRow}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{m.date ? formatShort(m.date, true) : "—"}</td>
                      <td className="py-1.5 pr-3 text-fg">{m.permitId ?? "—"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-fg-muted">{m.partner ? `${m.tech} + ${m.partner}` : m.tech}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-fg-muted">{m.task}</td>
                      <td className="py-1.5 text-right">
                        <button type="button" aria-label={`Remove row ${m.excelRow}`} disabled={!!saving} onClick={() => remove(markKey(m))} className="text-fg-subtle hover:text-negative disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {saving && (
            <ol className="mt-4 space-y-1 text-sm">
              {STEPS.map((s, i) => (
                <li key={s.step} className={cn("flex items-center gap-2", i < stepIndex ? "text-positive" : i === stepIndex ? "text-fg" : "text-fg-subtle")}>
                  {i < stepIndex ? <Check size={14} /> : i === stepIndex ? <LoaderCircle size={14} className="animate-spin text-accent" /> : <span className="size-3.5" />}
                  {s.label}
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <div>
            {marks.length > 0 && !saving && (
              <button type="button" onClick={clear} className="text-xs uppercase tracking-wider text-fg-subtle hover:text-negative">
                Clear all marks
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {(report || error) && !saving && (
              <Button onClick={dismissReport}>Dismiss</Button>
            )}
            {marks.length > 0 && (
              <Button variant="primary" onClick={() => void save()} disabled={!!saving}>
                {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Saving…" : `Save ${formatInt(marks.length)} to the tracker`}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ReportView() {
  const report = useUploads((s) => s.report)!;
  const ok = report.applied.length > 0 && report.unconfirmed.length === 0;
  return (
    <div className={cn("mb-4 rounded border p-3 text-sm", ok ? "border-positive/40 bg-positive/10" : "border-warning/40 bg-warning/10")}>
      <div className={cn("flex items-center gap-2 font-medium", ok ? "text-positive" : "text-warning")}>
        {ok ? <Check size={16} /> : <AlertTriangle size={16} />}
        {report.applied.length
          ? `Saved ${formatInt(report.applied.length)} ${report.applied.length === 1 ? "row" : "rows"} to ${report.fileName}`
          : "Nothing was saved"}
      </div>
      {report.backupName && <div className="mt-1 text-xs text-fg-muted">Backup: {BACKUP_DIR}/{report.backupName}</div>}
      {report.changedSinceLoad && <div className="mt-1 text-xs text-fg-muted">The tracker had been saved since the dashboard loaded it; every row was re-checked against the new copy.</div>}
      {report.unconfirmed.length > 0 && (
        <div className="mt-2 text-xs text-negative">
          Rows {report.unconfirmed.join(", ")} didn't read Yes after saving. Check them in Excel; the backup has the file as it was.
        </div>
      )}
      {report.skipped.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {report.skipped.map((s) => (
            <li key={s.excelRow} className="text-fg-muted">
              <span className="text-fg">Row {s.excelRow}</span>: {SKIP_LABEL[s.reason]}. {s.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
