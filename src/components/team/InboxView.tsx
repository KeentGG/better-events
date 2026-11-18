import { Check, EyeOff, ExternalLink, Inbox, LogOut, Pencil, Plus, RefreshCw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { categoryMeta } from "../../lib/categories";
import { editActions, moveActions, undoActions } from "../../lib/inbox";
import { teamFetch, TeamApiError, useTeamSession } from "../../lib/team";
import { clock, timeAgo } from "../../lib/time";
import { CATEGORIES, type Category, type InboxItem, type ItemActionInput, type ItemStatus } from "../../lib/types";
import { Alert, Badge, Button, Card, CardSkeleton, EmptyState, Field, Input, SegmentedControl, Select, Textarea } from "../../ui";
import { AreaSelect } from "./fields";
import { TeamSignIn } from "./TeamSignIn";

const views: Array<{ value: ItemStatus; label: string }> = [
  { value: "needs_review", label: "To review" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

const platformLabel: Record<string, string> = { facebook: "Facebook", threads: "Threads", x: "X", web: "the web", curator: "the inbox", crowd: "crowd reports" };

/** What an action does to the card, so the list can update without a reload. */
type Changes = Partial<Pick<InboxItem, "status" | "category" | "title" | "body" | "area">>;

/**
 * Curators review what the classifier was unsure about, fix it, and publish or hide it. They sign in
 * with their staff token, and every change goes through the same item actions as mission control.
 */
export function InboxView() {
  const { token, role, signIn, signOut } = useTeamSession();
  const [denied, setDenied] = useState(false);
  if (!token) {
    return (
      <TeamSignIn title="Curator inbox" onToken={signIn}>
        Review posts the app wasn't sure about before they reach the public feed. Paste your staff token to start.
      </TeamSignIn>
    );
  }
  if (denied || role === "collector") {
    return (
      <EmptyState
        icon={Inbox}
        title="The inbox is for staff"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setDenied(false);
              signOut();
            }}
          >
            Use a different token
          </Button>
        }
      >
        You're signed in as a team member. Post updates on the team desk, or sign in with a staff token to review posts.
      </EmptyState>
    );
  }
  return <InboxList token={token} onSignOut={signOut} onDenied={() => setDenied(true)} />;
}

