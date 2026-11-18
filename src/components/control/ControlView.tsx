import { Flag, Inbox, LogOut, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { sampleControlBoard } from "../../data/control";
import { loadControl, span } from "../../lib/control";
import { href } from "../../lib/route";
import { TeamApiError, useTeamSession } from "../../lib/team";
import { clock } from "../../lib/time";
import { isStaffOnly, isUpdateKey, type ControlGroup, type ControlIntake, type ControlRole, type IntakeFilter, type UpdateKey } from "../../lib/types";
import { usePolling } from "../../lib/usePolling";
import { Badge, Button, CardSkeleton, LiveDot, SegmentedControl, Skeleton, Toast, cn, type ToastMessage } from "../../ui";
import { TeamSignIn } from "../team/TeamSignIn";
import { GroupPanel } from "./GroupPanel";
import { IntakeTable } from "./IntakeTable";
import { SourcesPanel } from "./SourcesPanel";
import { UpdatePanel } from "./UpdatePanel";
import { isUpdateForm, UPDATE_SPECS, type UpdateSpec } from "./updates";

// The graph is heavier and only some people open it, so it loads on first use.
const IntakeGraph = lazy(() => import("./IntakeGraph"));

/**
 * Mission control at `#/control` (docs/MISSION_CONTROL.md): a wall with one tile per data group, for
 * staff and the team. In Watch mode `#/control/<group>` opens that group's slide-over (staff only); in
 * Update mode each tile offers the updates that freshen it, and `#/control/<update>` opens that form.
 * Not linked from the public nav.
 */
export function ControlView({ detail }: { detail: string | undefined }) {
  const { token, role, checked, signIn, signOut } = useTeamSession();
  const [preview, setPreview] = useState(false);

  if (!token && !preview) {
    return (
      <div className="space-y-3">
        <TeamSignIn title="Mission control" onToken={signIn}>
          See which data groups are fresh, stale or broken, and which need an update. Paste your token to start.
        </TeamSignIn>
        <p className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setPreview(true)}>
            Preview with sample data
          </Button>
        </p>
      </div>
    );
  }
  // The role decides the mode and what the wall shows, so wait for it rather than flash the staff view at a team member.
  if (token && !checked) return <CardSkeleton />;
  return (
    <Wall
      // A new person gets their own mode.
      key={role}
      token={token}
      role={role}
      detail={detail}
      onSignOut={() => {
        signOut();
        setPreview(false);
      }}
    />
  );
}

/** Opens or closes a slide-over without the scroll-to-top that page changes do. */
const openDetail = (key: string | undefined) => {
  location.hash = href({ tab: "control", detail: key });
};

type Mode = "watch" | "update";

/**
 * Watch or Update, kept on this device per role. Team members start in Update, staff in Watch. Admin
 * (which names nobody, so cannot post) and the preview only watch.
 */
function useMode(token: string | undefined, role: ControlRole | undefined) {
  const canUpdate = Boolean(token) && (role === "staff" || role === "collector");
  const key = `sm.control.mode.${role}`;
  const [mode, setMode] = useState<Mode>(() => {
    if (!canUpdate) return "watch";
    try {
      const saved = localStorage.getItem(key);
      if (saved === "watch" || saved === "update") return saved;
    } catch {
      // Private mode: use the default.
    }
    return role === "collector" ? "update" : "watch";
  });
  const choose = useCallback(
    (next: Mode) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Private mode: the choice lasts for this visit only.
      }
      setMode(next);
    },
    [key],
  );
  return { mode, canUpdate, setMode: choose };
}

