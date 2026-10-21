import { AlertTriangle, RefreshCw } from "lucide-react";
import { Link, useRouteError } from "react-router";

/** Shown instead of a blank page when a page crashes; the details help when reporting it. */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="max-w-lg rounded-lg border border-line bg-panel p-6">
        <div className="flex items-center gap-2 text-lg font-bold text-negative">
          <AlertTriangle size={20} /> Something went wrong on this page
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          The rest of the dashboard should still work. Reloading usually fixes it; if it keeps happening, send this
          message along with what you clicked:
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-line bg-canvas p-3 text-xs text-fg-soft">{message}</pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wider text-accent-fg hover:bg-accent-hover"
          >
            <RefreshCw size={16} /> Reload
          </button>
          <Link
            to="/"
            reloadDocument
            className="rounded border border-line px-4 py-2 text-sm font-medium uppercase tracking-wider text-fg-soft hover:border-accent hover:text-accent"
          >
            Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
