import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { CROWD_LEVELS, crowdHint, crowdLabel, type CrowdLevel } from "../../lib/crowd";
import { categoryMeta } from "../../lib/categories";
import { whereLine } from "../../lib/places";
import { COMMUNITY_TOKEN, teamFetch } from "../../lib/team";
import { manilaMidnight } from "../../lib/eventPhase";
import { closureTitle } from "../../lib/retime";
import { clock, dayKey, dayLabel, dayStamp, extendedUntil, formerWhen, movedToDay, startsEarlier } from "../../lib/time";
import { dailyLine } from "../../lib/dailyWindow";
import { allOccurrences, dayStampOf, focusOccurrence, fromWhen, nightsLeft, occurrenceNear, type Occurrence } from "../../lib/occurrences";
import { NOTICE_CATEGORIES, PROMO_KIND, type ClosureExtent, type TeamEvent, type TeamPlace, type ResultStage, type TeamResult, type TeamUpdate } from "../../lib/types";
import { Alert, Button, Combobox, Field, Input, SegmentedControl, Select, Textarea } from "../../ui";
import { useAnnounce, type Announce } from "./announce";
import { AreaChips, AreaSelect, fromLocalInput, LinkField, linkError, TeamForm, TimeField, toLocalInput, useTeamList } from "./fields";
import { PlaceEditor } from "./ListEditors";
import { TopicPicker } from "./TopicPicker";

export interface FormProps {
  token: string;
  /** Called with the published headline once the update is saved. */
  onDone: (title: string) => void;
  /** Drop the card around the form, when it already sits in a panel. */
  bare?: boolean;
}

async function post(token: string, update: TeamUpdate) {
  return teamFetch<{ ids: string[]; title: string }>("/api/team/updates", token, { method: "POST", body: update });
}

const url = (v: string) => v.trim() || undefined;
/** A datetime-local value as a Date, or undefined while it is empty. */
const fromDate = (v: string) => {
  const iso = fromLocalInput(v);
  return iso ? new Date(iso) : undefined;
};

// Everything about a road in one form, so nobody has to choose between forms first: how busy it is (for
// the map), a closure (which can be scheduled), or an advisory (reroutes, no parking, what to avoid).

type TrafficKind = "level" | "closed" | "advisory";