function Wall({ token, role, detail, onSignOut }: { token: string | undefined; role: ControlRole | undefined; detail: string | undefined; onSignOut: () => void }) {
  // Bumped after an action or a post so the wall and panels reload at once instead of on the next poll.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const close = useCallback(() => openDetail(undefined), []);
  const load = useCallback(() => loadControl("/api/control/board", token, sampleControlBoard, onSignOut), [token, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = usePolling(load, 30_000);
  const summary = board?.data?.summary;
  const grid = useRef<HTMLUListElement>(null);
  const columns = useColumns(grid, Boolean(board));
  const { mode, canUpdate, setMode } = useMode(token, role);
  const [notice, setNotice] = useState<ToastMessage>();
  // Flags, the group slide-over and item actions are for staff; team members watch the tiles.
  const moderator = role !== "collector";
  const form = isUpdateKey(detail) && isUpdateForm(detail) ? detail : undefined;
  const [filter, setFilter] = useState<IntakeFilter>("open");
  const [intakeGroup, setIntakeGroup] = useState("");
  const [intakeView, setIntakeView] = useState<"table" | "graph">("table");

  const published = useCallback(
    (title: string) => {
      setNotice({ tone: "ok", title: "Published", text: title });
      refresh();
      openDetail(undefined);
    },
    [refresh],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-title">Mission control</h1>
          {canUpdate && (
            <div className="w-48">
              <SegmentedControl
                label="Mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "watch", label: "Watch" },
                  { value: "update", label: "Update" },
                ]}
              />
            </div>
          )}
          {board && !board.live && <Badge tone="warn">Sample data</Badge>}
          <a href="#/audit" className="text-sm font-medium text-primary-ink hover:underline">
            Input audit
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {summary && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", summary.broken ? "bg-danger" : "bg-line-strong")} />
                {summary.broken} broken
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span aria-hidden className="size-2 rounded-full bg-ink-subtle" />
                {summary.stale} stale
              </span>
              {summary.flags ? <FlagPill count={summary.flags} /> : null}
              {summary.suggestions ? <SuggestionsPill count={summary.suggestions} /> : null}
            </>
          )}
          <LiveClock />
          <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} onClick={onSignOut}>
            {token ? "Sign out" : "Exit preview"}
          </Button>
        </div>
      </header>

      <Toast toast={notice} onClose={() => setNotice(undefined)} />

      {board?.data ? (
        <ul
          ref={grid}
          className="grid min-h-[50dvh] overflow-hidden rounded-card border-t border-l border-line"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(15rem, 100%), 1fr))" }}
        >
          {board.data.groups.map((g, i) => (
            <Tile
              key={g.key}
              group={g}
              now={Date.parse(board.data.generatedAt)}
              corners={wallCorners(i, board.data.groups.length, columns)}
              onOpen={mode === "watch" && moderator ? () => openDetail(g.key) : undefined}
              onFlags={mode === "update" && moderator ? () => setMode("watch") : undefined}
              updates={
                mode === "update" &&
                token && (
                  <TileUpdates
                    group={g}
                    token={token}
                    staff={moderator}
                    onDone={(title) => {
                      setNotice({ tone: "ok", title: "Done", text: title });
                      refresh();
                    }}
                    onError={(text) => setNotice({ tone: "danger", title: "That didn't work", text })}
                    onSignOut={onSignOut}
                  />
                )
              }
            />
          ))}
        </ul>
      ) : (
        <CardSkeleton />
      )}

      <div className="split [--main:34rem] [--side:18rem]">
        <IntakeTable
          token={token}
          moderator={moderator}
          version={version}
          groups={board?.data?.groups ?? []}
          filter={filter}
          group={intakeGroup}
          onFilter={setFilter}
          onGroup={setIntakeGroup}
          onChanged={refresh}
          onSignOut={onSignOut}
          suggestions={summary?.suggestions}
          className="split-main"
          header={
            <div className="w-40">
              <SegmentedControl
                label="View"
                value={intakeView}
                onChange={setIntakeView}
                options={[
                  { value: "table", label: "Table" },
                  { value: "graph", label: "Graph" },
                ]}
              />
            </div>
          }
        >
          {intakeView === "graph" ? (
            <Suspense
              fallback={
                <div className="p-4">
                  <Skeleton className="h-64" />
                </div>
              }
            >
              <IntakeGraph
                token={token}
                filter={filter}
                group={intakeGroup}
                version={version}
                onOpenGroup={moderator ? openDetail : undefined}
                onSignOut={onSignOut}
              />
            </Suspense>
          ) : undefined}
        </IntakeTable>
        <SourcesPanel token={token} version={version} onSignOut={onSignOut} className="split-side" />
      </div>

      {form ? (
        <UpdatePanel
          key={form}
          updateKey={form}
          categories={board?.data?.groups.find((g) => g.updates.includes(form))?.categories ?? []}
          token={token}
          role={role}
          onDone={published}
          onClose={close}
          onOpen={openDetail}
          onSignOut={onSignOut}
        />
      ) : (
        detail &&
        !isUpdateKey(detail) &&
        moderator && <GroupPanel key={detail} groupKey={detail} token={token} onClose={close} onSignOut={onSignOut} onChanged={refresh} />
      )}
    </div>
  );
}

