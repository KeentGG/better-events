import { BadgeCheck, ExternalLink, Flag, Tags } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { sampleControlStream } from "../../data/control";
import { categoryMeta } from "../../lib/categories";
import { loadControl } from "../../lib/control";
import { availableActions, rowActionRequest, type RowAction } from "../../lib/inbox";
import { teamFetch, TeamApiError } from "../../lib/team";
import { clock } from "../../lib/time";
import { INTAKE_FILTERS, MODERATOR_FILTERS, matchesIntakeFilter, type Category, type CommunitySubmission, type ControlPost, type IntakeFilter, type ItemFlag } from "../../lib/types";
import { usePolling } from "../../lib/usePolling";
import { Alert, Badge, Button, Chip, Select, Skeleton, SlideOver, Toast, cn, type ToastMessage } from "../../ui";
import { SuggestionCard } from "../team/SuggestionCard";
import { TopicPicker } from "../team/TopicPicker";
import { RowActions } from "./RowActions";

const platformLabel: Record<string, string> = { facebook: "Facebook", threads: "Threads", x: "X", web: "Web", curator: "Pasted", crowd: "Crowd", desk: "Desk" };

const filterLabel: Record<IntakeFilter, string> = { open: "Open", verify: "To verify", flagged: "Flagged", published: "Published", dropped: "Dropped" };

const flagLabel: Record<ItemFlag, string> = { conflict: "Conflict", low_confidence: "Low confidence", unverified_high_stakes: "Unverified" };

const outcomeTone: Record<ControlPost["outcome"], string> = { used: "text-ok-ink", pending: "text-ink-muted", dropped: "text-ink-subtle" };

/**
 * The intake table (docs/MISSION_CONTROL.md §2.3): posts sent in by the team and pasted by curators,
 * and entries made on the team desk, each with what it became. Filter chips and a group picker narrow
 * it; row actions verify and hide (staff), or hide and unhide your own desk entries (team members).
 * `header` sits next to the title, for the Table | Graph switch. Under Open and To verify, visitor
 * suggestions waiting for review lead the table; Review opens one in a side panel to approve or turn down.
 */
