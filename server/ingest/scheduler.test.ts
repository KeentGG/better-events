import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingestDue, startIngestTimer, type IngestTimer } from "./scheduler";

const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("ingestDue", () => {
  it("is due when a fetcher has never run", () => {
    expect(ingestDue({ "open-meteo": ago(1) }, NOW)).toBe(true);
  });

  it("is not due right after a pass", () => {
    expect(ingestDue({ "open-meteo": ago(2), classifier: ago(2) }, NOW)).toBe(false);
  });

  it("is due once any fetcher last ran about an interval ago, even a few seconds early", () => {
    expect(ingestDue({ "open-meteo": ago(14.9), classifier: ago(2) }, NOW)).toBe(true);
  });
});

describe("startIngestTimer", () => {
  let timer: IngestTimer | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    timer?.stop();
    vi.useRealTimers();
  });

  it("checks straight away and then every tick, running only when due", async () => {
    const run = vi.fn(async () => {});
    const due = [false, true];
    timer = startIngestTimer({ run, isDue: async () => due.shift() ?? false, everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never starts a pass while one is still running", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    timer = startIngestTimer({ run, isDue: async () => true, everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps going after a failed pass", async () => {
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);
    timer = startIngestTimer({ run, isDue: async () => true, everyMs: 1000, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "db down" }));
    expect(run).toHaveBeenCalledTimes(2);
  });
});
