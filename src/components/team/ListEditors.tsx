import { Archive, ArchiveRestore, ArrowDown, ArrowUp, CalendarPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { eventKindMeta } from "../../lib/categories";
import { dayStampOf, repeatProblem, runLabel } from "../../lib/occurrences";
import { addPlaceKind, usePlaceKinds } from "../../lib/placeKinds";
import { closedLabel, isClosedNow, whereLine } from "../../lib/places";
import { COMMUNITY_TOKEN, teamFetch, TeamApiError } from "../../lib/team";
import { clock, dayKey, dayLabel } from "../../lib/time";
import { EVENT_KINDS, MAX_EXTRA_VENUES, VENUE_ROLES, VENUE_ROLE_LABEL, type EventKind, type EventVenue, type LatLng, type TeamEvent, type TeamPlace } from "../../lib/types";
import { Alert, Badge, Button, CardSkeleton, cn, Combobox, EmptyState, Field, Input, SegmentedControl, Select, Textarea } from "../../ui";
import { AreaSelect, fromLocalInput, LinkField, linkError, TeamForm, TimeField, toLocalInput, useTeamList } from "./fields";
import { PinField } from "./PinField";
import { TopicPicker } from "./TopicPicker";

const statusBadge: Partial<Record<TeamEvent["status"], { label: string; tone: "warn" | "danger" | "ok" }>> = {
  delayed: { label: "New time", tone: "warn" },
  tba: { label: "Time to follow", tone: "warn" },
  ongoing: { label: "Started", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "danger" },
  done: { label: "Done", tone: "ok" },
};

/** The festival schedule: add, fix or remove events. Delays and cancellations go through the update form so they reach the feed. */
export function ScheduleEditor({ token }: { token: string }) {
  const { list, error, reload } = useTeamList<TeamEvent>("/api/team/events", token);
  const [editing, setEditing] = useState<TeamEvent | "new">();

  if (editing) {
    return (
      <EventEditor
        token={token}
        event={editing === "new" ? undefined : editing}
        onDone={() => {
          setEditing(undefined);
          reload();
        }}
        onCancel={() => setEditing(undefined)}
      />
    );
  }

  const days = new Map<string, TeamEvent[]>();
  for (const e of list ?? []) days.set(dayKey(e.startsAt), [...(days.get(dayKey(e.startsAt)) ?? []), e]);

  return (
    <div className="space-y-4">
      <Button icon={<CalendarPlus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>
        Add an event
      </Button>
      {error && <Alert tone="danger" title="Couldn't load the schedule">{error}</Alert>}
      {!list ? (
        !error && <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No events yet">
          Add the official schedule here. It replaces the sample schedule on the site.
        </EmptyState>
      ) : (
        [...days].map(([key, dayEvents]) => (
          <section key={key} aria-label={dayLabel(dayEvents[0].startsAt)}>
            <h2 className="sawali mb-2 rounded-control bg-surface-band px-3 py-1.5 text-sm font-semibold">{dayLabel(dayEvents[0].startsAt)}</h2>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
              {dayEvents.map((e) => {
                const badge = statusBadge[e.status];
                return (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{e.allDay ? "All day" : !e.timeKnown ? "TBA" : clock(e.startsAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      {e.repeatUntil && <p className="truncate text-sm text-ink-muted">{runLabel(e)}</p>}
                      <p className="truncate text-sm text-ink-muted">
                        {eventKindMeta[e.kind].label}
                        {e.venue && ` · ${e.venue}`}
                      </p>
                    </div>
                    {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(e)}>
                      Edit
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

interface EditorProps {
  token: string;
  /** Called with the event or place's name once it is saved or removed; a new place also passes its id. */
  onDone: (title: string, id?: string) => void;
  onCancel: () => void;
  /** Drop the card around the form, when it already sits in a panel. */
  bare?: boolean;
}

type Who = "festival" | "sponsor" | "other";
type Timing = "time" | "allDay" | "tba";

/** Preselects the answer to "Who's putting it on?" from what an event already stores. */
const whoOf = (e: TeamEvent): Who => (e.official ? "festival" : e.presentedBy && !e.organiser ? "sponsor" : "other");

const whoOptions: { value: Who; title: string; hint: string }[] = [
  { value: "festival", title: "The MassKara Festival", hint: "Part of the official programme." },
  { value: "sponsor", title: "A sponsor", hint: "A brand puts it on, like Coca-Cola." },
  { value: "other", title: "Someone else", hint: "A bar, a school, a music collective." },
];

/** The venues an event has besides its main one, added only when needed so a one-venue event is no slower to enter. */
function MoreVenues({ token, value, onChange }: { token: string; value: EventVenue[]; onChange: (v: EventVenue[]) => void }) {
  const set = (i: number, patch: Partial<EventVenue>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = (i: number, by: number) => {
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-ink">More venues</span>
          <p className="text-sm text-ink-muted">For a route, or an event that starts in one place and ends in another. Readers see them under the main venue, in this order.</p>
        </div>
      )}
      {value.map((v, i) => (
        <div key={i} className="space-y-3 rounded-card border border-line bg-surface-raised p-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label="What is it?">
              {(p) => (
                <Select {...p} value={v.role} onChange={(e) => set(i, { role: e.target.value as EventVenue["role"] })}>
                  {VENUE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {VENUE_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Place">{(p) => <Input {...p} maxLength={120} placeholder="Paglaum Stadium" value={v.venue} onChange={(e) => set(i, { venue: e.target.value })} />}</Field>
          </div>
          <AreaSelect token={token} value={v.area ?? ""} onChange={(area) => set(i, { area: area || null })} optional />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" icon={<ArrowUp className="size-4" aria-hidden />} disabled={i === 0} onClick={() => move(i, -1)}>
              Move up
            </Button>
            <Button size="sm" variant="ghost" icon={<ArrowDown className="size-4" aria-hidden />} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
              Move down
            </Button>
            <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      {value.length < MAX_EXTRA_VENUES && (
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...value, { venue: "", area: null, role: value.length ? "other" : "route" }])}>
          {value.length ? "Add another venue" : "Add more venues (a route, where it ends)"}
        </Button>
      )}
    </div>
  );
}

/**
 * Adds an event, or edits `event`. One form for every event people show up to: who is putting it on is a
 * question here, not a separate button. A new event is also posted to the feed.
 */
export function EventEditor({ token, event, onDone, onCancel, bare }: EditorProps & { event?: TeamEvent }) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind | "">(event?.kind ?? "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [area, setArea] = useState(event?.area ?? "");
  // A datetime-local value; for an all-day or time-to-follow event only its date counts and the time is 00:00.
  const [start, setStart] = useState(event ? toLocalInput(event.startsAt) : "");
  const [end, setEnd] = useState(event?.endsAt ? toLocalInput(event.endsAt) : "");
  const [timing, setTiming] = useState<Timing>(event?.allDay ? "allDay" : event && !event.timeKnown ? "tba" : "time");
  const [note, setNote] = useState(event?.note ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [link, setLink] = useState(event?.url ?? "");
  const [sourceNote, setSourceNote] = useState(event?.sourceNote ?? "");
  const [who, setWho] = useState<Who | "">(event ? whoOf(event) : "");
  const [organiser, setOrganiser] = useState(event?.organiser ?? "");
  const [presentedBy, setPresentedBy] = useState(event?.presentedBy ?? "");
  const [topics, setTopics] = useState(event?.topics ?? []);
  // The last day of a daily event ("" for a single one), and the days called off, which can be brought back here.
  const [repeatUntil, setRepeatUntil] = useState(event?.repeatUntil ?? "");
  const [skipDates, setSkipDates] = useState(event?.skipDates ?? []);
  const [venues, setVenues] = useState<EventVenue[]>(event?.venues ?? []);
  const [errors, setErrors] = useState<{ venues?: string; title?: string; kind?: string; who?: string; credit?: string; start?: string; end?: string; link?: string; topics?: string; repeatUntil?: string }>({});
  const dateOnly = timing !== "time";

  function pickTiming(next: Timing) {
    // A date alone is stored as midnight, which isn't a start time: going back to a time asks for one.
    if (timing !== "time" && next === "time") setStart("");
    if (next !== "time") {
      setStart((v) => (v ? `${v.slice(0, 10)}T00:00` : v));
      setEnd("");
    }
    setTiming(next);
  }

  async function remove() {
    if (!event || !confirm(`Remove "${event.title}" from the schedule?`)) return;
    await teamFetch(`/api/team/events/${event.id}`, token, { method: "DELETE" });
    onDone(event.title);
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={event ? "Save event" : "Add event"}
      extra={
        <>
          {event && (
            <Button variant="ghost" size="lg" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
              Remove
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
      send={async () => {
        const next = {
          title: title.trim() ? undefined : "Name the event.",
          kind: kind ? undefined : "Pick what kind of event it is.",
          who: who ? undefined : "Say who is putting it on.",
          credit:
            who === "sponsor" && !presentedBy.trim() ? "Name the sponsor." : who === "other" && !organiser.trim() ? "Name who is organising it." : undefined,
          start: fromLocalInput(start) ? undefined : dateOnly ? "Pick the date." : "Pick when it starts.",
          end: end && start && end < start ? "The end is before the start." : undefined,
          repeatUntil: repeatUntil && fromLocalInput(start) ? (repeatProblem(fromLocalInput(start)!, repeatUntil) ?? undefined) : undefined,
          venues: venues.some((v) => !v.venue.trim()) ? "Name each extra venue, or remove the empty one." : undefined,
          link: linkError(link),
          topics: topics.length ? undefined : "Pick at least one topic.",
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const body = {
          topics,
          title: title.trim(),
          kind,
          venue: venue.trim() || null,
          area: area || null,
          venues: venues.map((v) => ({ venue: v.venue.trim(), area: v.area || null, role: v.role })),
          startsAt: fromLocalInput(start),
          endsAt: dateOnly ? null : (fromLocalInput(end) ?? null),
          allDay: timing === "allDay",
          timeKnown: timing !== "tba",
          repeatUntil: repeatUntil || null,
          ...(repeatUntil && { skipDates }),
          note: note.trim() || null,
          sourceNote: sourceNote.trim() || null,
          description: description.trim() || null,
          url: link.trim() || null,
          official: who === "festival",
          organiser: who === "other" ? organiser.trim() : null,
          presentedBy: who === "other" ? null : presentedBy.trim() || null,
          ...(!event && { announce: true }),
        };
        await teamFetch(event ? `/api/team/events/${event.id}` : "/api/team/events", token, { method: event ? "PUT" : "POST", body });
        onDone(body.title);
      }}
    >
      {!event && <p className="text-sm text-ink-muted">If people show up at a set time, it's an event. It goes on the schedule and in the feed.</p>}
      <Field label="Event" error={errors.title}>
        {(p) => <Input {...p} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-ink">Who's putting it on?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {whoOptions.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-card border p-3 text-sm",
                who === o.value ? "border-primary bg-surface-band" : "border-line bg-surface-raised hover:bg-surface-band",
              )}
            >
              <input type="radio" name="who" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={who === o.value} onChange={() => setWho(o.value)} />
              <span>
                <span className="block font-medium">{o.title}</span>
                <span className="block text-ink-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.who && <p className="text-sm text-danger-ink">{errors.who}</p>}
        {who === "festival" && (
          <Field label="Presented by (optional)" hint="A sponsor of this city event, like Coca-Cola.">
            {(p) => <Input {...p} maxLength={120} value={presentedBy} onChange={(e) => setPresentedBy(e.target.value)} />}
          </Field>
        )}
        {who === "sponsor" && (
          <Field label="Presented by" hint="The sponsor, like Coca-Cola." error={errors.credit}>
            {(p) => <Input {...p} maxLength={120} value={presentedBy} onChange={(e) => setPresentedBy(e.target.value)} />}
          </Field>
        )}
        {who === "other" && (
          <Field label="Organiser" hint="A bar, a school, a music collective. Shows with a Community badge." error={errors.credit}>
            {(p) => <Input {...p} maxLength={120} value={organiser} onChange={(e) => setOrganiser(e.target.value)} />}
          </Field>
        )}
      </fieldset>
      <TopicPicker token={token} value={topics} onChange={setTopics} text={`${title}\n${description}\n${note}`} required error={errors.topics} />
      <Field label="Kind" error={errors.kind}>
        {(p) => (
          <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            <option value="">Pick a kind</option>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {eventKindMeta[k].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">When?</span>
        <SegmentedControl
          label="When"
          value={timing}
          onChange={pickTiming}
          options={[
            { value: "time", label: "At a time" },
            { value: "allDay", label: "All day" },
            { value: "tba", label: "Time TBA" },
          ]}
        />
        <p className="text-sm text-ink-muted">
          {timing === "allDay" ? "Readers see “All day”, like a market that runs all day." : timing === "tba" ? "Readers see “Time to follow”. Set the time later with Delay, or edit the event." : "Times are Bacolod time."}
        </p>
      </div>
      {dateOnly ? (
        <Field label="Date" error={errors.start}>
          {(p) => <Input {...p} type="date" value={start.slice(0, 10)} onChange={(e) => setStart(e.target.value ? `${e.target.value}T00:00` : "")} />}
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField label="Starts" hint="" value={start} onChange={setStart} error={errors.start} />
          <TimeField label="Ends (optional)" hint="" value={end} onChange={setEnd} error={errors.end} />
        </div>
      )}
      <Field
        label="Repeats every day until (optional)"
        hint="For a food fest, a nightly party or a booth that runs several days: the hours above repeat each day through this one."
        error={errors.repeatUntil}
      >
        {(p) => <Input {...p} type="date" min={start.slice(0, 10)} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />}
      </Field>
      {repeatUntil && fromLocalInput(start) && !repeatProblem(fromLocalInput(start)!, repeatUntil) && (
        <p className="text-sm text-ink-muted">
          Readers will see it on every day of the run: {runLabel({ startsAt: fromLocalInput(start)!, endsAt: dateOnly ? null : (fromLocalInput(end) ?? null), allDay: timing === "allDay", timeKnown: timing !== "tba", repeatUntil })}.
        </p>
      )}
      {repeatUntil && skipDates.length > 0 && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-ink">Days called off</span>
          <ul className="flex flex-wrap gap-2">
            {skipDates.map((d) => (
              <li key={d} className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-surface-raised py-1 pr-1 pl-3 text-sm">
                {dayStampOf(d)}
                <Button variant="ghost" size="sm" onClick={() => setSkipDates(skipDates.filter((x) => x !== d))}>
                  Bring back
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">Save the event to put these days back on the schedule.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Venue">{(p) => <Input {...p} maxLength={120} placeholder="Panaad Stadium" value={venue} onChange={(e) => setVenue(e.target.value)} />}</Field>
        <AreaSelect token={token} value={area} onChange={setArea} optional />
      </div>
      <MoreVenues token={token} value={venues} onChange={setVenues} />
      {errors.venues && <p className="text-sm text-danger-ink">{errors.venues}</p>}
      <Field label="Description (optional)" hint="What it is: who's performing, prizes, how to join. Shown on the schedule.">
        {(p) => <Textarea {...p} rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <Field label="Short note (optional)" hint="Readers see this under the event, e.g. “Gates open 1 PM”. Delays and venue changes replace it.">
        {(p) => <Input {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <LinkField value={link} onChange={setLink} error={errors.link} />
      <Field label="Team note (optional)" hint="Where this came from and anything you're unsure of. Only the team sees it.">
        {(p) => <Textarea {...p} rows={2} maxLength={500} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} />}
      </Field>
    </TeamForm>
  );
}

/** The body the places API takes for a place as listed, so one field (archived) can change on its own. */
const bodyOf = (p: TeamPlace) => ({ kind: p.kind.key, title: p.title, place: p.place, area: p.area, hours: p.hours, note: p.note, url: p.url, active: p.active, topics: p.topics });

/** Archives a place after a confirm, or restores it. Returns whether it changed. */
async function setArchived(token: string, p: TeamPlace, archived: boolean) {
  if (archived && !confirm(`Archive "${p.title}"? It leaves Around, the pickers and search for good. You can restore it from Show archived.`)) return false;
  await teamFetch(`/api/team/places/${p.id}`, token, { method: "PUT", body: { ...bodyOf(p), archived } });
  return true;
}

/** Around places: promos, rides, thrift, food and kiosks. */
export function PlacesEditor({ token }: { token: string }) {
  const [showArchived, setShowArchived] = useState(false);
  const team = token !== COMMUNITY_TOKEN;
  const { list, error, reload } = useTeamList<TeamPlace>(`/api/team/places${showArchived && team ? "?archived=1" : ""}`, token);
  const [editing, setEditing] = useState<TeamPlace | "new">();
  const [failure, setFailure] = useState<string>();

  async function toggleArchived(p: TeamPlace) {
    setFailure(undefined);
    try {
      if (await setArchived(token, p, !p.archivedAt)) reload();
    } catch (err) {
      setFailure(err instanceof TeamApiError ? err.message : "Couldn't do that. Try again.");
    }
  }

  if (editing) {
    return (
      <PlaceEditor
        token={token}
        place={editing === "new" ? undefined : editing}
        onDone={() => {
          setEditing(undefined);
          reload();
        }}
        onCancel={() => setEditing(undefined)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>
          Add a place
        </Button>
        {team && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        )}
      </div>
      {error && <Alert tone="danger" title="Couldn't load places">{error}</Alert>}
      {failure && <Alert tone="danger" title="Nothing changed">{failure}</Alert>}
      {!list ? (
        !error && <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={Plus} title="No places yet">
          Add promos, rides, thrift markets, food and kiosks, and services like restrooms, first aid and ATMs. They replace the sample list on the Around page.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <div className={cn("min-w-0 flex-1", p.archivedAt && "opacity-70")}>
                <p className="truncate font-medium">{p.title}</p>
                <p className="truncate text-sm text-ink-muted">
                  {p.kind.name} · {whereLine(p.place, p.area)}
                  {p.hours && ` · ${p.hours}`}
                </p>
              </div>
              {p.archivedAt ? <Badge>Archived</Badge> : isClosedNow(p.closedUntil) ? <Badge tone="warn">{closedLabel(p.closedUntil!)}</Badge> : !p.active && <Badge>Hidden</Badge>}
              {!p.archivedAt && (
                <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(p)}>
                  Edit
                </Button>
              )}
              {team && (
                <Button variant="ghost" size="sm" icon={p.archivedAt ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />} onClick={() => void toggleArchived(p)}>
                  {p.archivedAt ? "Restore" : "Archive"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Adds a place, or edits `place`. A new place starts as `initialKind` (a kind key), or with no kind picked. */
export function PlaceEditor({ token, place, onDone, onCancel, bare, initialKind }: EditorProps & { place?: TeamPlace; initialKind?: string }) {
  const kinds = usePlaceKinds(token);
  const [kind, setKind] = useState(place?.kind.key ?? initialKind ?? "");
  // Until the kinds load, an edited place still shows its own.
  const kindName = kinds.find((k) => k.key === kind)?.name ?? (place?.kind.key === kind ? place.kind.name : "");
  const [title, setTitle] = useState(place?.title ?? "");
  const [where, setWhere] = useState(place?.place ?? "");
  const [area, setArea] = useState(place?.area ?? "");
  const [hours, setHours] = useState(place?.hours ?? "");
  const [note, setNote] = useState(place?.note ?? "");
  const [link, setLink] = useState(place?.url ?? "");
  const [active, setActive] = useState(place?.active ?? true);
  const [closedUntil, setClosedUntil] = useState(place?.closedUntil && isClosedNow(place.closedUntil) ? toLocalInput(place.closedUntil) : "");
  const [pin, setPin] = useState<LatLng | null>(place?.pin ?? null);
  const [topics, setTopics] = useState(place?.topics ?? []);
  const [errors, setErrors] = useState<{ kind?: string; title?: string; where?: string; link?: string; topics?: string; closed?: string }>({});

  async function archive() {
    if (!place || !(await setArchived(token, place, true))) return;
    onDone(place.title);
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={place ? "Save place" : "Add place"}
      extra={
        <>
          {place && token !== COMMUNITY_TOKEN && (
            <Button variant="ghost" size="lg" icon={<Archive className="size-4" aria-hidden />} onClick={() => void archive()}>
              Archive
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
      send={async () => {
        const next = { kind: kind ? undefined : "What kind of place is it?", title: title.trim() ? undefined : "Give it a name.", where: where.trim() ? undefined : "Where do people find it?", link: linkError(link), topics: topics.length ? undefined : "Pick at least one topic.", closed: closedUntil && !fromLocalInput(closedUntil) ? "That isn't a time." : undefined };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const body = { kind, title: title.trim(), place: where.trim(), area: area || null, hours: hours.trim() || null, note: note.trim() || null, url: link.trim() || null, active, closedUntil: fromLocalInput(closedUntil) ?? null, pin, topics };
        const saved = await teamFetch<{ id?: string }>(place ? `/api/team/places/${place.id}` : "/api/team/places", token, { method: place ? "PUT" : "POST", body });
        onDone(body.title, place ? undefined : saved?.id);
      }}
    >
      {!place && <p className="text-sm text-ink-muted">A spot people can go to. It shows on the Around page with a map pin. For a one-off deal or announcement, post it to the feed instead.</p>}
      <Field label="Kind" hint="Search, or add one that isn't listed. Restrooms, first aid, police desks and ATMs show under Services on Around." error={errors.kind}>
        {(p) => (
          <Combobox
            {...p}
            value={kindName}
            options={kinds.map((k) => k.name)}
            aliases={Object.fromEntries(kinds.map((k) => [k.name, k.aliases]))}
            onChange={(name) => setKind(kinds.find((k) => k.name === name)?.key ?? "")}
            onCreate={async (name) => {
              try {
                return (await addPlaceKind(token, name)).name;
              } catch (err) {
                throw new Error(err instanceof TeamApiError ? err.message : "Couldn't add the kind. Try again.");
              }
            }}
            placeholder="Search or add a kind: food, restroom, ATM…"
          />
        )}
      </Field>
      <Field label="Name" hint="e.g. “Piaya kiosk”" error={errors.title}>
        {(p) => <Input {...p} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <TopicPicker token={token} value={topics} onChange={setTopics} text={`${title}\n${kindName}\n${note}`} required error={errors.topics} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where" hint="As people say it: “Public Plaza, near the stage”" error={errors.where}>
          {(p) => <Input {...p} maxLength={160} value={where} onChange={(e) => setWhere(e.target.value)} />}
        </Field>
        <AreaSelect token={token} value={area} onChange={setArea} optional />
      </div>
      <PinField value={pin} onChange={setPin} />
      <Field label="Hours (optional)">{(p) => <Input {...p} maxLength={80} placeholder="4 PM – midnight" value={hours} onChange={(e) => setHours(e.target.value)} />}</Field>
      <Field label="Note (optional)" hint="Anything else visitors should know, like site hours that differ from show times.">
        {(p) => <Textarea {...p} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <LinkField value={link} onChange={setLink} error={errors.link} />
      <div className="space-y-2">
        <TimeField label="Temporarily closed until (optional)" hint="Bacolod time. The card stays on Around, marked closed until then. Clear it to reopen now." value={closedUntil} onChange={setClosedUntil} error={errors.closed} />
        {closedUntil && (
          <Button variant="ghost" size="sm" onClick={() => setClosedUntil("")}>
            Reopen now
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Show on the Around page
      </label>
    </TeamForm>
  );
}