/**
 * A tile. With `onOpen` its name is a button stretched over the whole tile (Watch mode, staff); with
 * `updates` the body shows those instead of the activity list (Update mode), so the name stays plain
 * text and the buttons can be clicked.
 */
function Tile({
  group: g,
  now,
  corners,
  onOpen,
  onFlags,
  updates,
}: {
  group: ControlGroup;
  now: number;
  corners: CSSProperties;
  onOpen: (() => void) | undefined;
  /** In Update mode, makes the flag pill a button that switches to Watch. */
  onFlags: (() => void) | undefined;
  updates: ReactNode;
}) {
  const red = g.health === "red";
  const gray = g.health === "gray";
  const age = g.lastUpdateAt ? `${span(now - Date.parse(g.lastUpdateAt))} ago` : "Nothing yet";
  const status = red ? "broken" : gray ? "stale" : "healthy";

  return (
    <li
      className={cn(
        "relative flex min-h-40 flex-col bg-surface shadow-[inset_-1px_-1px_0_var(--color-line)] transition-colors",
        onOpen && "hover:bg-surface-raised",
        red && "z-10 overflow-hidden outline-2 -outline-offset-2 outline-danger",
      )}
      // A red frame in one of the wall's corners follows that corner, instead of being clipped by it.
      style={red ? corners : undefined}
    >
      <div className={cn("flex items-center gap-2 px-3 py-2", red && "bg-danger-soft text-danger-ink")}>
        {g.health === "green" ? (
          <LiveDot tone="ok" />
        ) : (
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", red ? "bg-danger" : "bg-ink-subtle")} />
        )}
        <h2 className={cn("min-w-0 flex-1 truncate font-medium", gray && "text-ink-muted")}>
          {onOpen ? (
            // The button stretches over the whole tile, which keeps the activity list out of it.
            <button
              type="button"
              onClick={onOpen}
              className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
            >
              {g.label}
              <span className="sr-only">, {status}</span>
            </button>
          ) : (
            <>
              {g.label}
              <span className="sr-only">, {status}</span>
            </>
          )}
        </h2>
        {/* The age stays next to the flags. In Update mode the pill switches to Watch, where flags are reviewed. */}
        {g.flags && onFlags ? (
          <button type="button" onClick={onFlags} title="Switch to Watch to review flags" className="rounded-full">
            <FlagPill count={g.flags} />
          </button>
        ) : g.flags ? (
          <FlagPill count={g.flags} />
        ) : null}
        <span className={cn("shrink-0 font-mono text-xs", red ? "text-danger-ink" : "text-ink-muted")} title={g.lastUpdateAt ? `Last update ${clock(g.lastUpdateAt)}` : "No updates yet"}>
          {age}
        </span>
      </div>

      {updates || (
        <ul className={cn("flex-1 space-y-1 px-3 py-1 text-sm", gray ? "text-ink-subtle" : "text-ink-muted")}>
          {g.problems.map((p) => (
            <li key={p} className="flex items-center gap-1.5 font-medium text-danger-ink">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{p}</span>
            </li>
          ))}
          {g.activity.map((a, i) => (
            <li key={i} className={cn("flex gap-2", a.kind === "error" && "text-danger-ink")}>
              <time dateTime={a.at} className="shrink-0 font-mono text-xs leading-5 tabular-nums">
                {clock(a.at)}
              </time>
              <span className="truncate" title={a.text}>
                {a.text}
              </span>
            </li>
          ))}
          {!g.problems.length && !g.activity.length && <li className="italic">Nothing entered yet</li>}
        </ul>
      )}

      <div className="flex items-center gap-2 px-3 pt-1 pb-2.5 text-xs text-ink-subtle">
        <span className="shrink-0">Stale after {span(g.staleMinutes * 60_000)}</span>
        <IntakeBar intake={g.intake} />
      </div>
    </li>
  );
}

