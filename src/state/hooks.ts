import { useEffect, useMemo } from "react";
import { localToday } from "@/data/dates";
import { HitchIndex, hitchStatus, type HitchStatus } from "@/data/hitches";
import { CHANGE_CHECK_MS, useTracker } from "./tracker";

/** Starts the tracker connection and checks for saves every 30 s while the page is visible. */
export function useTrackerLifecycle() {
  const start = useTracker((s) => s.start);
  const checkForChanges = useTracker((s) => s.checkForChanges);

  useEffect(() => {
    void start();
  }, [start]);

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
