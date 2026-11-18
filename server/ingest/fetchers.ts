import { lt } from "drizzle-orm";
import type { FetcherKey } from "../control/config";
import type { Db } from "../db/client";
import { weatherSnapshots } from "../db/schema";
import { classifyPending } from "./publish";
import { logRun } from "./runs";
import { fetchWeather } from "./weather";

/** What each fetcher does in one run, and how many posts (or snapshots) came in. */
const FETCHER_RUNS: Record<FetcherKey, (db: Db) => Promise<{ postsIn: number; result: number }>> = {
  "open-meteo": async (db) => {
    const data = await fetchWeather();
    await db.insert(weatherSnapshots).values({ provider: "open-meteo", data });
    // Only the latest is ever read, and each carries a week of hourly forecast, so old ones go.
    await db.delete(weatherSnapshots).where(lt(weatherSnapshots.fetchedAt, new Date(Date.now() - 2 * 86_400_000)));
    return { postsIn: 1, result: 1 };
  },
  classifier: async (db) => {
    const n = await classifyPending(db);
    return { postsIn: n, result: n };
  },
};

/** Runs one fetcher now and logs it to `ingest_runs`. Null when the run failed. The ingest pass and retry both use it. */
export function runFetcher(db: Db, fetcher: FetcherKey) {
  return logRun(db, fetcher, null, () => FETCHER_RUNS[fetcher](db));
}
