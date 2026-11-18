import { ArrowLeft, CalendarClock, CalendarDays, Car, ExternalLink, Eye, EyeOff, HandHeart, Lightbulb, LogOut, Megaphone, Shapes, Store, Tags, Trophy, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { categoryMeta } from "../../lib/categories";
import { teamFetch, TeamApiError, useTeamSession } from "../../lib/team";
import { timeAgo } from "../../lib/time";
import type { TeamEvent, TeamRecent } from "../../lib/types";
import { Alert, Badge, Button, CardSkeleton, cn } from "../../ui";
import { useTeamList } from "./fields";
import { GuideEditor } from "./GuideEditor";
import { PlacesEditor, ScheduleEditor } from "./ListEditors";
import { SuggestionsView } from "./SuggestionsView";
import { TeamSignIn } from "./TeamSignIn";
import { PlaceKindsEditor } from "./PlaceKindsEditor";
import { TopicsEditor } from "./TopicsEditor";
import { CrowdForm, EventChangeForm, NoticeForm, TrafficForm, WinnersForm } from "./UpdateForms";

const actions: Array<{ id: string; title: string; hint: string; icon: LucideIcon; staffOnly?: boolean }> = [
  { id: "traffic", title: "Traffic", hint: "How busy, closed or reopened, advisories", icon: Car },
  { id: "crowd", title: "Crowd level", hint: "How crowded a place is: quiet, busy, packed", icon: Users },
  { id: "event", title: "Event change", hint: "New time or day, venue, cancelled", icon: CalendarClock },
  { id: "winners", title: "Winners", hint: "Contest results", icon: Trophy },
  { id: "notice", title: "Announcement", hint: "Safety, weather, raffles, news", icon: Megaphone },
  { id: "schedule", title: "Schedule", hint: "Add or fix events", icon: CalendarDays },
  { id: "places", title: "Around places", hint: "Promos, rides, food, kiosks", icon: Store },
  { id: "tips", title: "Visitor guide", hint: "Sections and tips for visitors", icon: Lightbulb },
  { id: "suggestions", title: "Visitor suggestions", hint: "Check what visitors sent from the Contribute page", icon: HandHeart },
  { id: "kinds", title: "Place kinds", hint: "Names, icons and other names for kinds of place; merge duplicates", icon: Shapes, staffOnly: true },
  { id: "topics", title: "Topics", hint: "What visitors follow, and the names people use", icon: Tags, staffOnly: true },
];

/**
 * The team desk at `#/team`: the monitoring team enters festival data directly, by type,
 * with an optional link to where they saw it. Entries publish straight away.
 */
export function TeamDesk({ section, onSection }: { section: string | undefined; onSection: (section: string | undefined) => void }) {
  const { token, name, role, signIn, signOut } = useTeamSession();

  if (!token) {
    return (
      <TeamSignIn title="Team desk" onToken={signIn}>
        Post closures, traffic, schedule changes, winners and announcements for Better Maskara. Paste the token the site owner gave you to start.
      </TeamSignIn>
    );
  }
  return <Desk token={token} name={name} staff={role === "staff"} section={section} onSection={onSection} onSignOut={signOut} />;
}

function Desk({ token, name, staff, section, onSection, onSignOut }: { token: string; name: string | undefined; staff: boolean; section: string | undefined; onSection: (s: string | undefined) => void; onSignOut: () => void }) {
  const [posted, setPosted] = useState<string>();
  // How many visitor suggestions are waiting, shown on the desk's tile so they don't sit unseen.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    teamFetch<unknown[]>("/api/community/review?status=pending", token)
      .then((list) => setWaiting(list.length))
      .catch(() => undefined);
  }, [token, section]);
  const events = useTeamList<TeamEvent>("/api/team/events", token);
  const action = actions.find((a) => a.id === section && (staff || !a.staffOnly));

  // The schedule may have changed in another section, so pickers always start from the latest list.
  const reloadEvents = events.reload;
  useEffect(() => reloadEvents(), [section]); // eslint-disable-line react-hooks/exhaustive-deps


  function done(title: string) {
    setPosted(title);
    events.reload();
    onSection(undefined);
  }

  const formProps = { token, onDone: done, staff };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">Team desk{name && ` · ${name}`}</p>
          <h1 className="mt-1 font-display text-hero">{action?.title ?? "What's the update?"}</h1>
        </div>
        {action ? (
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => onSection(undefined)}>
            Back
          </Button>
        ) : (
          <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} onClick={onSignOut}>
            Sign out
          </Button>
        )}
      </header>

      {!action && posted && (
        <Alert tone="ok" title="Published">
          {posted}
        </Alert>
      )}

      {section === "traffic" || section === "advisory" ? (
        <TrafficForm {...formProps} />
      ) : section === "crowd" ? (
        <CrowdForm {...formProps} />
      ) : section === "event" ? (
        <EventChangeForm token={token} staff={staff} events={events.list} onDone={done} onAddEvents={() => onSection("schedule")} />
      ) : section === "winners" ? (
        <WinnersForm token={token} staff={staff} events={events.list ?? []} onDone={done} />
      ) : section === "notice" ? (
        <NoticeForm {...formProps} />
      ) : section === "schedule" ? (
        <ScheduleEditor token={token} />
      ) : section === "places" ? (
        <PlacesEditor token={token} />
      ) : section === "tips" ? (
        <GuideEditor token={token} />
      ) : section === "suggestions" ? (
        <SuggestionsView token={token} staff={staff} onCount={setWaiting} />
      ) : section === "kinds" && staff ? (
        <PlaceKindsEditor token={token} />
      ) : section === "topics" && staff ? (
        <TopicsEditor token={token} />
      ) : (
        <>
          <ul className="auto-grid [--gap:0.75rem] [--min:14rem]">
            {actions.filter((a) => staff || !a.staffOnly).map(({ id, title, hint, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    setPosted(undefined);
                    onSection(id);
                  }}
                  className="flex h-full w-full items-center gap-3 rounded-card border border-line bg-surface-raised p-3.5 text-left shadow-card transition duration-150 ease-out-quint hover:border-line-strong active:scale-[0.99]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {title}
                      {id === "suggestions" && waiting > 0 && (
                        <Badge tone="warn" className="ml-2 align-middle">
                          {waiting} waiting
                        </Badge>
                      )}
                    </span>
                    <span className="block text-sm text-ink-muted">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Recent token={token} refreshKey={posted} />
        </>
      )}
    </div>
  );
}

