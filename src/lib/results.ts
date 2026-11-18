import type { ResultRow, ResultStage } from "./types";

export const stageNames: Record<ResultStage, string> = { pending: "Pending", standings: "Standings", final: "Final", corrected: "Corrected", revised: "Revised" };

/** The first rows of a results list, and how many are left behind. */
export function topRows(rows: ResultRow[], n = 3) {
  return { shown: rows.slice(0, n), more: Math.max(0, rows.length - n) };
}

/** Whether a row's name was changed by a correction or revision. */
export const rowChanged = (r: ResultRow) => !!r.was && r.was !== r.name;
