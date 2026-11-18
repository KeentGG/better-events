import { sql } from "drizzle-orm";
import { FETCHERS, INGEST_INTERVAL_MINUTES, type FetcherKey } from "../control/config";
import type { Db } from "../db/client";

const MINUTE = 60_000;

/**
 * A pass counts as due this much before a full interval has passed, so a cron that fires a few
 * milliseconds early, or a timer that checks once a minute, never skips a beat and leaves a gap.
 */
const DUE_SLACK_MINUTES = 1;

/**
 * Whether an ingest pass is due: some fetcher has never run, or last ran about an interval ago.
 * Checking the database rather than a local clock means a restarted dev server does not refetch, and
 * the Node timer and the Worker cron never both run a pass against the same database.
 */
export function ingestDue(lastRunAt: Partial<Record<FetcherKey, Date>>, now: Date) {
  const dueAfter = (INGEST_INTERVAL_MINUTES - DUE_SLACK_MINUTES) * MINUTE;
  return (Object.keys(FETCHERS) as FetcherKey[]).some((f) => {
    const last = lastRunAt[f];
    return !last || now.getTime() - last.getTime() >= dueAfter;
  });
}

export async function isIngestDue(db: Db, now = new Date()) {
  const rows = await db.execute<{ fetcher: string; last: number }>(
    sql`select fetcher, (extract(epoch from max(started_at)) * 1000)::float8 as last from ingest_runs group by fetcher`,
  );
  return ingestDue(Object.fromEntries(rows.map((r) => [r.fetcher, new Date(r.last)])), now);
}

export interface IngestTimer {
  stop: () => void;
}

/**
 * Checks every `everyMs` whether a pass is due and runs it. A check never starts while a pass is still
 * running, and every error is caught and logged, since an unhandled rejection would stop the server.
 */
export function startIngestTimer(opts: {
  run: () => Promise<unknown>;
  isDue: () => Promise<boolean>;
  everyMs: number;
  onError?: (err: unknown) => void;
}): IngestTimer {
  const onError = opts.onError ?? ((err) => console.error("ingest pass failed", err));
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (await opts.isDue()) await opts.run();
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), opts.everyMs);
  // The timer alone should never keep a process alive.
  handle.unref?.();
  return { stop: () => clearInterval(handle) };
}
