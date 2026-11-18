import { dayTime } from "../src/lib/time";
import type { ResultRow, ResultStage } from "../src/lib/types";

export const ordinal = (i: number) => ["1st", "2nd", "3rd"][i] ?? `${i + 1}th`;

/** The latest version of this contest, when one has already been posted. */
export interface PreviousResults {
  contestId: string;
  stage: ResultStage;
  rows: ResultRow[];
}

/** What the desk sent. A string place keeps the ordinal. An object may name its own label and prize. */
export interface ResultsInput {
  contest: string;
  places: Array<string | { label?: string; name: string; prize?: string }>;
  pendingUntil?: string;
  note?: string;
  /** Left out, it follows the previous version: final the first time, corrected after a final. */
  stage?: "standings" | "final" | "corrected" | "revised";
}

export type ResultsPlan =
  | { error: string }
  | {
      stage: ResultStage;
      rows: ResultRow[];
      title: string;
      body: string;
      markDone: boolean;
      /** The contest these results belong to. Null on the first version, which uses its own id. */
      contestId: string | null;
    };

const named = (places: ResultsInput["places"]): ResultRow[] => {
  const rows: { label: string; name: string; prize?: string }[] = [];
  for (const place of places) {
    if (typeof place === "string") {
      const name = place.trim();
      if (name) rows.push({ label: "", name });
    } else {
      const name = place.name.trim();
      if (name) rows.push({ label: place.label?.trim() ?? "", name, prize: place.prize?.trim() || undefined });
    }
  }
  return rows.map(({ prize, ...row }, i) => ({ label: row.label || ordinal(i), name: row.name, ...(prize && { prize }) }));
};

/** The stage a post gets when the desk doesn't say. */
export const defaultStage = (previous: Pick<PreviousResults, "stage"> | null): "final" | "corrected" =>
  previous && !["pending", "standings"].includes(previous.stage) ? "corrected" : "final";

const titles = { standings: "Standings", final: "Winners", corrected: "Results corrected", revised: "Results revised" } as const;

/**
 * What one winners post becomes. A time and no places is a placeholder. Anything with places is a stage
 * of the results: standings, final, or (after a final) a correction or a revision.
 */
export function planResults(previous: PreviousResults | null, input: ResultsInput, now: Date): ResultsPlan {
  const contestId = previous?.contestId ?? null;
  const rows = named(input.places);
  if (!rows.length && input.pendingUntil) {
    return {
      stage: "pending",
      rows: [],
      title: `Results pending: ${input.contest}`,
      body: `Results expected ${dayTime(input.pendingUntil, now)}`,
      markDone: false,
      contestId,
    };
  }
  if (!rows.length) return { error: "needs at least one winner or a pending time" };
  const stage = input.stage ?? defaultStage(previous);
  const changing = stage === "corrected" || stage === "revised";
  if (changing && !previous?.rows.length) return { error: "There are no earlier results to change" };

  let changed: string[] = [];
  let finalRows = rows;
  if (changing && previous) {
    const before = new Map(previous.rows.map((r) => [r.label, r]));
    finalRows = rows.map((r) => {
      const old = before.get(r.label);
      return old && old.name !== r.name ? { ...r, was: old.name } : r;
    });
    const kept = new Set(rows.map((r) => r.label));
    changed = [
      ...rows.filter((r) => {
        const old = before.get(r.label);
        return !old || old.name !== r.name || (old.prize ?? "") !== (r.prize ?? "");
      }).map((r) => r.label),
      ...previous.rows.filter((r) => !kept.has(r.label)).map((r) => `${r.label} removed`),
    ];
    if (!changed.length) return { error: "Nothing changed from the results already posted" };
  }

  const title =
    stage === "final" ? `${previous && ["pending", "standings"].includes(previous.stage) ? "Results are in" : "Winners"}: ${input.contest}` : `${titles[stage]}: ${input.contest}`;
  const lines = finalRows
    .map((r) => `${r.label}: ${r.name}${r.prize ? ` · ${r.prize}` : ""}${r.was ? ` (was ${r.was})` : ""}`)
    .join("\n");
  const note = input.note?.trim();
  const head = changing ? `Changed: ${changed.join(", ")}\n` : "";
  return {
    stage,
    rows: finalRows,
    title,
    body: `${head}${lines}${note ? `\n\n${note}` : ""}`,
    markDone: stage !== "standings",
    contestId,
  };
}
