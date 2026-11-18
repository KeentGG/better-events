import type { ReactNode } from "react";
import { stageNames, rowChanged } from "../lib/results";
import { dayTime } from "../lib/time";
import type { ResultRow, ResultStage } from "../lib/types";
import { Badge, cn } from "../ui";

/** The stage as a small tag; a placeholder says when the results are due instead. */
export function StageTag({ stage, expectedAt }: { stage: ResultStage; expectedAt?: string | null }) {
  if (stage === "pending") return <Badge tone="warn">{expectedAt ? `Expected ${dayTime(expectedAt)}` : "Results pending"}</Badge>;
  return <Badge tone={stage === "corrected" || stage === "revised" ? "warn" : stage === "final" ? "ok" : "neutral"}>{stageNames[stage]}</Badge>;
}

/** Placed results: label, name and prize in columns that wrap on a narrow phone. A changed row shows the old name struck through. */
export function ResultsList({ rows, className }: { rows: ResultRow[]; className?: string }): ReactNode {
  if (!rows.length) return null;
  return (
    <ol className={cn("divide-y divide-line text-sm", className)}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="grid grid-cols-[minmax(3.25rem,5.5rem)_minmax(0,1fr)_auto] items-baseline gap-x-2.5 py-1 first:pt-0 last:pb-0">
          <span className="text-xs font-medium text-ink-subtle">{r.label}</span>
          <span className="min-w-0 break-words text-ink">
            {rowChanged(r) && (
              <>
                <span className="sr-only">Changed, was </span>
                <s className="mr-1.5 text-ink-subtle">{r.was}</s>
              </>
            )}
            <span className="font-medium">{r.name}</span>
            {rowChanged(r) && <span className="ml-1.5 text-xs font-medium text-warn-ink">Changed</span>}
          </span>
          <span className="text-right text-xs text-ink-muted tabular-nums">{r.prize}</span>
        </li>
      ))}
    </ol>
  );
}
