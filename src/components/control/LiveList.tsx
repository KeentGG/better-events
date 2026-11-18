import { ArrowDownToLine, CircleCheck, CircleStop, Clock, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { categoryMeta } from "../../lib/categories";
import { availableActions, editActions, rowActionRequest, teamEditRequest, type RowAction } from "../../lib/inbox";
import { planRetime } from "../../lib/retime";
import { teamFetch, TeamApiError } from "../../lib/team";
import { dayTime, timeAgo } from "../../lib/time";
import { TIER_LABELS, type Category, type ItemAction, type TeamRecent, type Tier } from "../../lib/types";
import { Alert, Badge, Button, Field, Input, SegmentedControl, Skeleton, Textarea, cn } from "../../ui";
import { useAnnounce } from "../team/announce";
import { fromLocalInput, TimeField, toLocalInput } from "../team/fields";
import { RowActions } from "./RowActions";

/** Published and not past its end: what readers can see right now. */
const isLive = (i: TeamRecent, now: number) => i.status === "published" && (!i.endsAt || Date.parse(i.endsAt) >= now);

/**
 * What a tile has live right now, newest first, under its update form, so a volunteer sees what a teammate
 * already posted and can take a post down or (staff) correct it instead of posting a second card. Something
 * taken down here stays listed until the form closes, so it can be put back.
 */
export function LiveList({ token, categories, moderator, onSignOut }: { token: string; categories: Category[]; moderator: boolean; onSignOut: () => void }) {
  const [items, setItems] = useState<TeamRecent[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<{ id: string; action: ItemAction | "lower" | "resolve" }>();
  const [editing, setEditing] = useState<string>();
  const [takenDown, setTakenDown] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string>();
  const [retiming, setRetiming] = useState<string>();

  const load = useCallback(async () => {
    try {
      const query = categories.map((c) => `category=${encodeURIComponent(c)}`).join("&");
      setItems(await teamFetch<TeamRecent[]>(`/api/team/recent?${query}`, token));
    } catch (err) {
      if (err instanceof TeamApiError && err.status === 401) return onSignOut();
      setError(err instanceof TeamApiError ? err.message : "Couldn't load what's live.");
    }
  }, [token, categories.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [load]);

  async function act(item: TeamRecent, action: ItemAction | "lower" | "resolve", send: () => Promise<unknown>) {
    setBusy({ id: item.id, action });
    setError(undefined);
    try {
      await send();
      // Both leave the live window (taking down, or resolving ends the post), but stay listed to put back or to read as resolved.
      if (action === "hide" || action === "resolve") setTakenDown((s) => new Set(s).add(item.id));
      await load();
      return true;
    } catch (err) {
      if (err instanceof TeamApiError && err.status === 401) onSignOut();
      else setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  const row = (item: TeamRecent, action: RowAction) => {
    const req = rowActionRequest(item.id, action, { moderator });
    return act(item, action, () => teamFetch(req.path, token, { method: req.method, body: req.body }));
  };

  const now = Date.now();
  const shown = items?.filter((i) => isLive(i, now) || takenDown.has(i.id));

  return (
    <section aria-labelledby="live-title" className="space-y-2 border-t border-line pt-4">
      <h3 id="live-title" className="text-sm font-medium text-ink">
        Live now
      </h3>
      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}
      {!shown ? (
        !error && <Skeleton className="h-12" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing live</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {shown.map((item) => {
            const hidden = item.status === "hidden";
            const actions = availableActions({ item, mine: item.mine }, { moderator }).filter((a) => a !== "verify");
            return (
              <li key={item.id} className="space-y-2 p-3">
                <div className={cn("min-w-0", hidden && "opacity-60")}>
                  <p className={cn("font-medium", hidden && "line-through")}>
                    {item.tier > 0 && (
                      <Badge tone={item.tier === 2 ? "danger" : "info"} className="mr-1.5 align-middle">
                        {TIER_LABELS[item.tier]}
                      </Badge>
                    )}
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {categoryMeta[item.category].label} · {item.by ?? "Team"} · {timeAgo(item.publishedAt)}
                    {item.startsAt && Date.parse(item.startsAt) > now && ` · from ${dayTime(item.startsAt)}`}
                    {item.endsAt && ` · until ${dayTime(item.endsAt)}`}
                    {(item.place || item.event) && ` · ${[item.place, item.event && `during ${item.event}`].filter(Boolean).join(", ")}`}
                    {hidden && " · Taken down"}
                    {item.resolved && " · Resolved"}
                  </p>
                </div>
                {retiming === item.id ? (
                  <RetimeRow
                    item={item}
                    staff={moderator}
                    busy={busy?.id === item.id}
                    onCancel={() => setRetiming(undefined)}
                    onSave={async (body) => {
                      const send = () => teamFetch(`/api/team/items/${item.id}/retime`, token, { method: "POST", body });
                      if (await act(item, "retime", send)) setRetiming(undefined);
                    }}
                  />
                ) : resolving === item.id ? (
                  <ResolveRow
                    busy={busy?.id === item.id}
                    onCancel={() => setResolving(undefined)}
                    onSave={async (outcome, text) => {
                      const send = () => teamFetch(`/api/team/items/${item.id}/resolve`, token, { method: "POST", body: { outcome, text: text || undefined } });
                      if (await act(item, "resolve", send)) setResolving(undefined);
                    }}
                  />
                ) : editing === item.id ? (
                  <EditRow
                    item={item}
                    busy={busy?.id === item.id}
                    onCancel={() => setEditing(undefined)}
                    onSave={async (title, body) => {
                      const send = moderator
                        ? () =>
                            teamFetch(`/api/control/items/${item.id}/actions`, token, {
                              method: "POST",
                              body: { actions: editActions({ title, body, category: item.category, area: item.area }) },
                            })
                        : () => {
                            const req = teamEditRequest(item.id, { title, body, area: item.area });
                            return teamFetch(req.path, token, { method: req.method, body: req.body });
                          };
                      if (await act(item, "edit", send)) setEditing(undefined);
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <RowActions
                      actions={actions}
                      busy={busy?.id === item.id && busy.action !== "lower" && busy.action !== "resolve" ? busy.action : undefined}
                      disabled={busy !== undefined}
                      labels={{ hide: "Take down", unhide: "Put back" }}
                      onAct={(a) => void row(item, a)}
                    />
                    {/* A safety post is resolved with a short follow-up readers see; the original ends. */}
                    {item.resolvable && !item.resolved && (moderator || item.mine) && !hidden && (
                      <Button size="sm" variant="secondary" disabled={busy !== undefined} icon={<CircleCheck className="size-4" aria-hidden />} onClick={() => setResolving(item.id)}>
                        Resolved
                      </Button>
                    )}
                    {/* Ending keeps the post on record and drops it from the feed; staff and the poster may end it. */}
                    {(moderator || item.mine) && !hidden && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy?.id === item.id && busy.action === "end"}
                        disabled={busy !== undefined}
                        icon={<CircleStop className="size-4" aria-hidden />}
                        onClick={() => void act(item, "end", () => teamFetch(`/api/team/items/${item.id}`, token, { method: "PATCH", body: { status: "ended" } }))}
                      >
                        End now
                      </Button>
                    )}
                    {/* Staff can quiet a post one step at a time: banner to pinned, pinned to a plain feed card. */}
                    {moderator && !hidden && item.tier > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy?.id === item.id && busy.action === "lower"}
                        disabled={busy !== undefined}
                        icon={<ArrowDownToLine className="size-4" aria-hidden />}
                        onClick={() =>
                          void act(item, "lower", () => teamFetch(`/api/team/items/${item.id}`, token, { method: "PATCH", body: { tier: (item.tier - 1) as Tier } }))
                        }
                      >
                        {item.tier === 2 ? "Lower to pinned" : "Unpin"}
                      </Button>
                    )}
                    {item.retimable && (moderator || item.mine) && !hidden && (
                      <Button size="sm" variant="ghost" disabled={busy !== undefined} icon={<Clock className="size-4" aria-hidden />} onClick={() => setRetiming(item.id)}>
                        Change time
                      </Button>
                    )}
                    {(moderator || item.mine) && !hidden && (
                      <Button size="sm" variant="ghost" disabled={busy !== undefined} icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(item.id)}>
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const outcomes = [
  { value: "found", label: "Found" },
  { value: "all_clear", label: "All clear" },
  { value: "other", label: "Other" },
] as const;

/** What happened, so a short follow-up goes out linked to the original: "Found: …", "All clear: …", or the person's own words. */
function ResolveRow({ busy, onSave, onCancel }: { busy: boolean; onSave: (outcome: (typeof outcomes)[number]["value"], text: string) => void; onCancel: () => void }) {
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]["value"]>("found");
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <SegmentedControl label="How did it end?" value={outcome} onChange={setOutcome} options={outcomes.map((o) => ({ value: o.value, label: o.label }))} />
      {outcome === "other" ? (
        <Field label="What happened?" hint="Readers see this as the follow-up.">
          {(p) => <Input {...p} maxLength={140} value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      ) : (
        <p className="text-xs text-ink-subtle">Posts “{outcome === "found" ? "Found" : "All clear"}: …” and ends the original.</p>
      )}
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" loading={busy} disabled={outcome === "other" && !text.trim()} onClick={() => onSave(outcome, text.trim())}>
          Post follow-up
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Corrects a live post in place, so readers see the fix on the same card. */
function EditRow({ item, busy, onSave, onCancel }: { item: TeamRecent; busy: boolean; onSave: (title: string, body: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  return (
    <div className="space-y-2">
      <Field label="Headline">{(p) => <Input {...p} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Details">{(p) => <Textarea {...p} rows={2} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" loading={busy} disabled={!title.trim()} onClick={() => onSave(title.trim(), body.trim())}>
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** What a retime sends: only the times that changed, and how to tell readers. */
interface RetimeBody {
  startsAt?: string;
  endsAt?: string | null;
  announce: boolean;
  tier?: Tier;
  note?: string;
}

/** Changes when a live post starts and ends, with a line saying what readers will see and an optional follow-up card. */
function RetimeRow({ item, staff, busy, onSave, onCancel }: { item: TeamRecent; staff: boolean; busy: boolean; onSave: (body: RetimeBody) => void; onCancel: () => void }) {
  const [starts, setStarts] = useState(item.startsAt ? toLocalInput(item.startsAt) : "");
  const [ends, setEnds] = useState(item.endsAt ? toLocalInput(item.endsAt) : "");
  const [announce, setAnnounce] = useState(true);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();
  const startIso = starts ? fromLocalInput(starts) : undefined;
  const endIso = ends ? fromLocalInput(ends) : null;
  // A start can't be taken away, only moved; an end can be cleared.
  const startsAt = startIso && Date.parse(startIso) !== Date.parse(item.startsAt ?? "") ? startIso : undefined;
  const endChanged = (endIso && Date.parse(endIso)) !== (item.endsAt ? Date.parse(item.endsAt) : null);
  const plan = planRetime(
    { startsAt: item.startsAt ? new Date(item.startsAt) : null, endsAt: item.endsAt ? new Date(item.endsAt) : null },
    { startsAt: startsAt ? new Date(startsAt) : undefined, endsAt: endChanged ? (endIso ? new Date(endIso) : null) : undefined },
    new Date(),
  );
  const ann = useAnnounce(staff, "tier" in plan && plan.tier === 1 ? "pinned" : "feed");
  const line = "error" in plan ? undefined : plan.line;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TimeField label="When" hint="Bacolod time." value={starts} onChange={setStarts} />
        <TimeField label="Until" hint={ends ? "Bacolod time. Empty means no set end." : "Bacolod time."} value={ends} onChange={setEnds} />
      </div>
      <p className={cn("text-sm", line ? "font-medium text-ink" : "text-ink-muted")} aria-live="polite">
        {line ? `Readers will see: ${line}` : "error" in plan && (startsAt || endChanged) ? plan.error : "Nothing changes until you edit a time."}
      </p>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" className="size-4" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
        Also post it to the feed
      </label>
      {announce && (
        <>
          <Field label="Note (optional)" hint="Shown under the follow-up card.">
            {(p) => <Input {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {ann.field}
        </>
      )}
      {problem && <p className="text-sm text-danger-ink">{problem}</p>}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!line}
          onClick={() => {
            if (announce && ann.loud && ann.check(ends || "24h").blocked) return setProblem("Confirm the banner first.");
            setProblem(undefined);
            onSave({ startsAt, endsAt: endChanged ? endIso : undefined, announce, ...(announce && { tier: ann.tier, note: note.trim() || undefined }) });
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
