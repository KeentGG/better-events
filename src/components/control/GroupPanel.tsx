import { BadgeCheck, ExternalLink, Flag, RotateCw, Tags } from "lucide-react";
import { useCallback, useState } from "react";
import { sampleGroupDetail } from "../../data/control";
import { categoryMeta } from "../../lib/categories";
import { availableActions } from "../../lib/inbox";
import { loadControl, span } from "../../lib/control";
import { href } from "../../lib/route";
import { teamFetch, TeamApiError } from "../../lib/team";
import { clock } from "../../lib/time";
import {
  CATEGORIES,
  type Category,
  type ControlGroupDetail,
  type ControlItem,
  type ControlItemHistory,
  type ItemAction,
  type ItemActionInput,
  type ItemFlag,
} from "../../lib/types";
import { usePolling } from "../../lib/usePolling";
import { Alert, Badge, Button, LiveDot, Select, Skeleton, SlideOver, cn } from "../../ui";
import { RowActions } from "./RowActions";
import { UPDATE_SPECS } from "./updates";

const flagLabel: Record<ItemFlag, string> = {
  conflict: "Conflicts with an official update",
  low_confidence: "Low confidence",
  unverified_high_stakes: "Unverified, high stakes",
};

/** Stale window choices, in minutes. */
const STALE_CHOICES = [15, 30, 60, 120, 360, 720, 1440, 4320, 10080];

const categoryLabel = (c: string) => categoryMeta[c as Category]?.label ?? c.replaceAll("_", " ");

/**
 * The slide-over for one data group (docs/MISSION_CONTROL.md §2.2), opened from a tile at
 * `#/control/<group>`. Staff verify, hide or recategorize items here, retry a broken fetcher and
 * change the stale window. `onChanged` lets the wall refresh after an action.
 */
