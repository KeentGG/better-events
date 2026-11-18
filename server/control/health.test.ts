import { describe, expect, it } from "vitest";
import { streamHealth, type Run } from "./health";

const NOW = new Date("2026-10-20T12:00:00Z");
const INTERVAL = 15;
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
/** Runs newest first, as `(minutes ago, status, error?)`. */
const runs = (...list: Array<[number, Run["status"], string?]>): Run[] =>
  list.map(([m, status, error]) => ({ status, startedAt: ago(m), error: error ?? null }));

describe("streamHealth", () => {
  it("is idle with no runs", () => {
    expect(streamHealth([], INTERVAL, NOW)).toMatchObject({ health: "idle", lastRunAt: null, failedInRow: 0 });
  });

  it("is green after a recent ok run", () => {
    expect(streamHealth(runs([5, "ok"]), INTERVAL, NOW)).toMatchObject({ health: "green", problem: null, lastError: null });
  });

  it("is red after 3 failed runs in a row, reporting the newest error", () => {
    const h = streamHealth(runs([1, "error", "newest"], [15, "error", "mid"], [30, "error", "old"], [45, "ok"]), INTERVAL, NOW);
    expect(h).toMatchObject({ health: "red", failedInRow: 3, lastError: "newest", problem: "3 failed runs in a row" });
  });

  it("stays green on 2 failures but shows the error", () => {
    expect(streamHealth(runs([5, "error", "b"], [20, "error", "a"]), INTERVAL, NOW)).toMatchObject({ health: "green", failedInRow: 2, lastError: "b" });
  });

  it("drops the old error once a run succeeds", () => {
    const h = streamHealth(runs([5, "ok"], [20, "error"], [30, "error"], [40, "error"]), INTERVAL, NOW);
    expect(h).toMatchObject({ health: "green", failedInRow: 0, lastError: null });
  });

  it("is red on a missed heartbeat (no run within 2x the interval)", () => {
    expect(streamHealth(runs([40, "ok"]), INTERVAL, NOW)).toMatchObject({ health: "red", problem: "no run for 40m (expected every 15m)" });
    expect(streamHealth(runs([25, "ok"]), INTERVAL, NOW).health).toBe("green");
  });

  it("is idle, not red, when silent for over a day", () => {
    const h = streamHealth(runs([25 * 60, "error"], [25.5 * 60, "error"], [26 * 60, "error"]), INTERVAL, NOW);
    expect(h).toMatchObject({ health: "idle", problem: null });
  });

  it("counts a run stuck in running past the interval as a failure", () => {
    const h = streamHealth(runs([20, "running"], [35, "error", "e2"], [50, "error", "e1"]), INTERVAL, NOW);
    expect(h).toMatchObject({ health: "red", failedInRow: 3, lastError: "did not finish" });
  });

  it("ignores a run still in flight", () => {
    const h = streamHealth(runs([2, "running"], [35, "error", "e2"], [50, "error", "e1"]), INTERVAL, NOW);
    expect(h).toMatchObject({ health: "green", failedInRow: 2, lastError: "e2", lastRunAt: ago(2).toISOString() });
  });
});
