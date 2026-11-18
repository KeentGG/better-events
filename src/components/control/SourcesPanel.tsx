import { useCallback } from "react";
import { sampleControlSources } from "../../data/control";
import { loadControl, span } from "../../lib/control";
import type { ControlCollector, ControlFetcher } from "../../lib/types";
import { usePolling } from "../../lib/usePolling";
import { Skeleton, cn } from "../../ui";

/**
 * One row per fetcher and per team member, with a health dot and last-seen time (docs/MISSION_CONTROL.md §2.3).
 * A team member is active if they sent posts or wrote on the team desk in the last hour (§4.5).
 */
export function SourcesPanel({ token, version, onSignOut, className }: { token: string | undefined; version: number; onSignOut: () => void; className?: string }) {
  const load = useCallback(() => loadControl("/api/control/sources", token, sampleControlSources, onSignOut), [token, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const sources = usePolling(load, 30_000);
  const data = sources?.data;
  const now = data ? Date.parse(data.generatedAt) : 0;
  const team = data?.collectors.filter((c) => c.active) ?? [];

  return (
    <section aria-labelledby="sources-title" className={cn("rounded-card border border-line bg-surface", className)}>
      <h2 id="sources-title" className="border-b border-line px-4 py-3 font-medium">
        Sources
      </h2>
      {!data ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : (
        <>
          <ul className="space-y-2 px-4 py-3 text-sm">
            {data.fetchers.map((f) => (
              <FetcherRow key={f.key} fetcher={f} now={now} />
            ))}
          </ul>
          <h3 className="px-4 pt-1 font-mono text-xs tracking-[0.18em] text-ink-subtle uppercase">Team</h3>
          {team.length ? (
            <ul className="space-y-2 px-4 pt-2 pb-3 text-sm">
              {team.map((c) => (
                <CollectorRow key={c.id} collector={c} now={now} />
              ))}
            </ul>
          ) : (
            <p className="px-4 pt-2 pb-3 text-sm text-ink-subtle italic">No team members yet.</p>
          )}
        </>
      )}
    </section>
  );
}

function FetcherRow({ fetcher: f, now }: { fetcher: ControlFetcher; now: number }) {
  const red = f.health === "red";
  const detail = [f.lastRunAt ? span(now - Date.parse(f.lastRunAt)) : "never ran", f.errors24h > 0 && `${f.errors24h} ${f.errors24h === 1 ? "error" : "errors"}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <div className="flex items-center gap-2">
        <Dot state={red ? "red" : f.health === "green" ? "green" : "idle"} />
        <span className={cn("min-w-0 flex-1 truncate", red && "font-medium text-danger-ink", f.health === "idle" && "text-ink-muted")}>
          {f.label}
          <span className="sr-only">, {red ? "broken" : f.health === "green" ? "healthy" : "idle"}</span>
        </span>
        <span className={cn("shrink-0 font-mono text-xs", red ? "text-danger-ink" : "text-ink-muted")}>{detail}</span>
      </div>
      {red && f.problem && (
        <p className="truncate pl-4 text-xs text-danger-ink" title={f.lastError ?? undefined}>
          {f.problem}
          {f.lastError && `: ${f.lastError}`}
        </p>
      )}
    </li>
  );
}

function CollectorRow({ collector: c, now }: { collector: ControlCollector; now: number }) {
  const active = c.health === "active";
  return (
    <li className="flex items-center gap-2">
      <Dot state={active ? "green" : "idle"} />
      <span className={cn("min-w-0 flex-1 truncate", !active && "text-ink-muted")}>
        {c.name}
        <span className="sr-only">, {active ? "active" : "idle"}</span>
      </span>
      <span className="shrink-0 font-mono text-xs text-ink-muted" title="Posts and desk entries in the last 24h · last seen">
        {c.posts24h} in 24h · {c.lastSeenAt ? span(now - Date.parse(c.lastSeenAt)) : "never"}
      </span>
    </li>
  );
}

/** Filled green or red when there is something to say, a hollow ring when idle. */
function Dot({ state }: { state: "green" | "red" | "idle" }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", state === "green" ? "bg-ok" : state === "red" ? "bg-danger" : "border border-ink-subtle")}
    />
  );
}