export function GroupPanel({
  groupKey,
  token,
  onClose,
  onSignOut,
  onChanged,
}: {
  groupKey: string;
  token: string | undefined;
  onClose: () => void;
  onSignOut: () => void;
  onChanged: () => void;
}) {
  const [version, setVersion] = useState(0);
  const load = useCallback(
    () => loadControl(`/api/control/groups/${encodeURIComponent(groupKey)}`, token, sampleGroupDetail(groupKey), onSignOut),
    [groupKey, token, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const detail = usePolling(load, 30_000);
  const [error, setError] = useState<string>();

  /** Sends a staff action, then reloads this panel and the wall. */
  const act = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      if (!token) return;
      setError(undefined);
      try {
        await teamFetch(path, token, { method: "POST", ...init });
        setVersion((v) => v + 1);
        onChanged();
      } catch (err) {
        if (err instanceof TeamApiError && err.status === 401) return onSignOut();
        setError(err instanceof TeamApiError ? err.message : "Something went wrong. Try again.");
      }
    },
    [token, onChanged, onSignOut],
  );

  const g = detail?.data;
  const readOnly = !token || !detail?.live;
  const editor = g?.editor ? UPDATE_SPECS[g.editor] : undefined;

  return (
    <SlideOver
      icon={g && <HealthDot health={g.health} />}
      title={g?.label ?? (detail?.denied ? "Group" : "Loading…")}
      status={g && (g.health === "red" ? "Broken" : g.health === "gray" ? "Stale: nothing new within the window" : "Healthy")}
      badge={
        g?.flags ? (
          <Badge tone="warn" icon={<Flag className="size-3.5" aria-hidden />}>
            {g.flags} {g.flags === 1 ? "flag" : "flags"}
          </Badge>
        ) : null
      }
      headerClassName={cn(g?.health === "red" && "bg-danger-soft text-danger-ink")}
      onClose={onClose}
      footer={
        editor?.kind === "link" ? (
          <a href={editor.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline">
            {editor.label}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : (
          editor?.kind === "form" &&
          g?.editor && (
            <a href={href({ tab: "control", detail: g.editor })} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline">
              {editor.label}
            </a>
          )
        )
      }
    >
      {detail?.denied ? (
        <Alert tone="info" title="Staff only">
          Group details and item actions are for staff. Sign in with a staff token to open them.
        </Alert>
      ) : !g ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {readOnly && (
            <Alert tone="info" title="Preview">
              This is sample data. Sign in with a staff token to act on items.
            </Alert>
          )}
          {error && (
            <Alert tone="danger" title="That didn't work">
              {error}
            </Alert>
          )}
          <Stats group={g} readOnly={readOnly} onStale={(staleMinutes) => act(`/api/control/groups/${g.key}`, { method: "PATCH", body: { staleMinutes } })} />
          {g.fetchers
            .filter((f) => f.health === "red")
            .map((f) => (
              <Alert
                key={f.key}
                tone="danger"
                title={`${f.label}: ${f.problem ?? "broken"}`}
                action={<RetryButton disabled={readOnly} onRetry={() => act(`/api/control/fetchers/${f.key}/retry`)} />}
              >
                {f.lastError ? `Last error: ${f.lastError}` : "No error message was recorded."}
              </Alert>
            ))}

          <section aria-labelledby="group-items-title" className="space-y-2">
            <h3 id="group-items-title" className="font-mono text-xs tracking-[0.18em] text-ink-subtle uppercase">
              Items{g.items.length > 0 && ` · ${g.items.length}`}
            </h3>
            {g.items.length ? (
              <ul className="divide-y divide-line rounded-card border border-line">
                {g.items.map((item) => (
                  <ItemRow key={item.id} item={item} readOnly={readOnly} onAct={(input) => act(`/api/control/items/${item.id}/actions`, { body: { actions: [input] } })} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-subtle italic">
                {g.problems.length || g.activity.length ? "No items in this group's categories." : "Nothing entered yet."}
              </p>
            )}
          </section>
        </>
      )}
    </SlideOver>
  );
}

function HealthDot({ health }: { health: ControlGroupDetail["health"] }) {
  if (health === "green") return <LiveDot tone="ok" />;
  return <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", health === "red" ? "bg-danger" : "bg-ink-subtle")} />;
}

/** Last update, the stale window (editable) and 24h intake. */
function Stats({ group: g, readOnly, onStale }: { group: ControlGroupDetail; readOnly: boolean; onStale: (minutes: number) => void }) {
  const now = Date.parse(g.generatedAt);
  const choices = STALE_CHOICES.includes(g.staleMinutes) ? STALE_CHOICES : [...STALE_CHOICES, g.staleMinutes].sort((a, b) => a - b);
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line text-sm">
      <div className="bg-surface-raised px-3 py-2.5">
        <dt className="text-xs text-ink-muted">Last update</dt>
        <dd className="mt-0.5 font-mono">{g.lastUpdateAt ? `${span(now - Date.parse(g.lastUpdateAt))} ago` : "Nothing yet"}</dd>
      </div>
      <div className="bg-surface-raised px-3 py-2.5">
        <dt className="text-xs text-ink-muted">
          <label htmlFor="stale-window">Stale after</label>
        </dt>
        <dd className="mt-0.5">
          <Select
            id="stale-window"
            className="h-8 py-0 pl-2 font-mono text-sm"
            value={g.staleMinutes}
            disabled={readOnly}
            onChange={(e) => onStale(Number(e.target.value))}
          >
            {choices.map((m) => (
              <option key={m} value={m}>
                {span(m * 60_000)}
              </option>
            ))}
          </Select>
        </dd>
      </div>
      <div className="bg-surface-raised px-3 py-2.5">
        <dt className="text-xs text-ink-muted">Intake 24h</dt>
        <dd className="mt-0.5">
          {g.intake.in ? (
            <>
              <span className="font-mono">{g.intake.used} used</span>
              <span className="block text-xs text-ink-muted">
                {g.intake.pending} pending · {g.intake.dropped} dropped
              </span>
            </>
          ) : (
            <span>Nothing yet</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function RetryButton({ disabled, onRetry }: { disabled: boolean; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled}
      loading={busy}
      icon={<RotateCw className="size-4" aria-hidden />}
      onClick={async () => {
        setBusy(true);
        await onRetry();
        setBusy(false);
      }}
    >
      Retry now
    </Button>
  );
}

function ItemRow({ item: i, readOnly, onAct }: { item: ControlItem; readOnly: boolean; onAct: (input: ItemActionInput) => Promise<void> }) {
  const [busy, setBusy] = useState<ItemAction>();
  const [recategorizing, setRecategorizing] = useState(false);
  const run = async (input: ItemActionInput) => {
    setBusy(input.action);
    await onAct(input);
    setBusy(undefined);
    setRecategorizing(false);
  };
  const from = i.by ? `${i.source && i.source.tier <= 2 ? i.source.name : "Team"} · ${i.by}` : (i.source?.name ?? "Unknown source");
  // The slide-over is staff only.
  const actions = availableActions({ item: i, mine: false }, { moderator: true });

  return (
    <li className={cn("space-y-2 px-3 py-3 text-sm", i.flag && "bg-warn-soft/40", i.status === "hidden" && "text-ink-subtle")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {i.flag && (
          <Badge tone="warn" icon={<Flag className="size-3.5" aria-hidden />}>
            {flagLabel[i.flag]}
          </Badge>
        )}
        {i.status !== "published" && <Badge tone="neutral">{i.status === "hidden" ? "Hidden" : "Waiting for review"}</Badge>}
        {i.verifiedAt && (
          <Badge tone="ok" icon={<BadgeCheck className="size-3.5" aria-hidden />}>
            Verified
          </Badge>
        )}
      </div>
      <div>
        <p className="font-medium">{i.title}</p>
        {i.body && <p className="line-clamp-2 text-ink-muted">{i.body}</p>}
        <p className="mt-0.5 text-xs text-ink-muted">
          {[categoryLabel(i.category), i.area, from, clock(i.publishedAt)].filter(Boolean).join(" · ")}
          {i.flag === "low_confidence" && ` · ${Math.round(i.confidence * 100)}% sure`}
          {i.url && (
            <a href={i.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex align-middle text-ink-subtle hover:text-ink" aria-label="Open the original post">
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </p>
      </div>

      {i.conflictsWith && (
        <p className="text-xs text-warn-ink">
          Conflicts with: <span className="font-medium">{i.conflictsWith.title}</span>
        </p>
      )}

      {recategorizing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const picked = new FormData(e.currentTarget).get("category");
            const category = CATEGORIES.find((c) => c === picked);
            if (category && category !== i.category) run({ action: "recategorize", category });
            else setRecategorizing(false);
          }}
        >
          <Select name="category" aria-label="New category" defaultValue={i.category} className="h-9 flex-1 py-0 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" loading={busy === "recategorize"}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRecategorizing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <RowActions actions={actions} busy={busy} disabled={readOnly} onAct={(action) => run({ action })} />
          <Button size="sm" variant="ghost" disabled={readOnly} icon={<Tags className="size-4" aria-hidden />} onClick={() => setRecategorizing(true)}>
            Recategorize
          </Button>
        </div>
      )}

      {i.history.length > 0 && (
        <ul className="space-y-0.5 text-xs text-ink-muted">
          {i.history.map((h, n) => (
            <li key={n}>{historyLine(h)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

const historyVerb: Record<ItemAction, string> = {
  verify: "Verified",
  hide: "Hidden",
  unhide: "Unhidden",
  end: "Ended",
  retime: "Changed the time",
  recategorize: "Recategorized",
  edit: "Edited",
  return_to_review: "Sent back to review",
};

/** "Verified by Maria · 2:20 PM", "Recategorized by staff: Crime & safety → Announcement". */
function historyLine(h: ControlItemHistory) {
  const verb = historyVerb[h.action];
  const change =
    h.action === "recategorize" && typeof h.before?.category === "string" && typeof h.after?.category === "string"
      ? `: ${categoryLabel(h.before.category)} → ${categoryLabel(h.after.category)}`
      : "";
  return `${verb} by ${h.by}${change} · ${clock(h.at)}`;
}
