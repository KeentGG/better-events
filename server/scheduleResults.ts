import type { ResultRow, ResultStage, ScheduleEvent } from "../src/lib/types";

export interface VersionRow {
  eventId: string | null;
  contest: string;
  stage: string;
  rows: ResultRow[];
  expectedAt: Date | null;
  createdAt: Date;
}

/**
 * What the schedule shows of each event's results, from its versions (any order): the newest posted
 * version as `results`, and `resultsExpectedAt` when the newest version overall is a placeholder.
 */
export function scheduleResults(versions: VersionRow[]) {
  const byEvent = new Map<string, VersionRow[]>();
  for (const v of versions) if (v.eventId) byEvent.set(v.eventId, [...(byEvent.get(v.eventId) ?? []), v]);
  const out = new Map<string, Pick<ScheduleEvent, "results" | "resultsExpectedAt">>();
  for (const [id, list] of byEvent) {
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const posted = list.find((v) => v.stage !== "pending");
    out.set(id, {
      ...(posted && { results: { contest: posted.contest, stage: posted.stage as ResultStage, rows: posted.rows, postedAt: posted.createdAt.toISOString() } }),
      ...(list[0].stage === "pending" && { resultsExpectedAt: list[0].expectedAt?.toISOString() ?? null }),
    });
  }
  return out;
}

/** Ids of events whose newest version is recent enough to keep a finished event on the schedule. */
export function recentResultEvents(versions: VersionRow[], since: Date) {
  const newest = new Map<string, Date>();
  for (const v of versions) if (v.eventId && v.createdAt > (newest.get(v.eventId) ?? new Date(0))) newest.set(v.eventId, v.createdAt);
  return [...newest].filter(([, at]) => at >= since).map(([id]) => id);
}
