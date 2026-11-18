import { eq, lt } from "drizzle-orm";
import type { FetcherKey } from "../control/config";
import type { Db } from "../db/client";
import { ingestRuns } from "../db/schema";

/**
 * Runs one fetcher and logs it to `ingest_runs`. `fn` returns how many posts (or snapshots) came in.
 * Errors are recorded and swallowed so one broken fetcher does not stop the rest of the ingest pass;
 * the result is `null` when the run failed.
 */
export async function logRun<T>(
  db: Db,
  fetcher: FetcherKey,
  sourceId: string | null,
  fn: () => Promise<{ postsIn: number; result: T }>,
): Promise<T | null> {
  const [run] = await db.insert(ingestRuns).values({ fetcher, sourceId }).returning({ id: ingestRuns.id });
  try {
    const { postsIn, result } = await fn();
    await db.update(ingestRuns).set({ status: "ok", finishedAt: new Date(), postsIn }).where(eq(ingestRuns.id, run.id));
    return result;
  } catch (err) {
    console.error(`${fetcher} run failed`, err);
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await db.update(ingestRuns).set({ status: "error", finishedAt: new Date(), error }).where(eq(ingestRuns.id, run.id));
    return null;
  }
}

/** How long `ingest_runs` rows are kept. Health reads at most the last 10 runs and the last 24h, so a week is plenty. */
export const RUN_RETENTION_DAYS = 7;

/** Deletes runs older than the retention window, so the board's queries stay fast over the festival. */
export async function pruneRuns(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - RUN_RETENTION_DAYS * 86_400_000);
  const deleted = await db.delete(ingestRuns).where(lt(ingestRuns.startedAt, cutoff)).returning({ id: ingestRuns.id });
  return deleted.length;
}
