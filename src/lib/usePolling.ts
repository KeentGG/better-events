import { useEffect, useState, useSyncExternalStore } from "react";

/** A load that fell back to something else (bundled samples) says so with `live: false`. */
const isLive = (r: unknown) => !(typeof r === "object" && r !== null && "live" in r && r.live === false);

/**
 * What a poll leaves on the page. A failed load never reaches here (it keeps the last value), and a
 * fallback never replaces a live one.
 */
export function keep<R>(prev: R | null, next: R): R {
  return prev !== null && isLive(prev) && !isLive(next) ? prev : next;
}

const RETRY_MS = 10_000;

// Instances whose most recent load failed, and whoever is listening for that.
const failing = new Set<object>();
const listeners = new Set<() => void>();

function mark(token: object, bad: boolean) {
  const before = failing.size > 0;
  if (bad) failing.add(token);
  else failing.delete(token);
  if (before !== failing.size > 0) listeners.forEach((l) => l());
}

/** True while at least one mounted poll's latest load failed. */
export function useConnectionLost(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => failing.size > 0,
  );
}

/**
 * Loads data now and again every `ms` while the tab is visible. Null until the first load.
 * Once something real has loaded, a later load that fails keeps it: a phone dropping signal in a
 * crowd must not swap the page for the fallback. A failed load is retried sooner than `ms`.
 */
export function usePolling<R>(load: () => Promise<R>, ms = 60_000) {
  const [state, setState] = useState<R | null>(null);
  const [token] = useState(() => ({}));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };
    const tick = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      load().then(
        (next) => {
          if (cancelled) return;
          setState((prev) => keep(prev, next));
          mark(token, false);
          schedule(ms);
        },
        () => {
          if (cancelled) return;
          mark(token, true);
          schedule(RETRY_MS);
        },
      );
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
      mark(token, false);
    };
  }, [load, ms, token]);

  return state;
}