/** Update mode's tile body: a button per update, or where the data comes from when there are none. */
function TileUpdates({
  group: g,
  token,
  staff,
  onDone,
  onError,
  onSignOut,
}: {
  group: ControlGroup;
  token: string;
  staff: boolean;
  onDone: (text: string) => void;
  onError: (text: string) => void;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState<UpdateKey>();
  const keys = g.updates.filter((key) => staff || !isStaffOnly(key));

  async function run(key: UpdateKey, spec: Extract<UpdateSpec, { kind: "action" }>) {
    setBusy(key);
    try {
      onDone(await spec.run(token));
    } catch (err) {
      if (err instanceof TeamApiError && err.status === 401) onSignOut();
      else onError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  if (!keys.length) return <p className="flex-1 px-3 py-1 text-sm text-ink-muted italic">{g.about ?? "Nothing to update from here."}</p>;
  return (
    <ul className="flex flex-1 flex-wrap content-start gap-1.5 px-3 py-1">
      {keys.map((key) => {
        const spec = UPDATE_SPECS[key];
        const Icon = spec.icon;
        const icon = <Icon className="size-4" aria-hidden />;
        return (
          <li key={key}>
            {spec.kind === "action" ? (
              <Button size="sm" variant="secondary" icon={icon} loading={busy === key} onClick={() => void run(key, spec)}>
                {spec.label}
              </Button>
            ) : spec.kind === "link" ? (
              <a href={spec.href} className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink">
                {icon}
                {spec.label}
              </a>
            ) : (
              <Button size="sm" variant="secondary" icon={icon} onClick={() => openDetail(key)}>
                {spec.label}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Used / pending / dropped raw posts over the last 24h (§4.4). */
function IntakeBar({ intake: n }: { intake: ControlIntake }) {
  const label = n.in ? `24h intake: ${n.used} used, ${n.pending} pending, ${n.dropped} dropped` : "No intake in the last 24h";
  return (
    <div role="img" aria-label={label} title={label} className="flex h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
      {n.in > 0 && (
        <>
          <span className="bg-ok" style={{ width: `${(n.used / n.in) * 100}%` }} />
          <span className="bg-ink-subtle" style={{ width: `${(n.pending / n.in) * 100}%` }} />
          <span className="bg-line-strong" style={{ width: `${(n.dropped / n.in) * 100}%` }} />
        </>
      )}
    </div>
  );
}

function FlagPill({ count }: { count: number }) {
  return (
    <Badge tone="warn" icon={<Flag className="size-3.5" aria-hidden />}>
      {count} {count === 1 ? "flag" : "flags"}
    </Badge>
  );
}

/** Visitor suggestions wait on the team desk, not in the intake table, so the wall points there. */
function SuggestionsPill({ count }: { count: number }) {
  return (
    <a href="#/team/suggestions" className="rounded-full hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary">
      <Badge tone="warn" icon={<Inbox className="size-3.5" aria-hidden />}>
        {count} visitor {count === 1 ? "suggestion" : "suggestions"} to review
      </Badge>
    </a>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="font-mono text-sm tabular-nums" dateTime={now.toISOString()}>
      {now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" })}
    </time>
  );
}

/** How many columns the grid has right now; `auto-fill` picks it from the width. */
function useColumns(ref: RefObject<HTMLElement | null>, ready: boolean) {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, ready]);
  return columns;
}

/** Corner radii for tile `i` of `n` in a grid of `columns`: only the corners it shares with the wall. */
function wallCorners(i: number, n: number, columns: number): CSSProperties {
  const radius = "calc(var(--radius-card) - 1px)";
  const lastRowStart = Math.floor((n - 1) / columns) * columns;
  const row = { top: i < columns, bottom: i >= lastRowStart };
  // The wall's right edge is the last column; a short last row leaves its bottom-right corner empty.
  const right = i % columns === columns - 1;
  return {
    borderTopLeftRadius: row.top && i % columns === 0 ? radius : undefined,
    borderTopRightRadius: row.top && right ? radius : undefined,
    borderBottomLeftRadius: row.bottom && i === lastRowStart ? radius : undefined,
    borderBottomRightRadius: row.bottom && right ? radius : undefined,
  };
}
