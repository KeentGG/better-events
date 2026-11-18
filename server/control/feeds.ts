import { sql, type SQL } from "drizzle-orm";
import { PROMO_KIND } from "../../src/lib/types";
import { ACTIVITY_LINES } from "./config";

/** "Food added: …" until the place is edited, then "Food updated: …". Promo spots count on Promos, every other kind on Places. */
const placeFeed = (promo: boolean) =>
  sql`select p.updated_at as at, k.name || case when p.updated_at = p.created_at then ' added: ' else ' updated: ' end || p.name as text
    from places p join place_kinds k on k.key = p.kind where p.archived_at is null and (p.kind = ${PROMO_KIND}) = ${promo} order by p.updated_at desc limit ${ACTIVITY_LINES}`;

/** "Event added: …" until the event is edited, then "Schedule edited: …". */
const eventFeed = (official: boolean) =>
  sql`select updated_at as at, case when updated_at = created_at then 'Event added: ' else 'Schedule edited: ' end || title as text
    from events where official = ${official} order by updated_at desc limit ${ACTIVITY_LINES}`;

/**
 * Feeds a group can list besides its item categories (docs/MISSION_CONTROL.md §3). Each returns its
 * newest rows as (at, text), newest first; the first row's time counts as the group's latest update.
 */
export const FEEDS = {
  weather_snapshots: sql`select fetched_at as at, 'Open-Meteo ' || round((data->>'temperatureC')::numeric) || '°C' as text
    from weather_snapshots order by fetched_at desc limit ${ACTIVITY_LINES}`,
  // Delays and cancellations publish items in the Schedule categories; these cover the schedule editor itself.
  // Both freshen Schedule: one Add event form covers official and community events.
  "events:official": eventFeed(true),
  "events:community": eventFeed(false),
  traffic_readings: sql`select t.updated_at as at, a.name || ' ' || t.level as text
    from traffic_readings t join areas a on a.id = t.area_id order by t.updated_at desc limit ${ACTIVITY_LINES}`,
  // Tips and their sections, added or edited on the team desk.
  tips: sql`select at, text from (
      select updated_at as at, case when updated_at = created_at then 'Tip added: ' else 'Tip edited: ' end || title as text from tips
      union all
      select updated_at, case when updated_at = created_at then 'Section added: ' else 'Section edited: ' end || title from tip_sections
    ) guide order by at desc limit ${ACTIVITY_LINES}`,
  // The old public crowd_reports table has no form and is not read here.
  crowd_readings: sql`select r.created_at as at, a.name || ' ' || r.level || coalesce(': ' || r.note, '') as text
    from crowd_readings r join areas a on a.id = r.area_id order by r.created_at desc limit ${ACTIVITY_LINES}`,
  places: placeFeed(false),
  "place:promo": placeFeed(true),
} satisfies Record<string, SQL>;

export type FeedKey = keyof typeof FEEDS;