/** The team's latest entries, so a mistake can be taken down fast. */
function Recent({ token, refreshKey }: { token: string; refreshKey: string | undefined }) {
  const [items, setItems] = useState<TeamRecent[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    teamFetch<TeamRecent[]>("/api/team/recent", token)
      .then(setItems)
      .catch((err) => setError(err instanceof TeamApiError ? err.message : "Couldn't load recent updates."));
  }, [token, refreshKey]);

  async function toggle(item: TeamRecent) {
    const status = item.status === "hidden" ? "published" : "hidden";
    try {
      await teamFetch(`/api/team/items/${item.id}`, token, { method: "PATCH", body: { status } });
      setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, status } : i)));
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Couldn't change it. Try again.");
    }
  }

  return (
    <section aria-labelledby="recent-title" className="space-y-3">
      <h2 id="recent-title" className="font-display text-title">
        Recent updates
      </h2>
      {error && <Alert tone="danger" title="Something went wrong">{error}</Alert>}
      {!items ? (
        !error && <CardSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing posted from the team desk yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {items.map((item) => {
            const meta = categoryMeta[item.category];
            const hidden = item.status === "hidden";
            return (
              <li key={item.id} className={cn("flex items-center gap-3 p-3", hidden && "opacity-60")}>
                <meta.icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", hidden && "line-through")}>{item.title}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {meta.label} · {item.by ?? "Team"} · {timeAgo(item.publishedAt)}
                    {item.url && (
                      <>
                        {" · "}
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary-ink hover:underline">
                          source <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {hidden && <Badge>Hidden</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
                  onClick={() => void toggle(item)}
                >
                  {hidden ? "Show" : "Hide"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
