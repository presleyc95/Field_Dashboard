import { useEffect, useMemo } from "react";
import { localToday } from "@/data/dates";
import { HitchIndex, hitchStatus, type HitchStatus } from "@/data/hitches";
import { CHANGE_CHECK_MS, useTracker } from "./tracker";
import { useUploads } from "./uploads";

/** Starts the tracker connection and checks for saves every 30 s while the page is visible. */
export function useTrackerLifecycle() {
  const start = useTracker((s) => s.start);
  const checkForChanges = useTracker((s) => s.checkForChanges);

  useEffect(() => {
    void start();
  }, [start]);

  // Whether this session may save to the tracker folder (edit mode needs it).
  const ready = useTracker((s) => s.phase === "ready");
  useEffect(() => {
    if (ready) void useUploads.getState().refreshAccess();
  }, [ready]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void checkForChanges();
    };
    const timer = window.setInterval(check, CHANGE_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [checkForChanges]);
}

/** Where today falls in the hitch schedule, or null before data loads. */
export function useHitchStatus(): HitchStatus | null {
  const hitches = useTracker((s) => s.dataset?.hitches);
  return useMemo(() => (hitches ? hitchStatus(new HitchIndex(hitches), localToday()) : null), [hitches]);
}
