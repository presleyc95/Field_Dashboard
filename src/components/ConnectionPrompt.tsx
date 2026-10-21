import { FolderOpen, KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTracker } from "@/state/tracker";
import { Button } from "./Button";

/**
 * What the viewer needs to do to get data showing: pick the folder, allow access again, or retry
 * after an error. Renders nothing once data is loaded.
 */
export function ConnectionPrompt() {
  const { phase, folder, fileName, error } = useTracker();
  const { connectFolder, allowAccess, reload } = useTracker.getState();

  switch (phase) {
    case "starting":
      return <Message title="Starting…" />;

    case "unsupported":
      return (
        <Message
          title="Open this dashboard in Chrome or Edge"
          detail="It reads the tracker straight from your synced folder, which only Chrome and Edge on a computer allow."
        />
      );

    case "needs-folder":
      return (
        <Message
          title="Connect the tracker"
          detail="Pick the OneDrive/SharePoint folder that holds the TSG Field Tracker workbook. The data stays on this computer."
          action={
            <Button variant="primary" onClick={() => void connectFolder()}>
              <FolderOpen size={16} /> Connect folder
            </Button>
          }
        />
      );

    case "needs-permission":
      return (
        <Message
          title="Allow access to load the tracker"
          detail={`The browser asks once per session before reading "${folder?.name ?? "the tracker folder"}".`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void allowAccess()}>
                <KeyRound size={16} /> Allow access
              </Button>
              <Button onClick={() => void connectFolder()}>Change folder</Button>
            </div>
          }
        />
      );

    case "loading":
      return (
        <Message
          title={
            <span className="inline-flex items-center gap-2">
              <LoaderCircle size={18} className="animate-spin text-accent" /> Loading tracker…
            </span>
          }
          detail={fileName ?? undefined}
        />
      );

    case "error":
      return (
        <Message
          title="Couldn't load the tracker"
          detail={error ?? undefined}
          tone="error"
          action={
            <div className="flex flex-wrap gap-2">
              {fileName && (
                <Button variant="primary" onClick={() => void reload()}>
                  <RefreshCw size={16} /> Try again
                </Button>
              )}
              <Button onClick={() => void connectFolder()}>
                <FolderOpen size={16} /> Choose folder
              </Button>
            </div>
          }
        />
      );

    case "ready":
      return null;
  }
}

type MessageProps = {
  title: ReactNode;
  detail?: string;
  action?: ReactNode;
  tone?: "error";
};

function Message({ title, detail, action, tone }: MessageProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className={tone === "error" ? "text-lg font-bold text-negative" : "text-lg font-bold text-fg"}>{title}</div>
        {detail && <div className="mt-1 max-w-2xl text-xs text-fg-muted">{detail}</div>}
      </div>
      {action}
    </div>
  );
}