/** `staff` offers the hero banner when announcing. */
export function TrafficForm({ token, onDone, bare, staff }: FormProps & { staff?: boolean }) {
  const [roads, setRoads] = useState<string[]>([]);
  const [kind, setKind] = useState<TrafficKind>("level");
  const [level, setLevel] = useState<"clear" | "moderate" | "heavy">("heavy");
  const [extent, setExtent] = useState<ClosureExtent>("full");
  const [lanes, setLanes] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  // Daily hours of a closure ("HH:MM"), offered once From and Until fall on different days.
  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");
  const [errors, setErrors] = useState<{ roads?: string; until?: string; link?: string; daily?: string }>({});
  const timed = kind !== "level";
  const multiDay = kind === "closed" && !!from && !!until && from.slice(0, 10) < until.slice(0, 10);
  const mins = (hhmm: string) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : undefined);
  const daily = multiDay ? { from: mins(dailyFrom), to: mins(dailyTo) } : { from: undefined, to: undefined };
  const ann = useAnnounce(staff, "feed", token === COMMUNITY_TOKEN);
  // Closures and advisories are always posts; a level only makes one when it reopens a road or is heavy.
  const announceable = kind !== "level" || level === "clear" || level === "heavy";
  const loud = announceable && ann.loud;
  // Roads closed right now, so a picked one can be reopened in one tap. Only from the live API, never the sample.
  const [closed, setClosed] = useState<Array<{ area: string; partly: boolean; daily?: boolean }>>([]);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string>();
  useEffect(() => {
    void Promise.all([api.traffic(), api.feed()]).then(([t, f]) => {
      if (!t.live) return;
      // A daily closure outside its hours reads open, but it is still there to end.
      const dailyRoads = new Set(f.data.filter((i) => i.category === "road_closure" && i.dailyFrom != null && i.area).map((i) => i.area!));
      const now = t.data.filter((a) => a.level === "closed" || a.level === "partial").map((a) => ({ area: a.area, partly: a.level === "partial", daily: dailyRoads.has(a.area) }));
      const more = [...dailyRoads].filter((r) => !now.some((c) => c.area === r)).map((area) => ({ area, partly: false, daily: true }));
      setClosed([...now, ...more]);
    });
  }, []);
  const closedPicked = roads.filter((r) => closed.some((c) => c.area === r));
  const dailyPicked = closedPicked.filter((r) => closed.find((c) => c.area === r)?.daily);
  const partly = kind === "closed" && extent === "partial";

  // Reopening is the Clear level, which the server turns into a "Reopened" post and ends the closure.
  async function reopen() {
    setReopening(true);
    setReopenError(undefined);
    try {
      const res = await post(token, { type: "traffic", areas: closedPicked, level: "clear" });
      onDone(res.title);
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Couldn't reopen it. Try again.");
    } finally {
      setReopening(false);
    }
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={kind === "closed" ? "Close the road" : kind === "advisory" ? "Publish advisory" : level === "clear" ? "Mark clear" : "Update the map"}
      send={async () => {
        const next = {
          roads: roads.length ? undefined : "Pick at least one road or area.",
          until: (loud && ann.check(until).until) || (timed && from && until && until < from ? "The end is before the start." : undefined),
          daily: (daily.from === undefined) !== (daily.to === undefined) ? "Pick both times, or neither." : daily.from !== undefined && daily.from === daily.to ? "The two times are the same." : undefined,
          link: linkError(link),
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        if (loud && ann.check(until).blocked) return false;
        const common = { areas: roads, note: note.trim() || undefined, url: url(link) };
        const times = { startsAt: fromLocalInput(from), endsAt: fromLocalInput(until) };
        const tier = loud ? { tier: ann.tier } : {};
        const res = await post(
          token,
          kind === "advisory"
            ? { type: "advisory", ...common, ...times, ...tier }
            : { type: "traffic", ...common, level: kind === "closed" ? "closed" : level, ...(partly ? { extent, ...(lanes.trim() && { lanes: lanes.trim() }) } : {}), ...(daily.from !== undefined ? { dailyFrom: daily.from, dailyTo: daily.to } : {}), ...(timed ? times : loud ? { endsAt: times.endsAt } : {}), ...tier },
        );
        onDone(res.title);
      }}
    >
      <AreaChips token={token} value={roads} onChange={setRoads} error={errors.roads} />
      {closedPicked.length > 0 && (
        <Alert tone="warn" title={`Closed now: ${closedPicked.map((r) => (closed.find((c) => c.area === r)?.partly ? `${r} (partly)` : r)).join(", ")}`}>
          <Button className="mt-2" size="sm" variant="secondary" loading={reopening} onClick={() => void reopen()}>
            {dailyPicked.length ? `Reopens ${closedPicked.join(", ")} and ends the daily closure` : "Reopen now"}
          </Button>
          {reopenError && <p className="mt-1 text-sm text-danger-ink">{reopenError}</p>}
        </Alert>
      )}
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">What's happening?</span>
        <SegmentedControl
          label="What's happening"
          value={kind}
          onChange={setKind}
          options={[
            { value: "level", label: "Traffic" },
            { value: "closed", label: "Closed" },
            { value: "advisory", label: "Advisory" },
          ]}
        />
        <p className="text-sm text-ink-muted">
          {kind === "closed"
            ? partly
              ? "Part of the road is shut and some cars get through. Shows on the map as partly closed until the end time. To reopen it early, pick the road and tap Reopen now."
              : "No cars through. Stays on the map until the end time. To reopen it early, pick the road and tap Reopen now."
            : kind === "advisory"
              ? "A heads-up for the feed: reroutes, no parking, what to avoid. Doesn't change the road's color on the map."
              : "How busy the road is right now, for the map."}
        </p>
      </div>
      {kind === "closed" && (
        <>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink">How much of the road?</span>
            <SegmentedControl
              label="How much of the road"
              value={extent}
              onChange={setExtent}
              options={[
                { value: "full", label: "Whole road" },
                { value: "partial", label: "Partly closed (one lane or one side)" },
              ]}
            />
          </div>
          {partly && (
            <Field label="Which lanes? (optional)" hint="Readers see it first in the details: “northbound lanes”, “one lane open”.">
              {(p) => <Input {...p} maxLength={120} value={lanes} onChange={(e) => setLanes(e.target.value)} />}
            </Field>
          )}
          {multiDay && (
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink">Every day between (optional)</span>
              <div className="grid max-w-md grid-cols-2 gap-4">
                <Field label="From" error={errors.daily}>
                  {(p) => <Input {...p} type="time" value={dailyFrom} onChange={(e) => setDailyFrom(e.target.value)} />}
                </Field>
                <Field label="To">{(p) => <Input {...p} type="time" value={dailyTo} onChange={(e) => setDailyTo(e.target.value)} />}</Field>
              </div>
              <p className="text-sm text-ink-muted">Closed only in these hours each day, like streets shut every night. A time before the first means it runs past midnight. Empty means closed all day. Bacolod time.</p>
            </div>
          )}
          <p className="text-sm text-ink-muted">
            Readers see: <span className="font-medium text-ink">{closureTitle(roads[0] ?? "Lacson St", fromDate(from), fromDate(until), extent, daily.from !== undefined && daily.to !== undefined && daily.from !== daily.to ? { from: daily.from, to: daily.to } : null)}</span>
          </p>
        </>
      )}
      {kind === "level" && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-ink">How busy?</span>
          <SegmentedControl
            label="Traffic level"
            value={level}
            onChange={setLevel}
            options={[
              { value: "clear", label: "Clear" },
              { value: "moderate", label: "Moderate" },
              { value: "heavy", label: "Heavy" },
            ]}
          />
          <p className="text-sm text-ink-muted">
            {level === "clear"
              ? "Also reopens the road if it was closed, and cancels a closure still scheduled."
              : level === "heavy"
                ? "Also appears in the feed. Fades from the map after 90 minutes unless updated."
                : "Fades from the map after 90 minutes unless updated."}
          </p>
        </div>
      )}
      {(timed || loud) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {timed && <TimeField label="From (optional)" hint="Bacolod time. Empty means now." value={from} onChange={setFrom} />}
          <TimeField
            label={loud ? "Until" : "Until (optional)"}
            hint={loud ? "Bacolod time. The pin or banner comes down after this." : kind === "closed" ? "Bacolod time. Empty keeps it closed for 12 hours." : "Bacolod time."}
            value={until}
            onChange={setUntil}
            error={errors.until}
          />
        </div>
      )}
      <Field label="Details (optional)" hint={kind === "level" ? undefined : "Reroutes, which stretch, where to park."}>
        {(p) => <Textarea {...p} rows={kind === "level" ? 2 : 3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <LinkField value={link} onChange={setLink} error={errors.link} />
      {announceable && ann.field}
    </TeamForm>
  );
}

// How crowded a place is right now. Like a traffic level it is a reading for the map and Now, not a post,
// and it fades after 90 minutes. A visitor's report goes through the same form and waits for approval.

