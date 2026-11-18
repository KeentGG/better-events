import { phaseOf } from "./eventPhase";

/**
 * Splits a schedule's days (as `[dayKey, events]` pairs, in date order) into the ones folded behind
 * "earlier days" and the rest. A day before `today` stays out of the fold while any of its events is live,
 * so a session that runs past midnight is still shown where the home page shows it.
 */
export function splitDays<T extends Parameters<typeof phaseOf>[0]>(days: [string, T[]][], today: string, now: number) {
  const past: T[][] = [];
  const upcoming: T[][] = [];
  for (const [k, list] of days) {
    const over = k < today && !list.some((e) => phaseOf(e, now) === "live");
    (over ? past : upcoming).push(list);
  }
  return { past, upcoming };
}
