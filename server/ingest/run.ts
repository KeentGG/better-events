import type { Db } from "../db/client";
import { runFetcher } from "./fetchers";
import { pruneRuns } from "./runs";

/**
 * One ingestion pass: the weather, then the classifier over posts people sent in.
 * Started by the Node timer (./scheduler.ts), the Worker cron (server/worker.ts) or `npm run ingest` (./cli.ts);
 * the caller owns the database connection. Each fetcher is logged to `ingest_runs` (see ./runs.ts), and a
 * failed fetcher does not block the others.
 */
export async function runIngest(db: Db) {
  const weather = await runFetcher(db, "open-meteo");
  const classified = await runFetcher(db, "classifier");

  // Housekeeping, not a fetcher: a failed prune is logged and never affects the pass.
  await pruneRuns(db).catch((err) => console.error("ingest_runs prune failed", err));

  return { weather: weather !== null, classified: classified ?? 0 };
}