export function CrowdForm({ token, onDone, bare }: FormProps) {
  const [places, setPlaces] = useState<string[]>([]);
  const [level, setLevel] = useState<CrowdLevel>("busy");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  return (
    <TeamForm
      bare={bare}
      submitLabel="Report crowd"
      send={async () => {
        if (!places.length) {
          setError("Pick at least one place.");
          return false;
        }
        setError(undefined);
        const res = await post(token, { type: "crowd", areas: places, level, note: note.trim() || undefined });
        onDone(res.title);
      }}
    >
      <AreaChips token={token} value={places} onChange={setPlaces} error={error} />
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">How crowded is it?</span>
        <SegmentedControl label="Crowd level" value={level} onChange={setLevel} options={CROWD_LEVELS.map((l) => ({ value: l, label: crowdLabel[l] }))} />
        <p className="text-sm text-ink-muted">
          {CROWD_LEVELS.map((l) => `${crowdLabel[l]}: ${crowdHint[l]}`).join(". ")}. Shows for 90 minutes unless updated.
        </p>
      </div>
      <Field label="Note (optional)" hint="A line for the entrance, the stage area, the food stalls.">
        {(p) => <Input {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </TeamForm>
  );
}

// Changes to a scheduled event: a new time or day, cancellation, new venue.

export type EventChange = "retime" | "tba" | "venue" | "cancel" | "started" | "ended";

/**
 * Events that can still change: anything that started less than 12 hours ago, one waiting on its new time,
 * and one still running, however long ago they began.
 */
const upcoming = (events: TeamEvent[]): ChangeEvent[] =>
  events.flatMap((e) => {
    if (e.repeatUntil) return e.status === "cancelled" ? [] : [nightView(e, Date.now())].filter((v) => v !== undefined);
    return Date.parse(e.startsAt) > Date.now() - 12 * 3_600_000 || e.status === "tba" || (e.status === "ongoing" && !e.actualEnd) ? [e] : [];
  });

/** A daily event as the form works with it: the night that is on now or next stands in for the event, and `nights` are the ones left. */
type ChangeEvent = TeamEvent & { nights?: Occurrence[] };

function nightView(e: TeamEvent, now: number): ChangeEvent | undefined {
  const nights = nightsLeft(e, now);
  if (!nights.length) return undefined;
  const mark = e.actualStart ?? e.actualEnd;
  const mine = !!mark && occurrenceNear(e, Date.parse(mark)).day === nights[0].day;
  return { ...e, startsAt: nights[0].startsAt, endsAt: nights[0].endsAt, originalStart: null, actualStart: mine ? e.actualStart : null, actualEnd: mine ? e.actualEnd : null, nights };
}

/** The clock for a timed event; "all day" or "time to follow" for one with only a date. */
const startLabel = (e: TeamEvent) => (e.allDay ? "all day" : !e.timeKnown ? "time to follow" : clock(e.startsAt));
const startedOf = (e: TeamEvent) => e.status === "ongoing" || e.status === "done" || !!e.actualStart;
const canStartOf = (e: TeamEvent) => !startedOf(e) && e.status !== "cancelled";
const canEndOf = (e: TeamEvent) => e.status !== "cancelled" && e.status !== "done" && (startedOf(e) || Date.parse(e.startsAt) <= Date.now());

/**
 * `events` is the whole schedule, or undefined while it loads. With no upcoming events it asks for some
 * first, and `onAddEvents` opens wherever they are added.
 */
export function EventChangeForm({
  events,
  onAddEvents,
  ...props
}: FormProps & { events: TeamEvent[] | undefined; staff?: boolean; initialChange?: EventChange; onAddEvents: () => void }) {
  const list = upcoming(events ?? []);
  if (events && !list.length) {
    return (
      <Alert tone="info" title="No upcoming events" action={<Button size="sm" onClick={onAddEvents}>Open the schedule</Button>}>
        Add events to the schedule first, then post changes to them here.
      </Alert>
    );
  }
  return <EventChangeFields events={list} {...props} />;
}

const dayPlus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function EventChangeFields({ token, events, onDone, bare, staff, initialChange = "retime" }: FormProps & { events: ChangeEvent[]; staff?: boolean; initialChange?: EventChange }) {
  const [eventId, setEventId] = useState("");
  const [change, setChange] = useState<EventChange>(initialChange);
  // The time fields start from the event and stay null until edited, so nothing changes by itself.
  const [startDay, setStartDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [venue, setVenue] = useState("");
  const [area, setArea] = useState("");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [errors, setErrors] = useState<{ event?: string; newStart?: string; newEnd?: string; venue?: string; until?: string; link?: string; day?: string }>({});
  const [until, setUntil] = useState("");
  // For a daily event: call off one day or the rest of the run.
  const [scope, setScope] = useState<"day" | "run">("day");
  const [cancelDay, setCancelDay] = useState("");
  const event = events.find((e) => e.id === eventId);
  const daily = !!event?.repeatUntil;
  // The last night left can only go with the run.
  const oneDay = daily && change === "cancel" && scope === "day" && (event?.nights?.length ?? 0) > 1;
  // An event with only a date has no clock to move from; giving it a time makes it a timed one.
  const dateOnly = !!event && (event.allDay || event.timeKnown === false);
  const hasEnd = !!event && !!event.endsAt && !dateOnly;
  const curStart = event ? toLocalInput(event.startsAt) : "";
  const curStartMs = event ? Date.parse(event.startsAt) : 0;
  const curEndMs = event?.endsAt ? Date.parse(event.endsAt) : 0;
  const day = startDay ?? curStart.slice(0, 10);
  const time = startTime ?? (dateOnly ? "" : curStart.slice(11));
  // A date with no time keeps the clock the event has, which is how a date-only event moves to another day.
  const startIso = event && fromLocalInput(`${day}T${time || curStart.slice(11)}`);
  const startMs = startIso ? Date.parse(startIso) : curStartMs;
  const startChanged = !!event && startMs !== curStartMs;
  const shift = startChanged ? startMs - curStartMs : 0;
  const dayMoved = startChanged && !!startIso && manilaMidnight(startIso) !== manilaMidnight(event!.startsAt);
  // The end moves with the start until it is edited itself, and keeps its day offset from the start (past midnight).
  const endOffset = event?.endsAt ? Math.round((Date.parse(`${toLocalInput(event.endsAt).slice(0, 10)}T00:00:00Z`) - Date.parse(`${curStart.slice(0, 10)}T00:00:00Z`)) / 86_400_000) : 0;
  const shiftedEnd = hasEnd ? new Date(curEndMs + shift) : undefined;
  const endShown = endTime ?? (shiftedEnd ? toLocalInput(shiftedEnd).slice(11) : "");
  const endIso = !hasEnd
    ? undefined
    : endTime === null
      ? shiftedEnd!.toISOString()
      : fromLocalInput(`${dayPlus(day, endOffset === 0 && endTime && endTime < (time || curStart.slice(11)) ? 1 : endOffset)}T${endTime}`);
  const endMs = endIso ? Date.parse(endIso) : undefined;
  const endChanged = hasEnd && endMs !== undefined && endMs !== curEndMs + shift;
  const changed = startChanged || (hasEnd && endMs !== undefined && endMs !== curEndMs);

  // One line for what the edit does, which also names the publish button.
  let line = "";
  if (event && changed && daily && startIso) {
    line = `From ${fromWhen(startIso, Date.now())}: ${clock(startIso)}${endChanged && endIso ? `–${clock(endIso)}` : ""}`;
  } else if (event && changed) {
    const stamp = (iso: string) => (dayKey(iso) === dayKey(event.startsAt) ? clock(iso) : `${dayStamp(iso)}, ${clock(iso)}`);
    if (startChanged && startIso) {
      const first = Date.parse(event.originalStart ?? event.startsAt);
      const gap = Math.round((startMs - first) / 60_000);
      line = event.originalStart && startMs === Date.parse(event.originalStart)
        ? `Back on schedule, ${event.wasDateOnly ? dayStamp(startIso) : stamp(startIso)}`
        : dayMoved
          ? time || !dateOnly ? `${movedToDay(startIso)}, ${clock(startIso)}` : movedToDay(startIso)
          : dateOnly
            ? `Starts at ${clock(startIso)}`
            : gap > 0 ? `Delayed ${duration(gap)}` : gap < 0 ? startsEarlier(startIso) : "Back on schedule";
    } else if (endIso && event.endsAt) {
      line = endMs! > curEndMs ? extendedUntil(endIso, event.endsAt) : `Now ends at ${clock(endIso)}`;
    }
  }
  // The first time, when the event has been moved and the fields don't already show it.
  const former = event && formerWhen(event);
  const origLocal = event?.originalStart ? toLocalInput(event.originalStart) : "";
  const atFirst = !!event?.originalStart && startMs === Date.parse(event.originalStart);

  // Moving a day or cancelling is bigger news than a small shift, so Pinned is suggested for them.
  const suggested: Announce = (change === "retime" && dayMoved) || change === "cancel" ? "pinned" : "feed";
  const ann = useAnnounce(staff, suggested, token === COMMUNITY_TOKEN);
  // Started and ended only update the schedule; the rest can go to the feed.
  const scheduleOnly = change === "started" || change === "ended";
  const loud = ann.loud && !scheduleOnly;
  const canStart = !!event && canStartOf(event);
  const canEnd = !!event && canEndOf(event);
  const options = [
    { value: "retime" as const, label: "Change time" },
    ...(daily ? [] : [{ value: "tba" as const, label: "Time to follow" }]),
    { value: "venue" as const, label: "Venue" },
    { value: "cancel" as const, label: "Cancel" },
    ...(!event || canStart ? [{ value: "started" as const, label: "Started" }] : []),
    ...(!event || canEnd ? [{ value: "ended" as const, label: "Ended" }] : []),
  ];
  // A pin or banner comes down when the event ends, moved along with the time, unless another end is picked.
  const plannedEnd = event?.endsAt ? (change === "retime" && endIso ? new Date(endIso) : new Date(event.endsAt)) : undefined;
  // With no end to go by, a pin or banner stays up to the end of the day the event lands on.
  const untilValue = until || (plannedEnd ? toLocalInput(plannedEnd) : event ? `${day}T23:59` : "");

  function pick(id: string) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    setStartDay(null);
    setStartTime(null);
    setEndTime(null);
    setCancelDay("");
    setScope("day");
    if (ev) {
      setVenue(ev.venue ?? "");
      setArea(ev.area ?? "");
    }
    // Started or ended may not suit the newly picked event.
    if (ev && ((change === "started" && !canStartOf(ev)) || (change === "ended" && !canEndOf(ev)))) setChange("retime");
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={scheduleOnly ? (change === "started" ? "Mark started" : "Mark ended") : change === "retime" && line ? `Publish: ${line}` : "Publish change"}
      send={async () => {
        const next = {
          event: eventId ? undefined : "Pick the event.",
          newStart: change === "retime" && event && !changed ? "Nothing changed yet." : undefined,
          newEnd: change === "retime" && hasEnd && (!endIso || endMs! <= (startChanged ? startMs : curStartMs)) ? "The end is before the start." : undefined,
          venue: change === "venue" && !venue.trim() ? "Where is it now?" : undefined,
          day: change === "cancel" && oneDay && !cancelDay ? "Pick the day." : undefined,
          until: loud && !untilValue ? "This event has no end time. Pick when the pin or banner comes down." : undefined,
          link: linkError(link),
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        if (loud && ann.check(untilValue).blocked) return false;
        const retime = change === "retime";
        // A date-only event given just another day moves by day, and stays date-only.
        const keepDateOnly = retime && dateOnly && !time;
        const res = await post(token, {
          type: "event",
          ...(loud && { tier: ann.tier, endsAt: fromLocalInput(untilValue) }),
          eventId,
          change,
          day: oneDay && cancelDay ? cancelDay : undefined,
          keepDateOnly: keepDateOnly || undefined,
          newStart: retime && startChanged ? startIso : undefined,
          newEnd: retime && endChanged ? endIso : undefined,
          venue: change === "venue" ? venue.trim() : undefined,
          area: change === "venue" && area ? area : undefined,
          at: scheduleOnly ? fromLocalInput(at) : undefined,
          note: note.trim() || undefined,
          url: url(link),
        });
        onDone(res.title);
      }}
    >
      <EventSelect events={events} value={eventId} onChange={pick} error={errors.event} />
      {event && (
        <p className="-mt-2 text-sm text-ink-muted">
          {event.status === "tba" ? `Now: time to follow, was ${dayLabel(event.startsAt)}, ${clock(event.startsAt)}` : `Now: ${dayLabel(event.startsAt)}, ${startLabel(event)}`}
          {event.venue && ` at ${event.venue}`}
        </p>
      )}
      <SegmentedControl label="What changed" value={change} onChange={setChange} options={options} />
      {change === "retime" && (
        <div className="grid gap-4">
          <div className={`grid gap-4 ${hasEnd ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Field label="Day" error={errors.newStart}>
              {(p) => <Input {...p} type="date" value={day} disabled={daily} onChange={(e) => setStartDay(e.target.value)} />}
            </Field>
            <Field label="Starts" hint={dateOnly ? "Empty keeps it without a time." : undefined}>
              {(p) => <Input {...p} type="time" value={time} onChange={(e) => setStartTime(e.target.value)} />}
            </Field>
            {hasEnd && (
              <Field label="Ends" error={errors.newEnd}>
                {(p) => <Input {...p} type="time" value={endShown} onChange={(e) => setEndTime(e.target.value)} />}
              </Field>
            )}
          </div>
          <div className="-mt-2 flex flex-wrap items-center gap-x-3 text-sm">
            {daily && <span className="text-ink-muted">Every day of the run, from the next night. To change the days, edit the event.</span>}
            <span className={line ? "font-medium text-ink" : "text-ink-muted"}>{line ? `${line}. Bacolod time.` : "Bacolod time. Nothing changes until you edit a time."}</span>
            {former && !atFirst && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDay(origLocal.slice(0, 10));
                  setStartTime(origLocal.slice(11));
                  setEndTime(null);
                }}
              >
                Back to {former}
              </Button>
            )}
          </div>
        </div>
      )}
      {change === "cancel" && daily && (
        <div className="grid gap-3">
          {(event?.nights?.length ?? 0) > 1 && (
            <SegmentedControl label="Cancel" value={scope} onChange={setScope} options={[{ value: "day", label: "Just one day" }, { value: "run", label: "The rest of the run" }]} />
          )}
          {oneDay && (
            <Field label="Which day?" error={errors.day} hint="Readers see “No … on that day”; the other days stay.">
              {(p) => (
                <Select {...p} value={cancelDay} onChange={(e) => setCancelDay(e.target.value)}>
                  <option value="">Pick a day</option>
                  {event!.nights!.map((n) => (
                    <option key={n.day} value={n.day}>
                      {dayStampOf(n.day)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
      )}
      {scheduleOnly && <TimeField label={change === "started" ? "Started at (optional)" : "Ended at (optional)"} hint="Bacolod time. Empty means now." value={at} onChange={setAt} />}
      {change === "venue" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New venue" hint={event?.venues?.length ? `Changes the main venue only. Its other venues (${event.venues.map((v) => v.venue).join(", ")}) stay as they are; edit them in the schedule.` : undefined} error={errors.venue}>
            {(p) => <Input {...p} maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} />}
          </Field>
          <AreaSelect token={token} value={area} onChange={setArea} optional />
        </div>
      )}
      {!scheduleOnly && (
        <Field label="Note on the schedule (optional)" hint={change === "retime" ? "Shown after the change line." : change === "tba" ? 'Empty shows "Time to follow".' : undefined}>
          {(p) => <Input {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      )}
      {!scheduleOnly && <LinkField value={link} onChange={setLink} error={errors.link} />}
      {loud && (
        <TimeField label="Until" hint={plannedEnd && !until ? "Bacolod time. Defaults to when the event ends." : "Bacolod time. The pin or banner comes down after this."} value={untilValue} onChange={setUntil} error={errors.until} />
      )}
      {!scheduleOnly && ann.field}
      {!scheduleOnly && suggested === "pinned" && ann.announce === "pinned" && <p className="-mt-2 text-sm text-ink-muted">{change === "cancel" ? "Suggested: Pinned for a cancellation" : "Suggested: Pinned for a day change"}</p>}
    </TeamForm>
  );
}

/** "1h 30m", "45 min". */
function duration(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min} min`;
}

function EventSelect({ events, value, onChange, error, optionalLabel, label = "Event", hint }: { events: TeamEvent[]; value: string; onChange: (id: string) => void; error?: string; optionalLabel?: string; label?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{optionalLabel ?? "Pick an event"}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.repeatUntil ? `Daily until ${dayStampOf(e.repeatUntil)}` : dayStamp(e.startsAt)}, {startLabel(e)} · {e.title}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

// Contest results.

const placeOrdinal = (i: number) => ["1st", "2nd", "3rd"][i] ?? `${i + 1}th`;

type ResultChoice = "standings" | "final" | "corrected" | "revised";
type ResultFormRow = { label: string; name: string; prize: string };

const blankRows = (n = 3): ResultFormRow[] => Array.from({ length: n }, () => ({ label: "", name: "", prize: "" }));
const stageNames: Record<ResultStage, string> = { pending: "Results pending", standings: "Standings", final: "Final results", corrected: "Corrected results", revised: "Revised results" };
const choiceOptions: Record<ResultChoice, { label: string; hint: string }> = {
  standings: { label: "Standings", hint: "After a round, with the contest still going." },
  final: { label: "Final results", hint: "The contest is over and these are the winners." },
  corrected: { label: "Correction", hint: "We got it wrong the first time." },
  revised: { label: "Revision", hint: "The result itself changed, for example a disqualification." },
};
const submitNames: Record<ResultChoice, string> = { standings: "Publish standings", final: "Publish final results", corrected: "Publish correction", revised: "Publish revision" };

/** `staff` offers the hero banner when announcing. */
export function WinnersForm({ token, events, onDone, bare, staff }: FormProps & { events: TeamEvent[]; staff?: boolean }) {
  const [eventId, setEventId] = useState("");
  const [contestPick, setContestPick] = useState("");
  const [contest, setContest] = useState("");
  const [rows, setRows] = useState<ResultFormRow[]>(blankRows());
  const [pending, setPending] = useState(false);
  const [expected, setExpected] = useState("");
  const [picked, setPicked] = useState<ResultChoice>();
  const [until, setUntil] = useState("");
  const [link, setLink] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<{ contest?: string; places?: string; expected?: string; until?: string; link?: string }>({});
  // The list isn't there for everyone (it can fail to load); without it the form just starts blank.
  const results = useTeamList<TeamResult>("/api/team/results", token).list ?? [];
  const unscheduled = results.filter((r) => !r.eventId);
  const previous = eventId ? results.find((r) => r.eventId === eventId) : contestPick ? results.find((r) => r.contestId === contestPick) : undefined;
  // Pending and standings have nothing to correct yet.
  const changeable = previous !== undefined && ["final", "corrected", "revised"].includes(previous.stage);
  const choices: ResultChoice[] = changeable ? ["standings", "final", "corrected", "revised"] : ["standings", "final"];
  const stage = picked && choices.includes(picked) ? picked : changeable ? "corrected" : "final";
  const event = events.find((e) => e.id === eventId);
  const big = event?.kind === "competition" || event?.kind === "parade";
  const ann = useAnnounce(staff, !pending && (stage === "corrected" || stage === "revised" || (stage === "final" && big)) ? "pinned" : "feed", token === COMMUNITY_TOKEN);
  const loud = ann.loud;

  // Fill the form from what is posted now, once per version, so the person edits it rather than retyping.
  const version = previous ? `${previous.contestId}@${previous.createdAt}` : "";
  useEffect(() => {
    if (!previous) return;
    setContest(previous.contest);
    if (previous.rows.length) setRows(previous.rows.map((r, i) => ({ label: r.label === placeOrdinal(i) ? "" : r.label, name: r.name, prize: r.prize ?? "" })));
    setDetails(previous.note ?? "");
    setPicked(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Anything from the last two days can have winners; competitions come first.
  const since = Date.now() - 2 * 86_400_000;
  // A daily event counts when any night started in that time.
  const recent = events.filter((e) => (e.repeatUntil ? allOccurrences(e).some((o) => Date.parse(o.startsAt) >= since && Date.parse(o.startsAt) <= Date.now()) : new Date(e.startsAt).getTime() >= since && new Date(e.startsAt).getTime() <= Date.now()));
  const contests = [...recent.filter((e) => e.kind === "competition"), ...recent.filter((e) => e.kind !== "competition")];
  const setRow = (i: number, patch: Partial<ResultFormRow>) => setRows(rows.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <TeamForm
      bare={bare}
      submitLabel={pending ? "Post results pending" : submitNames[stage]}
      send={async () => {
        const filled = rows.map((r) => ({ label: r.label.trim(), name: r.name.trim(), prize: r.prize.trim() })).filter((r) => r.label || r.name || r.prize);
        const next = {
          contest: contest.trim() ? undefined : "Which contest?",
          places: pending ? undefined : filled.some((r) => r.name) ? (filled.some((r) => !r.name) ? "Each label needs a name." : undefined) : "Enter at least the winner.",
          expected: pending && !fromLocalInput(expected) ? "When are results expected?" : undefined,
          until: loud ? ann.check(until).until : undefined,
          link: linkError(link),
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        if (loud && ann.check(until).blocked) return false;
        const places = pending ? [] : filled.map((r) => ({ ...(r.label && { label: r.label }), name: r.name, ...(r.prize && { prize: r.prize }) }));
        const res = await post(token, {
          type: "winners",
          eventId: eventId || undefined,
          contestId: !eventId && contestPick ? contestPick : undefined,
          stage: pending ? undefined : stage,
          contest: contest.trim(),
          places,
          pendingUntil: pending ? fromLocalInput(expected) : undefined,
          note: details.trim() || undefined,
          url: url(link),
          topics: eventId || contestPick ? undefined : topics,
          ...(loud && { tier: ann.tier, endsAt: fromLocalInput(until) }),
        });
        onDone(res.title);
      }}
    >
      <EventSelect
        events={contests}
        value={eventId}
        optionalLabel="Not on the schedule"
        onChange={(id) => {
          setEventId(id);
          if (id) setContestPick("");
          const ev = contests.find((e) => e.id === id);
          if (ev && !results.some((r) => r.eventId === id)) setContest(ev.title);
        }}
      />
      {!eventId && unscheduled.length > 0 && (
        <Field label="Continue an earlier contest (optional)" hint="Pick one to fix or finish its results instead of starting a new contest.">
          {(p) => (
            <Select {...p} value={contestPick} onChange={(e) => setContestPick(e.target.value)}>
              <option value="">A new contest</option>
              {unscheduled.map((r) => (
                <option key={r.contestId} value={r.contestId}>
                  {r.contest}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {previous && (
        <p className="text-sm text-ink-muted">
          {stageNames[previous.stage]} posted {previous.byName ? `by ${previous.byName}, ` : "at "}{clock(previous.createdAt)}. Edit them below.
        </p>
      )}
      <Field label="Contest" error={errors.contest}>
        {(p) => <Input {...p} maxLength={120} value={contest} onChange={(e) => setContest(e.target.value)} />}
      </Field>
      {!changeable && (
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={pending} onChange={(e) => setPending(e.target.checked)} />
          Results aren't out yet
        </label>
      )}
      {pending && !changeable ? (
        <TimeField label="Expected by" value={expected} onChange={setExpected} error={errors.expected} />
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink" aria-hidden>
              What is this?
            </p>
            <SegmentedControl label="What is this?" value={stage} onChange={setPicked} options={choices.map((value) => ({ value, label: choiceOptions[value].label }))} />
            <p className="text-sm text-ink-muted">{choiceOptions[stage].hint}</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Winners, in order</legend>
            {rows.map((row, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex gap-2">
                  <Input aria-label={`Label ${i + 1}`} className="w-28 shrink-0" placeholder={placeOrdinal(i)} maxLength={40} value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} />
                  <Input aria-label={`Name ${i + 1}`} className="min-w-0 flex-1" placeholder="Name" maxLength={120} value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                </div>
                <Input aria-label={`Prize ${i + 1}`} placeholder="Prize (optional)" maxLength={60} value={row.prize} onChange={(e) => setRow(i, { prize: e.target.value })} />
                {i === 0 && <p className="text-sm text-ink-muted">Champion, Best Costume, Ticket #1234</p>}
              </div>
            ))}
            {errors.places && <p className="text-sm text-danger-ink">{errors.places}</p>}
            {rows.length < 10 && (
              <Button variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setRows([...rows, { label: "", name: "", prize: "" }])}>
                Add a place
              </Button>
            )}
          </fieldset>
        </>
      )}
      <Field label="Details (optional)" hint="Prizes, special awards, a word from the judges. Shown under the winners.">
        {(p) => <Textarea {...p} rows={2} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />}
      </Field>
      {/* Winners of a scheduled or earlier contest already share its topics. */}
      {!eventId && !contestPick && <TopicPicker token={token} value={topics} onChange={setTopics} text={contest} />}
      <LinkField value={link} onChange={setLink} error={errors.link} />
      {loud && <TimeField label="Until" hint="Bacolod time. The pin or banner comes down after this." value={until} onChange={setUntil} error={errors.until} />}
      {ann.field}
    </TeamForm>
  );
}

// Anything else: announcements, safety, weather, raffles, activities, community events, sponsor games, promos.

const noticeKinds = NOTICE_CATEGORIES;

/** A title that reads at a glance on a feed card; the post holds the rest. */
const HEADLINE_MAX = 120;
export type NoticeCategory = (typeof noticeKinds)[number];

/** What a shortcut's form is for, where its name alone leaves it unclear. */
const noticeIntro: Partial<Record<NoticeCategory, string>> = {
  announcement: "News for everyone: a change of plan, a lost child found, free water at the plaza. A stall or booth people can visit? Add it as a place.",
  activity: "Something people can join now or soon: a booth game, a workshop, a free show.",
  promo: "A deal or offer to announce in the feed. If it's at a promo spot, pick it below. To list a new stall or shop, use Add promo spot.",
};

/** Words that suggest the notice is really a change to a scheduled event's time. */
const timeChange = /\b(moved|delayed|postponed|rescheduled|pushed back)\b/i;

/** Words that suggest a sponsor post is really an event people go to. */
const eventish = /\b(concert|show|gig|party|night|live band|dj set)\b/i;

/**
 * `fixedCategory` is for a shortcut that already says what it posts: the Type picker is hidden and the notice goes out as that category.
 * `staff` offers the hero banner, which only staff may post.
 */
export function NoticeForm({ token, onDone, bare, fixedCategory, staff, onAddEvent }: FormProps & { fixedCategory?: NoticeCategory; staff?: boolean; onAddEvent?: () => void }) {
  const [picked, setCategory] = useState<NoticeCategory>("announcement");
  const category = fixedCategory ?? picked;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const text = `${title}\n${body}`;
  const [area, setArea] = useState("");
  const [spot, setSpot] = useState("");
  const [eventId, setEventId] = useState("");
  const [addingSpot, setAddingSpot] = useState(false);
  const places = useTeamList<TeamPlace>("/api/team/places", token);
  const events = useTeamList<TeamEvent>("/api/team/events", token);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  // Daily hours ("HH:MM"), offered once When and Until fall on different days.
  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");
  const [link, setLink] = useState("");
  const ann = useAnnounce(staff, "feed", token === COMMUNITY_TOKEN);
  const [topics, setTopics] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ body?: string; title?: string; until?: string; link?: string; daily?: string }>({});
  const multiDay = !!from && !!until && from.slice(0, 10) < until.slice(0, 10);
  const minutes = (hhmm: string) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : undefined);
  const daily = multiDay ? { from: minutes(dailyFrom), to: minutes(dailyTo) } : { from: undefined, to: undefined };
  const promo = category === "promo";
  const loud = ann.loud;

  // The place editor is a form of its own, so it takes the place of this one while it is open; what was typed stays.
  if (addingSpot)
    return (
      <PlaceEditor
        token={token}
        bare={bare}
        initialKind={promo ? PROMO_KIND : undefined}
        onCancel={() => setAddingSpot(false)}
        onDone={(_, id) => {
          places.reload();
          if (id) setSpot(id);
          setAddingSpot(false);
        }}
      />
    );

  return (
    <TeamForm
      bare={bare}
      submitLabel="Publish"
      send={async () => {
        const next = {
          body: body.trim() ? undefined : "Write the post.",
          title: title.trim() ? undefined : "Give it a title.",
          until: ann.check(until).until || (from && until && until <= from ? "The end is before the start." : undefined),
          daily: (daily.from === undefined) !== (daily.to === undefined) ? "Pick both times, or neither." : daily.from !== undefined && daily.from === daily.to ? "The two times are the same." : undefined,
          link: linkError(link),
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        if (ann.check(until).blocked) return false;
        const res = await post(token, {
          type: "notice",
          tier: ann.tier,
          category,
          title: title.trim(),
          body: body.trim() || undefined,
          area: (!spot && area) || undefined,
          placeId: spot || undefined,
          eventId: eventId || undefined,
          startsAt: fromLocalInput(from),
          endsAt: fromLocalInput(until),
          dailyFrom: daily.from,
          dailyTo: daily.to,
          url: url(link),
          topics,
        });
        onDone(res.title);
      }}
    >
      {fixedCategory && noticeIntro[fixedCategory] && <p className="text-sm text-ink-muted">{noticeIntro[fixedCategory]}</p>}
      {!fixedCategory && (
        <Field label="Type">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              {noticeKinds.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta[c].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Post" hint="What readers see: what's on, when, where, prizes, how to join." error={errors.body}>
        {(p) => <Textarea {...p} rows={5} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <Field label="Title" hint={`Sum up the post in a few words. Shown in bold above it. ${title.length}/${HEADLINE_MAX}`} error={errors.title}>
        {(p) => <Input {...p} maxLength={HEADLINE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      {timeChange.test(text) && (
        <Alert tone="info" title="Is this a schedule change?">
          If an event on the schedule moved, use Schedule → Delay instead, so the schedule shows the new time too.
        </Alert>
      )}
      {onAddEvent && (category === "raffle" || category === "sponsor_game") && (eventish.test(text) || (from && area)) && (
        <Alert tone="info" title="People show up at a set time?">
          Add it as an event instead, so it goes on the schedule.
          <Button className="mt-2" size="sm" variant="secondary" onClick={onAddEvent}>
            Add event
          </Button>
        </Alert>
      )}
      <PlaceField places={places.list} promo={promo} value={spot} onChange={setSpot} onAdd={token === COMMUNITY_TOKEN ? undefined : () => setAddingSpot(true)} />
      {!spot && <AreaSelect token={token} value={area} onChange={setArea} optional />}
      <EventSelect
        label="About an event (optional)"
        optionalLabel="Not about an event"
        events={recentEvents(events.list ?? [])}
        value={eventId}
        onChange={setEventId}
        hint="Readers see it on the schedule entry, and the post says it is during that event."
      />
      <TopicPicker token={token} value={topics} onChange={setTopics} text={text} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TimeField label="When (optional)" hint="Bacolod time. Empty means now." value={from} onChange={setFrom} />
        <div className="space-y-1.5">
          <TimeField
            label={loud ? "Until" : "Until (optional)"}
            hint={loud ? "Bacolod time. Comes down and leaves the feed after this." : "Bacolod time. Leaves the feed after this. Empty means it stays."}
            value={until}
            onChange={setUntil}
            error={errors.until}
          />
          <div className="flex flex-wrap gap-1.5">
            {untilPicks(from).map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => setUntil(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {multiDay && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-ink">Every day between (optional)</span>
          <div className="grid max-w-md grid-cols-2 gap-4">
            <Field label="From" error={errors.daily}>
              {(p) => <Input {...p} type="time" value={dailyFrom} onChange={(e) => setDailyFrom(e.target.value)} />}
            </Field>
            <Field label="To">{(p) => <Input {...p} type="time" value={dailyTo} onChange={(e) => setDailyTo(e.target.value)} />}</Field>
          </div>
          <p className="text-sm text-ink-muted">
            {daily.from !== undefined && daily.to !== undefined && daily.from !== daily.to
              ? `Readers see: ${dailyLine({ startsAt: fromLocalInput(from) ?? null, endsAt: fromLocalInput(until) ?? null, dailyFrom: daily.from, dailyTo: daily.to })}. A time before the first means it runs past midnight. Bacolod time.`
              : "For a promo or a market that runs the same hours each day. Empty means all day, every day of the range."}
          </p>
        </div>
      )}
      <LinkField value={link} onChange={setLink} error={errors.link} />
      {ann.field}
    </TeamForm>
  );
}

/**
 * One-tap ends for a notice, so nobody types a date on a phone: an hour from its start (or now), tonight
 * at 10 PM while that's still ahead, and the end of the day it starts.
 */
function untilPicks(from: string) {
  const start = fromLocalInput(from) ?? new Date().toISOString();
  const day = toLocalInput(start).slice(0, 10);
  const tonight = `${day}T22:00`;
  return [
    { label: "1 hour", value: toLocalInput(new Date(Date.parse(start) + 3_600_000)) },
    ...(tonight > toLocalInput(start) ? [{ label: "Tonight", value: tonight }] : []),
    { label: "End of day", value: `${day}T23:59` },
  ];
}

/** Events a notice can be about: upcoming ones and those from the last two days. */
const recentEvents = (events: TeamEvent[]) =>
  events.filter((e) => Date.parse(e.repeatUntil ? (focusOccurrence(e, Date.now())?.startsAt ?? e.startsAt) : e.startsAt) > Date.now() - 2 * 86_400_000 || e.status === "tba");

/**
 * Ties a notice to an Around place, so the feed shows where it is and the place lists it. Any listed place will
 * do; for a promo the promo spots come first. `onAdd` opens the place editor, when this person may add places.
 */
function PlaceField({ places, promo, value, onChange, onAdd }: { places: TeamPlace[] | undefined; promo: boolean; value: string; onChange: (id: string) => void; onAdd?: () => void }) {
  const spots = (places ?? []).filter((p) => p.active).sort((a, b) => Number(promo && b.kind.key === PROMO_KIND) - Number(promo && a.kind.key === PROMO_KIND));
  const labels = new Map<string, string>();
  for (const s of spots) {
    const base = `${s.title} · ${whereLine(s.place, s.area)}`;
    labels.set(labels.has(base) ? `${base} (${s.kind.name})` : base, s.id);
  }
  const selected = [...labels].find(([, id]) => id === value)?.[0] ?? "";
  const promoSpots = spots.some((s) => s.kind.key === PROMO_KIND);
  return (
    <div className="space-y-1.5">
      <Field
        label={promo ? "Promo spot (optional)" : "About a place (optional)"}
        hint={
          promo
            ? places && !promoSpots
              ? "No promo spots yet. Add one with Add a spot."
              : "The announcement shows the spot's name and where to find it."
            : "Search a listed place. It shows on the post and on the place's Around card."
        }
      >
        {(p) => <Combobox {...p} value={selected} options={[...labels.keys()]} onChange={(label) => onChange(labels.get(label) ?? "")} emptyLabel={promo ? "Not at a listed spot" : "No place"} placeholder="Search places" />}
      </Field>
      {onAdd && (
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={onAdd}>
          Add a spot
        </Button>
      )}
    </div>
  );
}
