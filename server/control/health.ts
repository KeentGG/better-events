import type { ControlFetcherStatus } from "../../src/lib/types";
import { FAILED_RUNS_FOR_RED } from "./config";

const MINUTE = 60_000;

/** A stream with no run for this long is idle (switched off, e.g. a removed token), not broken. */
export const IDLE_AFTER_MINUTES = 24 * 60;

export interface Run {
  status: "running" | "ok" | "error";
  startedAt: Date;
  error: string | null;
}

export type StreamHealth = Pick<ControlFetcherStatus, "health" | "problem" | "lastRunAt" | "lastError" | "failedInRow">;

/**
 * Health of one fetcher stream from its newest runs, newest first (docs/MISSION_CONTROL.md §4.1).
 * Kept free of database access so the rules can be unit tested.
 */
export function streamHealth(runs: Run[], intervalMinutes: number, now: Date): StreamHealth {
  if (!runs.length) return { health: "idle", problem: null, lastRunAt: null, lastError: null, failedInRow: 0 };

  const interval = intervalMinutes * MINUTE;
  // A run still "running" after a full interval died without finishing (worker killed, timeout).
  const outcomes = runs.map((r) => (r.status === "running" && now.getTime() - r.startedAt.getTime() > interval ? "error" : r.status));
  const finished = outcomes.filter((o) => o !== "running");
  const firstOk = finished.indexOf("ok");
  const failedInRow = firstOk === -1 ? finished.length : firstOk;

  // Only the error behind the current failing streak; a recovered stream shows none.
  const failing = failedInRow > 0 ? runs[outcomes.indexOf("error")] : undefined;
  const status = {
    lastRunAt: runs[0].startedAt.toISOString(),
    lastError: failing ? (failing.error ?? "did not finish") : null,
    failedInRow,
  };

  const sinceRun = now.getTime() - runs[0].startedAt.getTime();
  if (sinceRun > IDLE_AFTER_MINUTES * MINUTE) return { ...status, health: "idle", problem: null };
  if (failedInRow >= FAILED_RUNS_FOR_RED) return { ...status, health: "red", problem: `${failedInRow} failed runs in a row` };
  if (sinceRun > 2 * interval) {
    const problem = `no run for ${Math.round(sinceRun / MINUTE)}m (expected every ${intervalMinutes}m)`;
    return { ...status, health: "red", problem };
  }
  return { ...status, health: "green", problem: null };
}