export function IntakeTable({
  token,
  moderator,
  version,
  groups,
  filter,
  group,
  onFilter,
  onGroup,
  onChanged,
  onSignOut,
  header,
  children,
  className,
  suggestions = 0,
}: {
  token: string | undefined;
  /** Staff and admin; team members get fewer filters and only their own rows' actions. */
  moderator: boolean;
  version: number;
  /** Groups for the picker, in wall order. */
  groups: Array<{ key: string; label: string }>;
  filter: IntakeFilter;
  group: string;
  onFilter: (filter: IntakeFilter) => void;
  onGroup: (group: string) => void;
  /** Called after a row action, so the wall reloads too. */
  onChanged: () => void;
  onSignOut: () => void;
  header?: ReactNode;
  /** Replaces the table, e.g. with the graph, under the same header and filters. */
  children?: ReactNode;
  className?: string;
  /** How many visitor suggestions the board counts as waiting; a change reloads the list. */
  suggestions?: number;
}) {
  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => {
    const sample = { ...sampleControlStream, posts: sampleControlStream.posts.filter((p) => matchesIntakeFilter(p, filter)) };
    const query = new URLSearchParams({ filter, ...(group && { group }) });
    return loadControl(`/api/control/stream?${query}`, token, sample, onSignOut);
  }, [token, filter, group, version, reloads]); // eslint-disable-line react-hooks/exhaustive-deps
  const stream = usePolling(load, 30_000);
  const intake = stream?.data?.intake;
  const [busy, setBusy] = useState<{ id: string; action: RowAction }>();
  const [error, setError] = useState<string>();
  const readOnly = !token || !stream?.live;
  const filters = INTAKE_FILTERS.filter((f) => moderator || !MODERATOR_FILTERS.includes(f));
  // Suggestions have no category until approved, so a group filter leaves them out.
  const showSuggestions = Boolean(token) && !group && (filter === "open" || filter === "verify");
  const waiting = useSuggestions(showSuggestions ? token : undefined, `${suggestions}:${version}:${reloads}`);
  const [reviewing, setReviewing] = useState<CommunitySubmission>();
  const [reviewed, setReviewed] = useState<ToastMessage>();

  async function act(post: ControlPost, action: RowAction) {
    if (!token || !post.item) return;
    const { path, method, body } = rowActionRequest(post.item.id, action, { moderator });
    setBusy({ id: post.id, action });
    setError(undefined);
    try {
      await teamFetch(path, token, { method, body });
      setReloads((n) => n + 1);
      onChanged();
    } catch (err) {
      if (err instanceof TeamApiError && err.status === 401) return onSignOut();
      setError(err instanceof TeamApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-labelledby="intake-title" className={cn("@container/intake overflow-hidden rounded-card border border-line bg-surface", className)}>
      <header className="space-y-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id="intake-title" className="font-medium">
              Intake
            </h2>
            {intake && (
              <p className="font-mono text-xs text-ink-muted">
                24h · {intake.in} in · {intake.in ? Math.round((intake.used / intake.in) * 100) : 0}% used
                {intake.dropped > 0 && ` · ${intake.dropped} dropped`}
              </p>
            )}
          </div>
          {header}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <Chip key={f} active={filter === f} onClick={() => onFilter(f)}>
                {filterLabel[f]}
              </Chip>
            ))}
          </div>
          <div className="ml-auto w-44">
            <Select aria-label="Group" className="h-9 py-0 text-sm" value={group} onChange={(e) => onGroup(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="That didn't work" className="m-3">
          {error}
        </Alert>
      )}

      {children ||
        (stream?.denied ? (
          <p className="px-4 py-6 text-sm text-ink-subtle italic">This filter is for staff.</p>
        ) : !stream?.data ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : stream.data.posts.length || waiting.length ? (
          <table className="block w-full text-sm @3xl/intake:table">
            <thead className="hidden text-left text-xs text-ink-subtle @3xl/intake:table-header-group">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">From</th>
                <th className="px-2 py-2 font-medium">Post</th>
                <th className="px-2 py-2 font-medium">Became</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-line @3xl/intake:table-row-group">
              {waiting.map((s) => (
                <SuggestionRow key={s.id} row={s} onReview={() => setReviewing(s)} />
              ))}
              {stream.data.posts.map((p) => (
                <Row
                  key={p.id}
                  post={p}
                  actions={availableActions(p, { moderator })}
                  busy={busy?.id === p.id ? busy.action : undefined}
                  readOnly={readOnly}
                  onAct={(action) => void act(p, action)}
                  token={token}
                  onTopicsSaved={() => {
                    setReloads((n) => n + 1);
                    onChanged();
                  }}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-sm text-ink-subtle italic">{filter === "open" ? "Nothing sent in or entered yet." : "Nothing here."}</p>
        ))}

      <Toast toast={reviewed} onClose={() => setReviewed(undefined)} />
      {reviewing && token && (
        <SlideOver title="Visitor suggestion" status="Sent from the Contribute page" onClose={() => setReviewing(undefined)}>
          <SuggestionCard
            row={reviewing}
            token={token}
            staff={moderator}
            onReviewed={(line) => {
              setReviewing(undefined);
              setReviewed({ tone: "ok", title: "Done", text: line });
              setReloads((n) => n + 1);
              onChanged();
            }}
          />
        </SlideOver>
      )}
    </section>
  );
}

/** One row; while the card is narrower than `@3xl` its cells lay out as a compact two-column block instead of table columns. */
function Row({
  post: p,
  actions,
  busy,
  readOnly,
  onAct,
  token,
  onTopicsSaved,
}: {
  post: ControlPost;
  actions: RowAction[];
  busy: RowAction | undefined;
  readOnly: boolean;
  onAct: (action: RowAction) => void;
  token: string | undefined;
  onTopicsSaved: () => void;
}) {
  const via =
    p.via.kind === "team" ? `Team · ${p.via.name ?? "Unknown"}` : p.via.kind === "staff" ? `Staff · ${p.via.name ?? "Unknown"}` : p.via.kind === "curator" ? "Curator" : (p.via.name ?? p.author ?? "Unknown source");
  const category = p.item && (categoryMeta[p.item.category as Category]?.label ?? p.item.category.replaceAll("_", " "));
  const cell = "min-w-0 @3xl/intake:table-cell @3xl/intake:px-2 @3xl/intake:py-2.5 @3xl/intake:align-top";

  return (
    <tr className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 px-4 py-3 @3xl/intake:table-row @3xl/intake:p-0", p.outcome === "dropped" && "text-ink-subtle")}>
      <td className={cn(cell, "col-start-2 row-start-1 text-right font-mono text-xs whitespace-nowrap text-ink-muted tabular-nums @3xl/intake:pl-4 @3xl/intake:text-left")}>
        <time dateTime={p.receivedAt}>{clock(p.receivedAt)}</time>
      </td>
      <td className={cn(cell, "col-start-1 row-start-1 @3xl/intake:max-w-40")}>
        <span className="block truncate font-medium">{via}</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
          {platformLabel[p.platform] ?? p.platform}
          {p.official && (
            <Badge tone="brand" variant="solid">
              Official
            </Badge>
          )}
        </span>
      </td>
      <td className={cn(cell, "col-start-1 row-start-2 text-ink-muted")}>
        <p className="line-clamp-2">
          {p.origin === "post" ? `“${p.text}”` : p.text}
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex align-middle text-ink-subtle hover:text-ink" aria-label="Open the original post">
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </p>
      </td>
      <td className={cn(cell, "col-start-1 row-start-3 @3xl/intake:max-w-40")}>
        {p.item ? (
          <span className="block truncate" title={p.item.title}>
            <span aria-hidden className="text-ink-subtle @3xl/intake:hidden">→ </span>
            {[category, p.item.area].filter(Boolean).join(" · ")}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </td>
      <td className={cn(cell, "col-start-1 row-start-4 flex flex-wrap items-center gap-x-2 gap-y-1 @3xl/intake:space-y-1")}>
        <span className={cn("block font-medium", outcomeTone[p.outcome])}>{p.outcome === "used" ? "Published" : p.reason}</span>
        {(p.item?.flag || p.item?.verifiedAt) && (
          <span className="flex flex-wrap gap-1">
            {p.item.flag && (
              <Badge tone="warn" icon={<Flag className="size-3.5" aria-hidden />}>
                {flagLabel[p.item.flag]}
              </Badge>
            )}
            {p.item.verifiedAt && (
              <Badge tone="ok" icon={<BadgeCheck className="size-3.5" aria-hidden />}>
                Verified
              </Badge>
            )}
          </span>
        )}
        {p.item?.topicsUnsure && token && !readOnly && <TopicFix token={token} itemId={p.item.id} text={p.text} initial={p.item.topics ?? []} onSaved={onTopicsSaved} />}
      </td>
      <td className={cn(cell, "col-start-2 row-span-3 row-start-2 self-center empty:hidden @3xl/intake:pr-4 @3xl/intake:empty:table-cell")}>
        {actions.length > 0 && (
          <div className="flex flex-col gap-1 [&>button]:w-full [&>button]:justify-center @3xl/intake:flex-row @3xl/intake:[&>button]:w-auto @3xl/intake:justify-end">
            <RowActions actions={actions} busy={busy} disabled={readOnly} onAct={onAct} />
          </div>
        )}
      </td>
    </tr>
  );
}

/** Pending visitor suggestions, polled with the table; `reload` changes when the board's count or a row action does. */
function useSuggestions(token: string | undefined, reload: string) {
  const [rows, setRows] = useState<CommunitySubmission[]>([]);
  useEffect(() => {
    if (!token) return setRows([]);
    let live = true;
    const load = () =>
      teamFetch<CommunitySubmission[]>("/api/community/review?status=pending", token)
        .then((list) => live && setRows(list))
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [token, reload]);
  return rows;
}

const suggestionVerb: Record<string, string> = { POST: "Adds", PUT: "Changes", DELETE: "Removes" };

/**
 * A visitor suggestion in the table's columns. Review opens it whole, where the team decides where it
 * goes up and approves or turns it down.
 */
function SuggestionRow({ row, onReview }: { row: CommunitySubmission; onReview: () => void }) {
  const cell = "min-w-0 @3xl/intake:table-cell @3xl/intake:px-2 @3xl/intake:py-2.5 @3xl/intake:align-top";
  return (
    <tr className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 bg-warn-soft/40 px-4 py-3 @3xl/intake:table-row @3xl/intake:p-0">
      <td className={cn(cell, "col-start-2 row-start-1 text-right font-mono text-xs whitespace-nowrap text-ink-muted tabular-nums @3xl/intake:pl-4 @3xl/intake:text-left")}>
        <time dateTime={row.createdAt}>{clock(row.createdAt)}</time>
      </td>
      <td className={cn(cell, "col-start-1 row-start-1 @3xl/intake:max-w-40")}>
        <span className="block truncate font-medium">Visitor · {row.sender}</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
          Contribute
          {row.fromSender > 1 && <Badge tone="warn">{row.fromSender} from them</Badge>}
        </span>
      </td>
      <td className={cn(cell, "col-start-1 row-start-2 text-ink-muted")}>
        <p className="line-clamp-2">
          {row.summary}
          {row.about && <span className="text-ink-subtle"> · {row.about}</span>}
        </p>
      </td>
      <td className={cn(cell, "col-start-1 row-start-3 @3xl/intake:max-w-40")}>
        <span className="text-ink-subtle">{suggestionVerb[row.method] ?? row.method} on approval</span>
      </td>
      <td className={cn(cell, "col-start-1 row-start-4")}>
        <span className="block font-medium text-warn-ink">Visitor suggestion</span>
        {row.reason && <span className="block text-xs text-ink-muted">Desk refused it last time: {row.reason}</span>}
      </td>
      <td className={cn(cell, "col-start-2 row-span-3 row-start-2 self-center @3xl/intake:pr-4")}>
        <div className="flex flex-col gap-1 [&>button]:w-full [&>button]:justify-center @3xl/intake:flex-row @3xl/intake:[&>button]:w-auto @3xl/intake:justify-end">
          <Button size="sm" onClick={onReview}>
            Review
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Topics the classifier wasn't sure of: a badge that opens the picker, and saving replaces its guesses. */
function TopicFix({ token, itemId, text, initial, onSaved }: { token: string; itemId: string; text: string; initial: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <Button size="sm" variant="ghost" icon={<Tags className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        Check topics
      </Button>
    );
  }
  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await teamFetch(`/api/team/items/${itemId}/topics`, token, { method: "PUT", body: { topics } });
      onSaved();
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Couldn't save the topics. Try again.");
      setSaving(false);
    }
  }
  return (
    <div className="w-full space-y-2 rounded-control border border-line bg-surface-sunken p-3">
      <TopicPicker token={token} value={topics} onChange={setTopics} text={text} />
      {error && <p className="text-sm text-danger-ink">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={saving} onClick={() => void save()}>
          Save topics
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