function InboxList({ token, onSignOut, onDenied }: { token: string; onSignOut: () => void; onDenied: () => void }) {
  const [view, setView] = useState<ItemStatus>("needs_review");
  const [items, setItems] = useState<InboxItem[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<{ item: InboxItem; status: ItemStatus }>();

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof TeamApiError && err.status === 401) return onSignOut();
      if (err instanceof TeamApiError && err.status === 403) return onDenied();
      setError(err instanceof TeamApiError ? err.message : "Something went wrong. Try again.");
    },
    [onSignOut, onDenied],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await teamFetch<InboxItem[]>(`/api/control/inbox?status=${view}`, token));
      setError(undefined);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [view, token, fail]);

  useEffect(() => {
    setItems(undefined);
    void load();
    // New posts keep arriving from the team, so the queue refreshes itself while open.
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const sendActions = (item: InboxItem, actions: ItemActionInput[]) =>
    teamFetch(`/api/control/items/${item.id}/actions`, token, { method: "POST", body: { actions } });

  async function update(item: InboxItem, actions: ItemActionInput[], changes: Changes) {
    try {
      await sendActions(item, actions);
      const moved = changes.status && changes.status !== view;
      setItems((list) => (moved ? list?.filter((i) => i.id !== item.id) : list?.map((i) => (i.id === item.id ? { ...i, ...changes } : i))));
      if (moved) setLast({ item, status: changes.status! });
      setError(undefined);
    } catch (err) {
      fail(err);
    }
  }

  async function undo() {
    if (!last) return;
    try {
      await sendActions(last.item, undoActions(last.status, last.item.status));
      setLast(undefined);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">Curators</p>
          <h1 className="mt-1 font-display text-hero">Inbox</h1>
          <p className="mt-1 text-sm text-ink-muted">Posts the app wasn't sure about. Publish what's true and useful, hide the rest.</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="size-4" aria-hidden />} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-md">
        <SegmentedControl label="Show" value={view} options={views} onChange={setView} />
      </div>

      <AddPost token={token} onAdded={() => view === "needs_review" && void load()} onError={fail} />

      {error && (
        <Alert tone="danger" title="Couldn't update the inbox">
          {error}
        </Alert>
      )}
      {last && (
        <Alert
          tone="ok"
          title={last.status === "published" ? "Published" : last.status === "hidden" ? "Hidden" : "Moved back to review"}
          action={
            <Button variant="secondary" size="sm" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => void undo()}>
              Undo
            </Button>
          }
        >
          {last.item.title}
        </Alert>
      )}

      {!items ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title={view === "needs_review" ? "All caught up" : "Nothing here yet"}>
          {view === "needs_review" ? "New posts from the team show up here on their own." : "Items you move here will show up in this list."}
        </EmptyState>
      ) : (
        <ul className="auto-grid [--gap:1rem] [--min:22rem]">
          {items.map((item) => (
            <li key={item.id}>
              <InboxCard item={item} token={token} onUpdate={(actions, changes) => update(item, actions, changes)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({
  item,
  token,
  onUpdate,
}: {
  item: InboxItem;
  token: string;
  onUpdate: (actions: ItemActionInput[], changes: Changes) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<ItemStatus | "save">();
  const [draft, setDraft] = useState({ title: item.title, body: item.body, category: item.category, area: item.area ?? "" });
  const meta = categoryMeta[item.category];
  const Icon = meta.icon;

  async function act(status: ItemStatus) {
    setBusy(status);
    // Publishing while editing saves the edits in the same step, all or nothing.
    const changes = editing ? edits() : undefined;
    await onUpdate([...(changes ? editActions(changes) : []), ...moveActions(item.status, status)], { ...changes, status });
    setBusy(undefined);
  }

  function edits() {
    return { title: draft.title.trim() || item.title, body: draft.body, category: draft.category, area: draft.area || null };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    const changes = edits();
    await onUpdate(editActions(changes), changes);
    setBusy(undefined);
    setEditing(false);
  }

  const who = item.post?.collector
    ? `Sent by ${item.post.collector}`
    : item.post?.platform === "curator"
      ? `Added by ${item.post.addedBy ?? "a curator"}`
      : "Found automatically";
  const from = item.source?.name ?? item.post?.author;

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={meta.tone} icon={<Icon aria-hidden />}>
          {meta.label}
        </Badge>
        {item.area && <Badge>{item.area}</Badge>}
        {item.status === "needs_review" && <Badge tone="warn">{Math.round(item.confidence * 100)}% sure</Badge>}
        {item.source && item.source.tier <= 2 && <Badge tone="ok">Official</Badge>}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <Field label="Headline">{(p) => <Input {...p} maxLength={140} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
          <Field label="Details">{(p) => <Textarea {...p} rows={3} maxLength={1000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              {(p) => (
                <Select {...p} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryMeta[c].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <AreaSelect token={token} value={draft.area} onChange={(area) => setDraft({ ...draft, area })} optional />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm" loading={busy === "save"}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1">
          <h2 className="font-semibold text-balance">{item.title}</h2>
          {item.body && <p className="line-clamp-4 text-sm text-ink-muted">{item.body}</p>}
        </div>
      )}

      <p className="text-xs text-ink-subtle">
        {who}
        {from && ` · ${from}`}
        {item.post && ` on ${platformLabel[item.post.platform] ?? item.post.platform}`} · posted {clock(item.publishedAt)}, {timeAgo(item.publishedAt)}
        {item.post?.url && (
          <>
            {" · "}
            <a href={item.post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary-ink underline-offset-2 hover:underline">
              Open post <ExternalLink className="size-3" aria-hidden />
            </a>
          </>
        )}
      </p>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {item.status !== "published" && (
          <Button size="sm" icon={<Check className="size-4" aria-hidden />} loading={busy === "published"} onClick={() => void act("published")}>
            Publish
          </Button>
        )}
        {item.status !== "hidden" && (
          <Button variant="secondary" size="sm" icon={<EyeOff className="size-4" aria-hidden />} loading={busy === "hidden"} onClick={() => void act("hidden")}>
            Hide
          </Button>
        )}
        {item.status === "hidden" && (
          <Button variant="secondary" size="sm" loading={busy === "needs_review"} onClick={() => void act("needs_review")}>
            Back to review
          </Button>
        )}
        {!editing && (
          <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Paste a post by hand (for example one a curator saw themselves). It is classified like any other. */
function AddPost({ token, onAdded, onError }: { token: string; onAdded: () => void; onError: (err: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [urlError, setUrlError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (url.trim() && !URL.canParse(url.trim())) return setUrlError("Use the full link, starting with https://");
    if (!text.trim()) return;
    setUrlError(undefined);
    setSending(true);
    try {
      await teamFetch("/api/control/posts", token, { method: "POST", body: { text: text.trim(), ...(url.trim() && { url: url.trim() }) } });
      setText("");
      setUrl("");
      setOpen(false);
      onAdded();
    } catch (err) {
      onError(err);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        Add a post by hand
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-3 rounded-card border border-line bg-surface-raised p-4 shadow-card">
      <Field label="Post text" hint="First line becomes the headline.">
        {(p) => <Textarea {...p} rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <Field label="Link (optional)" error={urlError}>
        {(p) => <Input {...p} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={sending} disabled={!text.trim()}>
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
