/**
 * The Mission Control input audit (#/audit): every wall tile tested against what volunteers need to post,
 * and the fixes that follow. It is the canonical list for fixing the UX of data entry, so update it here
 * as fixes land. Text uses a small inline markup, drawn by src/components/audit/InputAudit.tsx:
 * `code`, **bold**, *italic*, and [[ok|label]] / [[partial|label]] / [[no|label]] for a result badge.
 */

/** Text with the inline markup above. */
export type Rich = string;

export type AuditResult = "ok" | "partial" | "no";

export interface AuditScenario {
  /** Stable anchor: `#/audit/<id>`. */
  id: string;
  scenario: Rich;
  result: AuditResult;
  what: Rich;
  /** The result when audited, once a fix has changed it; `result` is then how it stands now. */
  before?: AuditResult;
  /** On scenarios that don't fully pass, and kept on those a fix made pass (with `before`). */
  fix?: { summary: Rich; fixes: FixId[] };
}

export interface AuditTile {
  id: string;
  eyebrow: string;
  title: string;
  /** The tile's buttons in Update mode. */
  buttons: string[];
  intro: Rich[];
  scenarios: AuditScenario[];
  evidence?: { text: Rich; fixes: FixId[] };
  /** "Reader side", "Clear / confusing" and fix boxes; `fix` ones are drawn as recommendations. */
  boxes: Array<{ title: string; fix: boolean; items: Rich[] }>;
}

export interface AuditFix {
  id: string;
  title: string;
  effort: string;
  problem: Rich;
  ui: Rich[];
  data: Rich[];
  /** Open unless set. When it lands, mark it done with its commit and update the scenarios it fixed. */
  status?: { state: "doing" } | { state: "done"; commit: string };
}

/** In priority order; a fix's number is its place here. */
export const FIX_IDS = [
  "until",
  "winners-feed",
  "crowd-copy",
  "back-on",
  "headline-details",
  "live-list",
  "corrections",
  "time-changes",
  "all-day",
  "tiers",
  "winners-schedule",
  "result-changes",
  "community-event",
  "urgent",
  "links",
  "link-notices",
  "wall-labels",
  "routing",
  "event-changes",
  "winner-labels",
  "places",
  "crowd-level",
  "recurrence",
  "partial-closure",
  "seeds",
  "multi-venue",
  "prize-ladder",
  "closure-hours",
] as const;
export type FixId = (typeof FIX_IDS)[number];

export const audit = {
  eyebrow: "Better Maskara · #/control · Update mode",
  title: "Mission Control wall audit",
  lede: "Every tile, tested against what a volunteer would actually need to post from a phone on Lacson Street. For each tile I wrote the scenarios first, then read the form, followed the saved data to the reader-facing pages, and checked the running app.",
  meta: ["audited 30 Sep 2026 at commit 3fe9e68", "updated 30 Sep: time-change and result-change announcements, tiered announcements"],
  legend:
    "Legend: [[ok|✅ full]] can be entered completely · [[partial|⚠️ partial]] entered but something is lost or forced · [[no|❌ can't]] no way to enter it. The local DB has no events, so every event-picker flow (Delay, Cancel, Venue, Back on, Winners picker) was read from code, not clicked through. I published nothing to the DB.",
  top: {
    eyebrow: "Summary",
    title: "Top five issues",
    items: [
      '**Nothing in the feed ever ends.** Notices have no "until" field. The feed card ignores `endsAt`, even on closures that have one, and `/api/feed` never filters out expired items. In the running app, yesterday\'s Lacson closure (it ended at 23:51 on 29 Sep) is still shown today as "Road closure", and a two-for-one piaya promo is still up 20 hours later.',
      '**Winners are posted but readers barely see them.** The event picker only lists `kind=competition` events, so it is empty for most schedules. Results saved to `event_updates` and the event\'s `done` status never reach the schedule. `/schedule` maps `done` to `on_time`. In the feed, "1st: … 2nd: … 3rd: …" runs together on one line because the card collapses newlines.',
      '**The wall has no memory and no undo.** In Update mode a tile swaps its activity list for buttons, so a volunteer can\'t see what is already posted. That leads to duplicates. Taking something down or correcting it happens in the intake table below the wall or on the team desk, never on the tile. "Back on schedule" after a delay keeps the *new* time and deletes the "Moved from" note, so the schedule ends up showing the wrong time as on time.',
      "**The Crowd reports tile describes a form that doesn't exist.** (Fixed by `crowd-level`: the tile now has a Crowd level button and the Contribute page has a crowd form.) It says the reports are \"Sent by the public from the site's report form\", but `#/report` shows \"Coming soon\". The stored reports are shown to nobody, staff or readers. The report kinds don't include crowd density at all, and the Traffic page claims crowd reports feed the map when they don't.",
      '**One intent often has several buttons, and they lead to different data models.** 3rd-party events: "Post community event" makes a dated-by-text feed notice, while "Add to schedule (not official)" makes a schedule entry that never reaches the feed. Places has four "Add X" buttons that open the same form. Raffle winners could go under Sponsor games or under Winners. Notices can\'t be linked to an event or a place, except a promo linked to a promo-kind place.',
    ],
  },
  patterns: {
    eyebrow: "Across the wall",
    title: "Cross-tile patterns",
    items: [
      {
        title: '1. No "when" and no "until"',
        body: [
          'Nine notice categories share one form with text, area and link. `items.startsAt` and `items.endsAt` already exist, and closures and advisories use them, but the notice form never sets them. The feed card shows `startsAt` as "From 4:00 PM" with no day, and ignores `endsAt`. `/api/feed` returns the 50 newest published items with no expiry filter. So every time-bound notice is wrong once its time has passed, and a closure that has ended still reads as "Road closure".',
        ],
      },
      {
        title: "2. Update mode hides what's live, and there's no undo on the tile",
        body: [
          "The buttons replace the activity list, so the volunteer posting a lost-child notice can't see whether a teammate already did. Taking something down means scrolling to the intake table (Hide) or going to the team desk (Recent). Edit is staff-only in the inbox. Corrections therefore become a second card next to the first.",
        ],
      },
      {
        title: "3. Saved but never shown",
        list: [
          "Event `url`; event `area` when a venue is set; `done` and `ongoing` statuses; `event_updates` results and history; the unused `description`, `actualStart` and `actualEnd`.",
          "Place `url` and `area`; `places.itemId`; which promos or notices are linked to a place.",
          "Every `crowd_reports` row. `items.severity` is never written or read.",
        ],
      },
      {
        title: "4. Several doors for one intent",
        list: [
          "Community event: notice or schedule entry, with different data.",
          "Add kiosk / food / ride / thrift go to one form, and Add promo spot is on another tile.",
          "Raffle winners: Sponsor games or Winners.",
          "Time change: Schedule → Delay, or an announcement that leaves the schedule wrong.",
          "Weather postponement: two tiles.",
        ],
      },
      {
        title: "5. Notices can't point at the thing they're about",
        body: [
          "Only a promo can link to a place, and only to a promo-kind place. No notice can link to an event. A reader can't tap from \"Raffle draw at 9\" to where the draw is, and the event page can't show its related news.",
        ],
      },
      {
        title: "6. Urgency never shows for team posts",
        body: [
          'FeedCard highlights closures and cancellations only when `trust === "official"`. Desk entries are always "staff", so the team\'s most urgent posts look routine. Safety notices are never highlighted.',
        ],
      },
      {
        title: "7. Wall chrome",
        list: [
          '"stale 15m" reads as a status ("it\'s been stale for 15m"). It\'s the window, so "Stale after 15m" is clearer.',
          "The flag pill *replaces* the age, and in Update mode it can't be clicked. Show both, and link the pill to Watch.",
          '"none" as an age is odd. "Nothing yet" reads better.',
          "The link-style buttons (Manage places, Manage tips) look different from the form buttons and navigate away from the wall.",
        ],
      },
      {
        title: "8. Text formatting",
        body: ["Feed bodies drop line breaks (winners, multi-line notices), and notices get one area while traffic gets several."],
      },
      {
        title: "9. Time changes after publishing are silent",
        body: [
          "Only an event Delay announces a time change. Advisories and closures can't have their times changed at all, so the team posts them again and readers get two unrelated cards. An event's new end time, saved in the schedule editor, changes nothing in the feed. Readers who saw \"until 6 PM\" never learn it now runs until 9, or that something ended early.",
        ],
      },
      {
        title: "10. Everything is equally loud",
        body: [
          "Every post is a feed card of the same weight, newest first. There's no way to put a missing child, a crush near the stage or the street dance champion in front of everyone, and nothing stops them sliding under the next traffic update.",
        ],
      },
      {
        title: "11. Long text is cut off, and events have nowhere to describe themselves",
        body: [
          'Every notice is one box whose first line becomes the title, cut at 140 characters. A post typed as one paragraph lost everything after that: seven live posts (sponsor games, promos, safety) ended mid-word, like "Digicast 6 PM discarded (", with empty details. Events had no description field, so the schedule note held one ("From the Calendar of Events poster"), and every delay or venue change replaced it.',
        ],
      },
    ],
  },
  fixSection: {
    eyebrow: "What to do",
    title: "Recommended fixes",
    intro:
      'In priority order. Effort: S is under half a day, M is one to two days, L is several days. "Data" means a schema or API change. Every scenario\'s "Recommended fix" accordion links here, and each fix links back to the scenarios it solves. When a fix lands, mark it done with its commit and update the scenarios it fixed; a scenario that now passes shows what it was.',
    columns: ["#", "Fix", "Effort", "Scenarios", "Status"],
  },
};

export const tiles: AuditTile[] = [
  {
    id: "weather",
    eyebrow: "Tile 1",
    title: "Weather",
    buttons: ["Post weather notice", "Refresh now (staff)"],
    intro: [
      "Post weather notice opens `NoticeForm` with category `weather`, which has free text, one optional area and a link. Refresh now re-runs Open-Meteo.",
    ],
    scenarios: [
      {
        id: "s-weather-1",
        scenario: '"PAGASA yellow rainfall warning until 6 PM, parade may be delayed"',
        result: "ok",
        before: "partial",
        what: "Until 6 PM is set on the notice, and \"About an event\" links it to the parade, so the schedule card shows the warning.",
        fix: {
          summary: "Add an Until time so the warning drops off after 6 PM, and link the notice to the parade.",
          fixes: ["until", "link-notices"],
        },
      },
      {
        id: "s-weather-2",
        scenario: '"Heat index 41 at Lacson, drink water, first-aid tents at 18th St"',
        result: "ok",
        what: "Works as text with the Lacson area. The tent location is text only.",
      },
      {
        id: "s-weather-3",
        scenario: '"Signal #1, Saturday\'s ElectriKaravan postponed"',
        result: "ok",
        what: 'This needs two forms on two tiles. On the Schedule side, "Delayed, time to follow" now covers the postponement without a made-up time, and the schedule shows a "Time to follow" badge.',
      },
      {
        id: "s-weather-4",
        scenario: '"Warning lifted, rain stopped"',
        result: "ok",
        before: "partial",
        what: 'The old warning is listed under the form. End now closes it from the tile, and Resolved posts a linked "All clear" follow-up that carries the news.',
        fix: {
          summary: 'Add End on the tile\'s live list, so lifting a warning closes the old card. Readers see "Warning lifted" on the original card.',
          fixes: ["live-list", "time-changes"],
        },
      },
      {
        id: "s-weather-5",
        scenario: '"Rain only at Capitol Lagoon, Plaza is dry"',
        result: "ok",
        what: "Works with one area. Two areas in one notice aren't possible.",
      },
      {
        id: "s-weather-6",
        scenario: '"Tomorrow\'s forecast for the street dance finals: fair"',
        result: "ok",
        before: "partial",
        what: 'When can be set to tomorrow, so the card reads "From tomorrow 7:00 AM" next to when it was posted.',
        fix: {
          summary: 'Add a When field with a day, so the card reads "Tomorrow" instead of "3 hours ago".',
          fixes: ["until"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "It shows up as a feed card with a Weather badge, filed under the **Safety** chip. Readers looking for weather won't expect it there.",
          "The top-bar and LivePulse weather only ever show Open-Meteo. A human warning never appears next to the temperature, where people look.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          "Clear: two buttons, both obvious.",
          "The tile's age (\"3m\") comes from Open-Meteo. The tile looks healthy even when nobody has posted a warning during a storm. That's acceptable, but worth knowing.",
        ],
      },
      {
        title: "Fixes: UI only",
        fix: true,
        items: [
          'Add an optional "Until" time to the notice form. `items.endsAt` already exists.',
          "Show the latest active weather notice next to the weather pill.",
          'Rename the feed chip to "Safety & weather".',
        ],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          "An optional *severity* (advisory / warning). `items.severity` exists but nothing uses it.",
          '"Lift" or "end" a notice, which sets `endsAt=now` instead of hiding it.',
        ],
      },
    ],
  },
  {
    id: "schedule",
    eyebrow: "Tile 2",
    title: "Schedule",
    buttons: ["Delay", "Cancel event", "Change venue", "Back on schedule", "Add event"],
    intro: [
      "The first four buttons all open `EventChangeForm`, with a New time / New venue / Cancelled / Back on switch. The picker lists events that started less than 12 hours ago. Add event opens `EventEditor`.",
    ],
    scenarios: [
      {
        id: "s-schedule-1",
        scenario: '"Street dance finals moved from 2 PM to 4 PM"',
        result: "ok",
        what: 'The new start is prefilled at +30 minutes and the end shifts with it. The schedule shows the new time with a Delayed badge and "Moved from 2:00 PM". The feed card shows "From 4:00 PM" with no day.',
      },
      {
        id: "s-schedule-2",
        scenario: '"Moved earlier, 4 PM → 3 PM"',
        result: "ok",
        before: "partial",
        what: 'The button says New time and the desk shows "Starts earlier, 3:00 PM"; the feed title reads "starts earlier, 3:00 PM" and the event stays scheduled, never Delayed. The schedule strikes the first time through.',
        fix: {
          summary: 'Say "New time", and only say Delayed when the time is later. Readers see "Starts earlier, 3:00 PM".',
          fixes: ["event-changes", "time-changes"],
        },
      },
      {
        id: "s-schedule-3",
        scenario: '"Electric MassKara tonight cancelled because of rain"',
        result: "ok",
        what: "The schedule shows it struck through with a Cancelled badge, and the feed card gets the urgent highlight, as desk cancellations now do. It can also go out pinned or as the banner, ending when the event does.",
      },
      {
        id: "s-schedule-4",
        scenario: '"Venue moved from Lacson to Paglaum Sports Complex"',
        result: "ok",
        what: 'The desk picks the new area along with the venue, and the feed card takes the new area.',
      },
      {
        id: "s-schedule-5",
        scenario: '"Delayed, starts after the parade ends"',
        result: "ok",
        what: '"Delayed, time to follow" saves the original start, shows a "Time to follow" badge and posts "delayed, time to follow".',
      },
      {
        id: "s-schedule-6",
        scenario: '"Not delayed after all, back to 2 PM"',
        result: "ok",
        what: '"Back on schedule" resets the start and end to the original and shows "Back to 2:00 PM" for the volunteer to confirm.',
      },
      {
        id: "s-schedule-7",
        scenario: '"Not cancelled after all, it\'s back on"',
        result: "ok",
        what: "Back on works here.",
      },
      {
        id: "s-schedule-8",
        scenario: '"Add: acoustic night at Capitol Lagoon, Oct 18, 7 PM"',
        result: "ok",
        what: 'The event is saved. Kind has no default, so the volunteer picks it, "Also post to the feed" publishes a "New:" card, and the link shows on the schedule.',
      },
      {
        id: "s-schedule-9",
        scenario: '"Food festival, Oct 1–31, nightly 5 PM–2 AM"',
        result: "ok",
        before: "no",
        what: 'One event with **Repeats every day until** Oct 31 and hours 5 PM–2 AM. Readers get a card per night ("Daily until Sat 31 Oct"), live only during that night\'s hours, not all month. The team sees one row, "Daily, 1–31 Oct, 5:00 PM–2:00 AM". Remaining gap: every night has the same hours, and a single night can\'t start late ("tonight only 9 PM") except by changing the hours for all the days to come.',
        fix: {
          summary: "Add daily hours and a date range instead of 31 entries.",
          fixes: ["recurrence"],
        },
      },
      {
        id: "s-schedule-10",
        scenario: '"It\'s started" / "It ended early"',
        result: "ok",
        what: 'Started and Ended on the desk write `actualStart` and `actualEnd`, and the schedule follows them over the clock. They post nothing to the feed. To tell readers it finished sooner than planned, **Ended early** moves the planned end and posts "Grand Parade ended early".',
      },
      {
        id: "s-schedule-11",
        scenario: '"The parade is running long, it ends at 9 PM, not 7"',
        result: "ok",
        before: "partial",
        what: 'Extended until on the event change form takes the new end (prefilled +30 min), shows "Extended until 9:00 PM" on the schedule and posts it to the feed, pinnable.',
        fix: {
          summary: 'Change the end from the tile. The schedule and the feed show "Extended until 9 PM", and it can be announced more widely.',
          fixes: ["time-changes", "tiers"],
        },
      },
      {
        id: "s-schedule-12",
        scenario: '"Acoustic night: three bands from Negros, free entry", then delayed an hour',
        result: "ok",
        before: "no",
        what: 'The Description holds what it is and shows on the schedule. The delay writes its "Moved from" line to the note and leaves the description alone.',
        fix: {
          summary: "Give events a Description that changes never touch.",
          fixes: ["headline-details"],
        },
      },
      {
        id: "s-schedule-13",
        scenario: '"Market Days, Oct 5–9" (date only, no time on the poster)',
        result: "ok",
        before: "partial",
        what: 'An **All day** event with **Repeats every day until** Oct 9 is one row for the team and a date-only "All day" card for each day, Oct 5 to 9. Remaining gap: it repeats every day; "Oct 5–9 except Sunday" takes a day called off.',
        fix: {
          summary: "Add daily hours with a date range for multi-day rows.",
          fixes: ["recurrence"],
        },
      },
      {
        id: "s-schedule-14",
        scenario: '"Coke Studio concert, Oct 17, time to be announced"',
        result: "ok",
        before: "partial",
        what: 'The event form has a **Time TBA** option. The row keeps the date at 00:00 (`planned_start` stays required), and readers see "Time to follow" and never "Happening now" until it is marked started.',
        fix: {
          summary: 'Add a Time TBA option for new events, shown as "Oct 17 · time to follow".',
          fixes: ["all-day"],
        },
      },
      {
        id: "s-schedule-15",
        scenario: '"Streetdance: the route runs along Araneta, the finale is at the SM reclamation arena"',
        result: "ok",
        before: "partial",
        what: 'The event form has **Add more venues** under the venue: "Route: Araneta St", "Ends at: SM Reclamation arena". The schedule card lists them under the main venue (a venue with an area links to it on Traffic), search finds them, and the Traffic map marks the ones with a mapped area while the event is on or within 3 hours. The main venue is still the one pin on the event\'s own area, and a venue change moves only that.',
        fix: {
          summary: 'A list of venues with roles (route, start, finish, staging) on the event.',
          fixes: ["multi-venue"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "Shown: time, venue (falling back to area), Delayed and Cancelled badges, note, Community badge.",
          "Saved but never shown: `url`, `area` when a venue is set, `done` status, `event_updates` history.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          "Four buttons open one form. That's fine as shortcuts, but \"Back on schedule\" doesn't say whether it restores the old time (it doesn't).",
          'Empty state: "No upcoming events" with a button labeled *Open the schedule* that actually opens the Add event form.',
          'The submit button, "Publish change", doesn\'t say what will happen. "Publish: moved to 4:00 PM" would.',
        ],
      },
      {
        title: "Fixes: UI only",
        fix: true,
        items: [
          'Relabel the empty-state button to "Add an event".',
          "Make the Venue change also offer to update the area.",
          'Show the event link on the schedule. Add an "Also post to the feed" checkbox to Add event.',
          "Highlight desk cancellations as urgent.",
        ],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          'Keep the original start (a new `originalStart`, or read it back from `event_updates`) so "Back on" restores it.',
          'Add a "Delayed, time TBA" status and a "Started / Ended" change that uses `actualStart` and `actualEnd`.',
          "Recurrence or daily hours for multi-day events. Larger job, later.",
        ],
      },
    ],
  },
  {
    id: "traffic",
    eyebrow: "Tile 3 · reference, light review",
    title: "Traffic",
    buttons: ["Update traffic"],
    intro: [
      "One form: road chips, then Traffic / Closed / Advisory. This tile gets the model right: several roads at once, a time window for closures, and Clear reopens a closed road.",
    ],
    scenarios: [
      {
        id: "s-traffic-1",
        scenario: '"Lacson closed 13th to 32nd, 3 PM to midnight"',
        result: "ok",
        what: "The map honours the times. The feed side is weaker: see below.",
      },
      {
        id: "s-traffic-2",
        scenario: '"Heavy on Araneta near SM"',
        result: "ok",
        what: "Updates the map and adds a feed card. The map colour fades after 90 minutes.",
      },
      {
        id: "s-traffic-3",
        scenario: '"Libertad jeepneys rerouted via Hernaez"',
        result: "ok",
        what: "Advisory with a note.",
      },
      {
        id: "s-traffic-4",
        scenario: '"Reopened early"',
        result: "ok",
        before: "partial",
        what: 'Traffic → Clear reopens a road and posts "Reopened", and the closure card ends. A closure that should end sooner takes Change time in Live now ("Now ends at 5:00 PM", old time struck through).',
        fix: {
          summary: 'Show a "Reopen now" button when a closed road is picked. Readers then see "Reopened early" on the closure card.',
          fixes: ["routing", "time-changes"],
        },
      },
      {
        id: "s-traffic-5",
        scenario: '"Robinsons parking full"',
        result: "ok",
        what: "Advisory. Robinsons can be added as an area inline.",
      },
      {
        id: "s-traffic-6",
        scenario: '"The Lacson advisory now runs until 9 PM, not 6"',
        result: "ok",
        before: "no",
        what: 'Change time on the advisory\'s row in the tile\'s Live now list takes the new end. The same card shows "Extended until 9:00 PM" with the old time struck through, and its headline is rebuilt. "Also post it to the feed" adds a linked follow-up card, suggested Pinned for a day change or a shift of an hour or more, or as a banner for staff.',
        fix: {
          summary:
            'Change the times on the advisory itself. Readers see "Traffic advisory extended until 9 PM" on its card and in the feed, and it can be announced more widely: pinned, or as a hero banner.',
          fixes: ["time-changes", "tiers", "live-list"],
        },
      },
      {
        id: "s-traffic-7",
        scenario: '"Half of Digicast near BCGC closed for kiosk clearance"',
        result: "ok",
        before: "partial",
        what: 'Closed now asks "Whole road" or "Partly closed (one lane or one side)", with an optional lanes note ("one side open"). It posts "Partly closed: Digicast until 9:00 PM", and the road shows partly closed (long red dashes) on the map and in the list. The map still colours the whole road, since roads are drawn as one line, so the lanes note is where readers learn which part.',
        fix: {
          summary: 'Add Partly closed / one lane between Advisory and Closed, with its own pin.',
          fixes: ["partial-closure"],
        },
      },
      {
        id: "s-traffic-8",
        scenario: '"Streets around the Plaza closed 3 PM–3 AM every night, Oct 1–18"',
        result: "ok",
        before: "partial",
        what: 'The traffic form\'s Closed level shows **Every day between** once From and Until fall on different days. One closure from Oct 1 to 18 with 3:00 PM–3:00 AM is titled "Closed daily 3:00 PM–3:00 AM: Plaza St until Sun 18 Oct", reads closed on the map and in the list only inside those hours, and "Closes 3:00 PM" outside them. Posting another closure or Clear ends the whole run.',
        fix: {
          summary: 'Daily hours on a closure, shown as closed only during each night\'s window.',
          fixes: ["closure-hours"],
        },
      },
      {
        id: "s-traffic-9",
        scenario: '"Rizal, Gonzaga, San Juan and Gatuslao closed"',
        result: "ok",
        before: "partial",
        what: 'The four Plaza streets are seeded as areas, so they can be picked. Any other street can be added inline.',
        fix: {
          summary: 'Seed the Plaza streets as areas.',
          fixes: ["seeds"],
        },
      },
    ],
    evidence: {
      text: '**Seen live:** "Closed: Lacson St · Street dance route" is still in today\'s feed 21 hours after its `endsAt`. The map is correct, but the feed card shows neither the end time nor the fact that it ended.',
      fixes: ["until"],
    },
    boxes: [
      {
        title: "Fixes: UI only",
        fix: true,
        items: [
          'When a closed road is picked, show a "Reopen now" button next to it.',
          'Feed card: show "until 12 AM", and "Ended" once the end has passed. Or drop the card (see Patterns).',
        ],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: ["Keep a history of an advisory's or closure's times, so extending it or ending it early updates the posted card instead of adding a new one."],
      },
    ],
  },
  {
    id: "safety",
    eyebrow: "Tile 4",
    title: "Public safety",
    buttons: ["Post safety notice"],
    intro: ["This is `NoticeForm` with category `crime_safety`: text, one area, a link."],
    scenarios: [
      {
        id: "s-safety-1",
        scenario: '"Lost child, boy, 6, red shirt, last seen near the Plaza. Bring him to the first-aid tent at Lacson-18th"',
        result: "ok",
        before: "partial",
        what: "It posts highlighted as urgent, pinned with an Until or as the hero banner from a staff token. \"About a place\" links it to the first-aid tent, so the Around card lists it, and it can be resolved from the tile. There's still no photo.",
        fix: {
          summary: "Mark it urgent and pinned, link it to the first-aid tent, and resolve it from the tile. A missing child is a case for the hero banner.",
          fixes: ["urgent", "tiers", "link-notices", "live-list"],
        },
      },
      {
        id: "s-safety-2",
        scenario: '"First aid and police assistance desks: Lacson-18th, Capitol, Plaza"',
        result: "ok",
        before: "no",
        what: "First aid, Police desk, Restroom and ATM are place kinds, listed under Services on Around, so they don't scroll away like a notice. One Add a place per desk.",
        fix: {
          summary: "Add First aid and Police desk as place kinds, grouped under Services on Around.",
          fixes: ["places"],
        },
      },
      {
        id: "s-safety-3",
        scenario: '"Pickpocket warning at the Plaza tonight"',
        result: "ok",
        before: "partial",
        what: 'Until "Tonight" is one tap, and the notice leaves the feed after that.',
        fix: {
          summary: 'Add an Until time ("until tonight").',
          fixes: ["until"],
        },
      },
      {
        id: "s-safety-4",
        scenario: '"Liquor ban 12 AM–6 AM"',
        result: "ok",
        before: "partial",
        what: 'When 12 AM and Until 6 AM. The card reads "From 12:00 AM until 6:00 AM" and leaves the feed at 6.',
        fix: {
          summary: "Add When and Until: 12 AM to 6 AM.",
          fixes: ["until"],
        },
      },
      {
        id: "s-safety-5",
        scenario: '"Child found, take it down"',
        result: "ok",
        before: "partial",
        what: "Resolved is on the tile's live list: Found, All clear or Other posts a short follow-up linked to the original and ends it, and the feed card says \"Follow-up to\".",
        fix: {
          summary: "Add Resolved on the tile's live list, which also tells readers the child was found.",
          fixes: ["live-list", "link-notices"],
        },
      },
      {
        id: "s-safety-6",
        scenario: '"Crush forming near the Lacson stage, avoid now"',
        result: "ok",
        before: "partial",
        what: "It posts highlighted as urgent. Staff can announce it as the hero banner, and team members can pin it, with Until set to when it should come down.",
        fix: {
          summary: "Add an Urgent toggle that pins it to the top of Now until it ends. For a crush, use the hero banner.",
          fixes: ["urgent", "tiers"],
        },
      },
      {
        id: "s-safety-7",
        scenario: '"Gun ban across Bacolod for the festival (SP resolution)"',
        result: "ok",
        before: "no",
        what: 'Pick the **Citywide** area (alias Bacolod). Before, posting with area `Bacolod` failed and the notice went out with no area.',
        fix: {
          summary: 'Seed a Citywide area for notices about the whole city.',
          fixes: ["seeds"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "Shown under the Safety chip, together with weather. The feed is capped at the 50 newest items, so on a busy night urgent notices get pushed out.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: ["The header shows \"1 flag\" *instead of* the age, so you can't tell when the last notice went out. In Update mode the pill can't be clicked."],
      },
      {
        title: "Fixes: UI only",
        fix: true,
        items: ["Until field, and a tile list of what's live with Resolve / Take down.", "Style safety notices as urgent on the reader side."],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          "Use `severity` for urgent notices, pinned to the top of Now while they're active.",
          "Service place kinds: first aid, police, restroom, ATM.",
          "Let any notice link to a place (`placeId`), not only promos.",
        ],
      },
    ],
  },
  {
    id: "announcements",
    eyebrow: "Tile 5",
    title: "Announcements",
    buttons: ["Post announcement", "Post activity"],
    intro: [],
    scenarios: [
      {
        id: "s-announcements-1",
        scenario: '"Free shuttle SM to Lagoon every 30 min, 4–11 PM"',
        result: "ok",
        before: "partial",
        what: "When 4 PM and Until 11 PM. The card shows both, and it is gone by the next morning.",
        fix: { summary: "Add When and Until: 4 to 11 PM.", fixes: ["until"] },
      },
      {
        id: "s-announcements-2",
        scenario: '"Official merch now sold at the Capitol"',
        result: "ok",
        before: "partial",
        what: "It posts, and the form now hints that a booth people can visit belongs on Around as a place.",
        fix: {
          summary: "Hint that a booth people can visit belongs in Places.",
          fixes: ["routing"],
        },
      },
      {
        id: "s-announcements-3",
        scenario: '"Correction to the 3 PM announcement"',
        result: "ok",
        before: "partial",
        what: "Staff and team members can Edit the original from the tile's live list, so the correction replaces it, and readers see when the card was corrected.",
        fix: {
          summary: "Add Edit on the tile's live list, so a correction replaces the original instead of adding a card, open it to team members for their own posts, and mark the card as corrected.",
          fixes: ["live-list", "corrections"],
        },
      },
      {
        id: "s-announcements-4",
        scenario: '"Keep the parade route notice on top all day"',
        result: "ok",
        before: "no",
        what: "Announce as Pinned with Until End of day. It stays at the top of Now until then, and isn't repeated in the feed.",
        fix: {
          summary: "Add a pin that lasts until the notice ends.",
          fixes: ["urgent", "tiers"],
        },
      },
      {
        id: "s-announcements-5",
        scenario: '"Opening program moved to 5 PM"',
        result: "ok",
        before: "partial",
        what: 'When the text says "moved" or "delayed", the form suggests Schedule → Delay, so the schedule gets the new time.',
        fix: {
          summary: "Suggest Schedule → Delay when the text reads like a time change.",
          fixes: ["routing"],
        },
      },
    ],
    boxes: [
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          '"Announcement" and "Activity" aren\'t explained. Both land under the Events chip. In the live data, the classifier filed a road closure as an Activity.',
          'The group also covers `other` ("News"), but there\'s no button for it.',
        ],
      },
      {
        title: "Fixes",
        fix: true,
        items: [
          'UI: one-line intros for each button (Activity = "something people can go and do, with a time and place"). When the text mentions a time change, suggest Schedule → Delay.',
          "Data: Until field, pinning (priority plus expiry), and an optional event link for activities.",
        ],
      },
    ],
  },
  {
    id: "places",
    eyebrow: "Tile 6",
    title: "Places",
    buttons: ["Add kiosk", "Add food", "Add ride", "Add thrift", "Manage places"],
    intro: [
      "All four Add buttons open `PlaceEditor` with the kind preselected, and the Kind dropdown is still there. The fifth kind, promo, lives on the Promos tile.",
    ],
    scenarios: [
      {
        id: "s-places-1",
        scenario: '"New pop-up food stall at Lacson-20th"',
        result: "ok",
        what: "Name, where, area, map pin, hours. Good.",
      },
      {
        id: "s-places-2",
        scenario: '"Capitol restroom closed tonight"',
        result: "ok",
        before: "no",
        what: 'Pick the Restroom kind ("CR" finds it) and set "Temporarily closed until" to tomorrow morning. The card stays on Around, marked "Closed until Tue 6:00 AM", and the Now teaser skips it. Hiding is a separate choice.',
        fix: {
          summary: 'Add Restroom as a kind ("CR" as an alias) and a "Closed until …" status.',
          fixes: ["places"],
        },
      },
      {
        id: "s-places-3",
        scenario: '"Robinsons ATM out of cash"',
        result: "ok",
        before: "no",
        what: 'ATM is a kind (under Services), and "Temporarily closed until" marks it out of cash with a time. With no time known, set a guess and extend it; there is no open-ended "out of order" state.',
        fix: {
          summary: "Add an ATM kind and a status for it.",
          fixes: ["places"],
        },
      },
      {
        id: "s-places-4",
        scenario: '"Booth moved to the other side of the street"',
        result: "ok",
        before: "partial",
        what: "Manage places opens in the slide-over. A notice linked to the place (\"Booth moved…\") lists on its Around card. The edit itself still posts nothing, so the team posts the notice.",
        fix: {
          summary: "Open Manage places in the slide-over so the edit stays on the wall, and post a notice linked to the place so readers hear it moved.",
          fixes: ["wall-labels", "link-notices"],
        },
      },
      {
        id: "s-places-5",
        scenario: '"Open 24h during the festival"',
        result: "ok",
        before: "partial",
        what: 'Hours are free text, so "open now" can\'t be worked out. When hours are empty, the card hides the hours row.',
        fix: {
          summary: "Hide the hours row when it's empty.",
          fixes: ["links"],
        },
      },
      {
        id: "s-places-6",
        scenario: '"This stall closed for good, remove it"',
        result: "ok",
        before: "partial",
        what: "Archive on the places list or in the editor (with a confirm) removes it from Around, pickers, search and the Places feed for good. Show archived finds it again to restore. Notices already linked to it keep their link.",
        fix: {
          summary: "Add archive or delete for places.",
          fixes: ["places"],
        },
      },
      {
        id: "s-places-7",
        scenario: '"Public Plaza and BCGC as festival venues"',
        result: "ok",
        before: "partial",
        what: 'Pick the **Venue** kind. Before, hubs were tagged Kiosk. The API agents didn\'t know new kinds could be added.',
        fix: {
          summary: 'Seed a Venue kind for festival hubs.',
          fixes: ["seeds"],
        },
      },
      {
        id: "s-places-8",
        scenario: '"Plaza site open 3 PM–3 AM (5 AM on highlight nights); shows start later"',
        result: "ok",
        before: "partial",
        what: 'The site hours go on as a daily event, 3 PM–3 AM until the last night, apart from the shows (their own events) and the place\'s Hours text field. Remaining gap: the 5 AM highlight nights can\'t differ per night, so they go in as their own events or in the note.',
        fix: {
          summary: 'Daily hours with a date range. A separate Site hours field only if readers confuse the two.',
          fixes: ["recurrence"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "Around shows kind, name, note, where (with a Maps link when pinned) and hours.",
          "Saved but never shown: `url` (the `AroundPlace` type has no url) and `area`. A promo announced at a spot shows in the feed but never on that spot's card. `places.itemId` isn't used.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          'Four buttons for one action, while "Add promo spot" sits on another tile.',
          'Kiosk and Food overlap. The Name hint, "e.g. Piaya kiosk", is food.',
        ],
      },
      {
        title: "Fixes: UI only",
        fix: true,
        items: [
          'One "Add a place" button plus Manage. Kind stays in the form.',
          "Hide the clock icon when hours are empty. Show the place link.",
          "Open Manage places in the slide-over so the volunteer stays on the wall.",
        ],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          "Service kinds (restroom, first aid, ATM, police).",
          'A "Closed until …" status, separate from hidden.',
          "Show a place's active promos and notices on its card.",
        ],
      },
    ],
  },
  {
    id: "games",
    eyebrow: "Tile 7",
    title: "Sponsor games",
    buttons: ["Post raffle", "Post sponsor game"],
    intro: [],
    scenarios: [
      {
        id: "s-games-1",
        scenario: '"Spin-the-wheel at the Lacson stage booth, 3–6 PM, buy 2 get a spin"',
        result: "ok",
        before: "partial",
        what: "The 3 to 6 PM window is set with When and Until, and \"About a place\" lists every Around place for the booth. There's no sponsor field.",
        fix: {
          summary: "Add When and Until for 3 to 6 PM, and the place picker for the booth.",
          fixes: ["until", "link-notices"],
        },
      },
      {
        id: "s-games-2",
        scenario: '"Raffle draw at 9 PM at the Plaza"',
        result: "ok",
        before: "partial",
        what: "The draw time goes in When, so the card reads \"From 9:00 PM\" (with the day when it isn't today).",
        fix: {
          summary: 'The draw time becomes the notice\'s When, so the card reads "Tonight 9 PM".',
          fixes: ["until"],
        },
      },
      {
        id: "s-games-3",
        scenario: '"Game cancelled because of rain"',
        result: "ok",
        before: "partial",
        what: "Take down is on the tile's live list, next to the game's post.",
        fix: {
          summary: "Add End or Take down on the tile.",
          fixes: ["live-list"],
        },
      },
      {
        id: "s-games-4",
        scenario: '"Raffle winner: ticket #1234"',
        result: "ok",
        before: "partial",
        what: "A raffle notice can be linked to its event, and the winners post for that event shows on the same schedule card, labeled \"1st: #1234\". A raffle that is only a notice has nothing to link back to.",
        fix: {
          summary: "Link the winners to the raffle, and label rows with ticket numbers.",
          fixes: ["link-notices", "winner-labels"],
        },
      },
      {
        id: "s-games-5",
        scenario: '"Same booth game daily, Oct 15–25"',
        result: "ok",
        before: "no",
        what: "An event (or a notice with **Every day between** hours) with a last day of Oct 25 is one entry; nobody reposts it each day. Remaining gap: no weekly or custom pattern, only every day.",
        fix: {
          summary: "Add a date range for a daily booth.",
          fixes: ["recurrence"],
        },
      },
      {
        id: "s-games-6",
        scenario: '"Mega Puppets Competition, Oct 14, 4 PM at Plaza de MassKara. Prizes ₱30k/₱20k/₱10k…" typed as one paragraph',
        result: "ok",
        before: "no",
        what: "The paragraph goes in the Post box whole, and the volunteer gives it a short title. A long title from an older client or script keeps its overflow in the post instead of losing it.",
        fix: {
          summary: "Split notices into a Post and a Title, and never drop the overflow of a long title.",
          fixes: ["headline-details"],
        },
      },
      {
        id: "s-games-7",
        scenario: '"Mega Puppets: ₱30k / ₱20k / ₱10k, plus consolation prizes"',
        result: "ok",
        before: "partial",
        what: 'The prize goes on the winner\'s row next to the name, so it lines up with who won.',
        fix: {
          summary: 'Put prizes on the winners\' result rows (label, prize, name) rather than on the game notice.',
          fixes: ["prize-ladder", "winner-labels"],
        },
      },
    ],
    boxes: [
      {
        title: "Fixes: UI only",
        fix: true,
        items: ["Offer the place picker for games and raffles too. Show the draw time on the card."],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          "Start and until times on notices, which already exist on `items`. A draw time is just `startsAt`.",
          '"Post raffle winners" from the raffle itself, linked to it.',
        ],
      },
    ],
  },
  {
    id: "thirdparty",
    eyebrow: "Tile 8",
    title: "3rd-party events",
    buttons: ["Merged into Schedule: Add event"],
    intro: [
      "This tile was merged into Schedule on 2026-10-02 and no longer exists on the wall. It had two buttons, a dateless feed notice and an `EventEditor` entry that never reached the feed, and a volunteer couldn't tell which to use.",
      'Now there is one **Add event** button on the Schedule tile. Its form asks "Who\'s putting it on?" (the MassKara Festival, a sponsor, or someone else). The scenarios below are checked against that form.',
    ],
    scenarios: [
      {
        id: "s-thirdparty-1",
        scenario: '"Concert at SMX, Oct 18 8 PM, tickets ₱500, by Negros Music Collective"',
        result: "ok",
        before: "partial",
        what: 'Add event takes the date, venue, **Someone else** with the organiser, and the tickets link, and posts to the schedule and the feed. The price has no field of its own and goes in the description.',
        fix: {
          summary: "Use one Add community event form with date, venue, organiser and tickets link, posted to the schedule and the feed.",
          fixes: ["community-event"],
        },
      },
      {
        id: "s-thirdparty-2",
        scenario: '"Bar party along Lacson every night"',
        result: "ok",
        before: "partial",
        what: "The Nightlife, Bazaar and Sports kinds exist, and the party is one event that repeats every day until its last night. Remaining gap: it has to end on a set day (at most 62 days on), and every night has the same hours.",
        fix: {
          summary: "Add daily hours with a date range.",
          fixes: ["recurrence"],
        },
      },
      {
        id: "s-thirdparty-3",
        scenario: '"The night market is cancelled"',
        result: "ok",
        before: "partial",
        what: "Every event is on the schedule now, so Schedule → Cancel event, on the same tile as Add event, covers it and posts the cancellation.",
        fix: {
          summary: "Cancel community events from the Schedule tile, next to Add event.",
          fixes: ["community-event"],
        },
      },
      {
        id: "s-thirdparty-4",
        scenario: '"Here\'s the ticket / FB page link"',
        result: "ok",
        before: "partial",
        what: 'The feed card shows the link as "More info", apart from the source name, and the schedule card as "Tickets / info".',
        fix: {
          summary: 'Show a "Tickets / info" link to readers.',
          fixes: ["links"],
        },
      },
      {
        id: "s-thirdparty-5",
        scenario: '"Moved to Saturday"',
        result: "ok",
        before: "partial",
        what: 'Schedule tile → Change time takes the new day: "Moved to Sat 18 Oct" on the schedule and in the feed, with the first day struck through.',
        fix: {
          summary: 'Readers see "Moved to Sat 18 Oct" on the schedule and in the feed.',
          fixes: ["time-changes"],
        },
      },
      {
        id: "s-thirdparty-6",
        scenario: '"Coca-Cola Night Concert at the Plaza, Oct 15 8 PM"',
        result: "ok",
        before: "partial",
        what: 'Add event → **A sponsor** → Presented by Coca-Cola. Readers see "Presented by Coca-Cola" and the Community badge. A sponsor-game or raffle form that mentions a concert or show suggests Add event, and the classifier files a sponsor concert post as a community event.',
        fix: {
          summary: 'Add community events through one form with a Presented by field, so sponsor concerts sit with the other events and show "Presented by Coca-Cola".',
          fixes: ["community-event"],
        },
      },
    ],
    boxes: [
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          "Resolved: one Add event button, and the form asks who is putting it on. The rule for volunteers is: if people show up at a time, it's an event.",
          "Still open: a poster with a date range (Oct 5–9) or a nightly party needs one row per day.",
        ],
      },
      {
        title: "Fixes",
        fix: true,
        items: [
          "Done: one Add event form with date or All day or Time TBA, venue, link, who's putting it on (organiser or Presented by), and nightlife, bazaar and sports kinds. It creates the schedule entry and a feed card.",
          "Next: daily hours with a date range, and a price or tickets field.",
        ],
      },
    ],
  },
  {
    id: "winners",
    eyebrow: "Tile 9",
    title: "Winners",
    buttons: ["Post winners"],
    intro: [
      'The form has an event picker (`kind=competition` only, with the default "Not on the schedule"), a contest name, and places in order (three, up to ten).',
    ],
    scenarios: [
      {
        id: "s-winners-1",
        scenario: '"Street dance: 1 Brgy 16, 2 Brgy Taculing, 3 Brgy Mandalagan"',
        result: "ok",
        before: "partial",
        what: "The picker lists recent events, and the results show as a list on the feed card (label, name, prize) and as a Results badge with the top 3 on the street dance\\s schedule card, with the rest behind \"Show all\". The champion can go out as the hero banner.",
        fix: {
          summary:
            "Keep the line breaks, list every recent event in the picker, and show the results on the schedule card. The street dance champion is worth the hero banner.",
          fixes: ["winners-feed", "winners-schedule", "tiers"],
        },
      },
      {
        id: "s-winners-2",
        scenario: '"Mask-making contest, plus Best Costume and Crowd Favourite"',
        result: "ok",
        before: "partial",
        what: "Each row takes its own label (Best Costume, Crowd Favourite) and prize, shown as columns on the feed and schedule cards.",
        fix: {
          summary: "Let each row take a label (Best Costume) instead of forcing ordinals.",
          fixes: ["winner-labels"],
        },
      },
      {
        id: "s-winners-3",
        scenario: '"Correction: 2nd and 3rd were swapped"',
        result: "ok",
        before: "partial",
        what: "Posting again for the event posts a Corrected version: the feed card and the schedule card show the new order with the old names struck through and the rows marked Changed. The earlier card is hidden, though it is a new feed item rather than the same one edited.",
        fix: {
          summary:
            'Posting again for the same event replaces the earlier results. Readers see "Results corrected: 2nd and 3rd place" on the card and in the feed.',
          fixes: ["winner-labels", "result-changes"],
        },
      },
      {
        id: "s-winners-4",
        scenario: '"Results will be announced tomorrow at 10 AM"',
        result: "ok",
        before: "no",
        what: "Post \"Results expected tomorrow 10 AM\" as a placeholder. The feed card and the schedule card say \"Expected ...\"; the real results replace it and can go out as a hero banner.",
        fix: {
          summary: 'Add a "Results pending until \u2026" placeholder. When the results land, "Results are in" replaces it and can go out as a hero banner.',
          fixes: ["winner-labels", "result-changes", "tiers"],
        },
      },
      {
        id: "s-winners-5",
        scenario: '"Sponsor raffle winners: tickets #1234, #0088"',
        result: "ok",
        before: "partial",
        what: "Rows take a label, so tickets read \"Ticket #1234\" and \"Ticket #0088\".",
        fix: {
          summary: "Label rows with ticket numbers.",
          fixes: ["winner-labels"],
        },
      },
      {
        id: "s-winners-6",
        scenario: '"Standings after day 1: Brgy 16 leads, Brgy Taculing 2nd, finals on Sunday"',
        result: "ok",
        before: "no",
        what: "Post standings as a Standings stage. The cards carry a Standings tag, and the final results replace them.",
        fix: {
          summary:
            'Post standings as a stage of the results ("Day 1 standings") and update them in place. Each update posts "Standings updated" to the feed, with the same Announce as choice.',
          fixes: ["result-changes", "tiers"],
        },
      },
      {
        id: "s-winners-7",
        scenario: '"Brgy 16 was disqualified; Brgy Taculing is now champion"',
        result: "ok",
        before: "no",
        what: "Revise the results: the cards show the new champion with the disqualified name struck through, marked Changed and tagged Revised.",
        fix: {
          summary:
            'Revise the results in place. Readers see "Results revised" with what changed and the old standing crossed out, and it can go out as a hero banner.',
          fixes: ["result-changes", "tiers"],
        },
      },
      {
        id: "s-winners-8",
        scenario: '"Champion Brgy 16, ₱100k. Special award: Best Costume to Brgy Mandalagan"',
        result: "ok",
        before: "partial",
        what: "The places hold the standings, and Details under them holds the prize and the special award.",
        fix: {
          summary: "Add an optional Details box under the winners.",
          fixes: ["headline-details"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "With an event picked, the event is set to `done` and the results go into `event_updates.results`. **Neither is read**: `/schedule` maps `done` to `on_time`, and the schedule card has no results. Someone opening the schedule after the finals won't find who won.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          'When the picker is empty it only offers "Not on the schedule", which looks broken.',
          "You have to already know the hidden rule that the event must be of kind Competition.",
        ],
      },
      {
        title: "Fixes: UI only",
        fix: true,
        items: [
          "List every event from the past two days in the picker, with competitions first.",
          "Add `white-space: pre-line` to feed card bodies. This also fixes multi-line notices.",
          "Carry the event's venue and area onto the winners item.",
        ],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: [
          "Show the results on the schedule card (read `event_updates`) and a Done or Results badge.",
          "Label each place (Champion / 1st runner-up / Best Costume) instead of forcing ordinals.",
          "An edit path that replaces the earlier results instead of adding a second card.",
        ],
      },
    ],
  },
  {
    id: "promos",
    eyebrow: "Tile 10",
    title: "Promos",
    buttons: ["Announce a promo", "Add promo spot"],
    intro: ["A promo notice can be linked to a promo-kind place. The form's intro line tells the two buttons apart well."],
    scenarios: [
      {
        id: "s-promos-1",
        scenario: '"Piaya stall at the Plaza: 2-for-1 until 5 PM today"',
        result: "ok",
        before: "partial",
        what: "Until 5 PM is set on the promo, so the deal leaves the feed at 5 PM.",
        fix: {
          summary: "Add an Until time, so the deal drops off at 5 PM.",
          fixes: ["until"],
        },
      },
      {
        id: "s-promos-2",
        scenario: '"Sponsor booth giving free water at the Lacson stage during the parade"',
        result: "ok",
        before: "partial",
        what: "When and Until set the time window, and \"About an event\" links the deal to the parade, which lists it on the schedule card.",
        fix: {
          summary: 'Add an event link ("during the parade") and a time window.',
          fixes: ["link-notices", "until"],
        },
      },
      {
        id: "s-promos-3",
        scenario: '"The promo ended early, take it down"',
        result: "ok",
        before: "partial",
        what: 'End now takes it off the feed. To end it at a set time instead, Change time reads "Now ends at 5:00 PM" on the same card with the old end struck through, and a linked follow-up goes out.',
        fix: {
          summary: 'Add End or Take down on the tile. The card then reads "Ended early".',
          fixes: ["live-list", "time-changes"],
        },
      },
      {
        id: "s-promos-4",
        scenario: '"10% off with a MassKara ticket stub, all week"',
        result: "ok",
        before: "partial",
        what: 'Until takes a date a week out, and the card reads "Until Sun 25 Oct, 11:59 PM".',
        fix: {
          summary: "Add Until with a date for a week-long deal.",
          fixes: ["until"],
        },
      },
      {
        id: "s-promos-5",
        scenario: '"Promo at a stall that isn\'t listed"',
        result: "ok",
        before: "partial",
        what: "\"Add a spot\" opens the place editor inside the form and selects the new place when saved. The picker lists every Around place, promo spots first, so a deal at a Food stall can be linked. Adding isn't offered to a community token.",
        fix: {
          summary: "Add a spot inline, and let the picker show every Around place.",
          fixes: ["link-notices"],
        },
      },
      {
        id: "s-promos-6",
        scenario: '"The 2-for-1 is extended to Sunday"',
        result: "ok",
        before: "no",
        what: 'Change time on the promo\'s row in Live now takes the new end, so the same card reads "Extended until Sun 18 Oct, 9:00 PM" with the old end struck through. A linked follow-up card goes out too, unless it is switched off.',
        fix: {
          summary: 'With an Until on the promo, extending it shows "Promo extended until Sun" on the same card, and it can be announced more widely.',
          fixes: ["until", "time-changes", "tiers"],
        },
      },
    ],
    boxes: [
      {
        title: "Fixes: UI only",
        fix: true,
        items: ["Add a spot inline from the picker. Let the picker show every Around place."],
      },
      {
        title: "Fixes: data model",
        fix: true,
        items: ["Until and date range (`endsAt`). Show the active promo on the place's Around card."],
      },
    ],
  },
  {
    id: "tips",
    eyebrow: "Tile 11",
    title: "Tips",
    buttons: ["Add tip", "Manage tips"],
    intro: [],
    scenarios: [
      {
        id: "s-tips-1",
        scenario: '"Bring an umbrella and small bills"',
        result: "ok",
        what: 'Shows on the Visit page, and on Now\'s "Know before you go" if the section is featured.',
      },
      {
        id: "s-tips-2",
        scenario: '"Best spot to watch the street dance: Lacson near the Capitol"',
        result: "ok",
        what: "No map pin, which is a minor gap.",
      },
      {
        id: "s-tips-3",
        scenario: '"Tonight only: avoid Lacson after 10 PM"',
        result: "ok",
        before: "no",
        what: "Tips never expire, but Add tip now says tonight-only warnings belong in an announcement.",
        fix: {
          summary: "Hint that tonight-only warnings are announcements.",
          fixes: ["routing"],
        },
      },
      {
        id: "s-tips-4",
        scenario: '"This tip is outdated, fix it"',
        result: "ok",
        before: "partial",
        what: "Manage tips opens in the slide-over, so the volunteer stays on the wall.",
        fix: {
          summary: "Open Manage tips in the slide-over.",
          fixes: ["wall-labels"],
        },
      },
      {
        id: "s-tips-5",
        scenario: '"Move the cash tip to the top"',
        result: "ok",
        what: "Up and down arrows in Manage.",
      },
    ],
    boxes: [
      {
        title: "Clear / confusing",
        fix: false,
        items: ['If there are no sections, Add tip shows "Add a section first" with no button to do it.'],
      },
      {
        title: "Fixes",
        fix: true,
        items: [
          'UI: a hint on the Add tip form ("Lasting advice. For tonight-only warnings, post an announcement"), plus an add-section button in the empty state.',
        ],
      },
    ],
  },
  {
    id: "crowd",
    eyebrow: "Tile 12",
    title: "Crowd reports",
    buttons: ["Crowd level"],
    intro: [
      'The tile has one button, Crowd level: pick one to ten places, Quiet, Busy or Packed ("Packed: hard to move"), and an optional note. It writes a reading, like Update traffic does, and the tile follows the newest one. Visitors send the same form from the Contribute page ("How crowded is it?"); it waits under Visitor suggestions on the team desk until a team member approves it.',
    ],
    scenarios: [
      {
        id: "s-crowd-1",
        scenario: '"Plaza packed, you can\'t move"',
        result: "ok",
        before: "no",
        what: "Crowd level, Public Plaza, Packed. Readers see \"Public Plaza packed · as of 7:40 PM\" with the traffic strip on Now, and a red ring at the Plaza on the Traffic map (when the area has coordinates) plus a line in the Crowds list under it. It fades after 90 minutes unless updated.",
        fix: {
          summary: "Add a team Crowd level update (Plaza: packed).",
          fixes: ["crowd-level", "crowd-copy"],
        },
      },
      {
        id: "s-crowd-2",
        scenario: '"Lacson stage area thinning out"',
        result: "ok",
        before: "no",
        what: "A new Crowd level for the same place replaces the old one: the newest reading per place is the one readers see, so Busy then Quiet shows Quiet.",
        fix: {
          summary: "Add a team Crowd level update (busy → quiet).",
          fixes: ["crowd-level", "crowd-copy"],
        },
      },
      {
        id: "s-crowd-3",
        scenario: '"Long line at the Capitol Lagoon entrance"',
        result: "ok",
        before: "no",
        what: "The optional note (up to 200 characters) is shown beside the level in the Crowds list under the map. The Now strip shows the level only.",
        fix: {
          summary: "Add a Crowd level update with a note for the line.",
          fixes: ["crowd-level", "crowd-copy"],
        },
      },
      {
        id: "s-crowd-4",
        scenario: '"The last crowd report was wrong"',
        result: "ok",
        before: "no",
        what: "A visitor's report is a suggestion, so nothing reaches readers until a team member approves it; Turn down is the dismiss. The list shows how long ago it was sent, and approving one older than 45 minutes is refused (it can still be turned down). A reading already posted can't be withdrawn: post a new level for the place, which replaces it. Corroboration is by the reviewer: two visitors saying the same thing don't count for more than one.",
        fix: {
          summary: "Add a staff review list for reports (corroborate / dismiss).",
          fixes: ["crowd-level", "crowd-copy"],
        },
      },
      {
        id: "s-crowd-5",
        scenario: '"Plaza and Lacson both packed"',
        result: "ok",
        before: "no",
        what: "Crowd level takes one to ten places in one go, as Update traffic does. Readers see \"Public Plaza packed · Lacson St packed\".",
        fix: {
          summary: "Let Crowd level take several areas at once, like Update traffic.",
          fixes: ["crowd-level", "crowd-copy"],
        },
      },
    ],
    boxes: [
      {
        title: "Reader side",
        fix: false,
        items: [
          "Now shows one line under Traffic now, packed first and limited to four places (the reader's zone first), and nothing when there are no live readings. The Traffic page draws a ring per place (open, so it is never read as a road) with its own legend entry, and lists every live reading under the map, including places with no coordinates, which have no ring.",
        ],
      },
      {
        title: "Clear / confusing",
        fix: false,
        items: [
          "A reader can't tell a visitor's report from the team's: both are team entries once approved. A visitor's report waits for approval instead of counting automatically, so it is only as quick as the team. The tile stays gray when nothing has been reported for 15 minutes, which is normal between events. The tile does not count visitor reports waiting; the Visitor suggestions badge on the team desk does.",
        ],
      },
      {
        title: "Fixes",
        fix: true,
        items: [
          'Done: a team "Crowd level" update shaped like Update traffic, shown on Now and the map, and the Contribute page\'s "How crowded is it?" writing the same thing after approval.',
          "Open: let a couple of matching visitor reports count without waiting, and let a visitor see the level their own report added.",
        ],
      },
    ],
  },
];

export const fixes: Array<AuditFix & { id: FixId }> = [
  {
    id: "until",
    title: "When and until on every notice",
    effort: "M · UI + API",
    problem:
      "Nine notice categories share a form with no time fields. The feed card ignores `endsAt` and shows `startsAt` without a day, and `/api/feed` never drops expired items. Yesterday's Lacson closure and a 20-hour-old promo are still live.",
    ui: [
      'Add optional **When** and **Until** fields to `NoticeForm`, with quick picks ("for 1 hour", "until tonight", "until end of day") so nobody types a date on a phone.',
      'Feed card: show "until 5 PM", and add the day ("Sat 9 PM") when it isn\'t today.',
      'Once `endsAt` has passed, hide the item from the default feed or show it once as "Ended".',
    ],
    data: [
      "No schema change: `items.startsAt` and `items.endsAt` already exist. Add the fields to the notice branch of the `/api/team/updates` schema, and add an `endsAt` filter to `/api/feed`.",
    ],
    status: { state: "done", commit: "7ebb788" },
  },
  {
    id: "winners-feed",
    title: "Readable winners in the feed",
    effort: "S · UI",
    problem:
      'Results render as "1st: … 2nd: … 3rd: …" on one line, the event picker only lists competition-kind events so it looks empty, and the winners item has no location.',
    ui: [
      "Add `white-space: pre-line` to feed card bodies. This also fixes multi-line notices.",
      "List every event from the last two days in the picker, competitions first.",
      "Copy the picked event's area onto the winners item.",
    ],
    data: [],
    status: { state: "done", commit: "1bc2faa" },
  },
  {
    id: "crowd-copy",
    title: "Truthful Crowd reports tile",
    effort: "S · UI",
    problem: 'The tile says the public sends reports from a form that shows "Coming soon". It\'s permanently gray, which teaches staff to ignore gray tiles.',
    ui: [
      'Change the copy to "Public report form isn\'t built yet", or hide the tile until it exists.',
      'Remove "crowd reports" from the Traffic page subtitle.',
    ],
    data: [],
    status: { state: "done", commit: "8a9ba8f" },
  },
  {
    id: "back-on",
    title: '"Back on schedule" restores the original time',
    effort: "M · Data",
    problem:
      'A delay overwrites `plannedStart`, so "Back on" keeps the new time and clears the "Moved from" note. Readers see the wrong time marked as on time.',
    ui: ['When Back on is picked after a delay, show "Back to 2:00 PM" so the volunteer can confirm the time.'],
    data: ['Store `originalStart` on events, or read the first start back from `event_updates`. "Back on" resets `plannedStart` and `plannedEnd` to it.'],
    status: { state: "done", commit: "e0f0974" },
  },
  {
    id: "headline-details",
    title: "Post and title, so nothing is cut off",
    effort: "S · Data + UI",
    problem:
      "Notices are one box, first line as title, cut at 140 characters with the rest dropped. Events have no description, so their note doubles as one and every change replaces it. Winners have nowhere for prizes or special awards.",
    ui: [
      "Notices get a **Post** box for the content readers see, then a **Title** the poster writes to sum it up (120 characters, with a count). Both are required, and the title is never cut from the post.",
      'The schedule editor gets a **Description**, shown on the schedule and used as the body of the "New:" feed post. The note becomes the short live line ("Gates open 1 PM") that changes replace.',
      "Post winners gets an optional **Details** box under the places.",
    ],
    data: [
      "The notice API takes `title` and `body`; the older one-box `text` still works. Any title over 140 characters, from an older client, a script or the intake of outside posts, moves its overflow into the body at a sentence or word break instead of being cut.",
      "Write the unused `events.description`, and move existing descriptive notes into it (migration 0020).",
    ],
    status: { state: "done", commit: "f13e5f0" },
  },
  {
    id: "live-list",
    title: '"Live now" list with undo on each tile',
    effort: "M · UI",
    problem:
      "In Update mode the tile hides what's already posted, so volunteers post duplicates. Taking something down only happens in the intake table or on the team desk. Corrections end up as a second card next to the first.",
    ui: [
      "Under a tile's buttons, list its active items (up to 3) with **End** (sets `endsAt=now`), **Take down** (hide) and, for staff, **Edit**.",
      "Reuse `availableActions`, so team members can only act on their own entries.",
    ],
    data: [],
    status: { state: "done", commit: "2bbfc58" },
  },
  {
    id: "corrections",
    title: "Corrections readers can see",
    effort: "S · UI + API",
    problem:
      "Staff can edit a live post in place, but team members can only take theirs down and post again. Readers get no sign a card was corrected, so a changed time or place can go unnoticed.",
    ui: [
      "Let team members edit their own live posts from the tile's live list.",
      'Show "Corrected 3:10 PM" on a feed card that was edited after it went live.',
    ],
    data: ["Allow the `edit` item action on a collector's own desk entries, and return the last edit time (from `item_actions`) with the feed."],
    status: { state: "done", commit: "1e96878" },
  },
  {
    id: "time-changes",
    title: "Announce time changes: extended, ended early, moved",
    effort: "M · Data + UI",
    problem:
      'Once something with a time is published, changing that time is silent or looks like a new post. Advisories and closures can only be posted again, with no link to the first. An event\'s new end, saved in the schedule editor, never reaches the feed; Delay is the only change that announces itself. Readers who saw "until 6 PM" never learn it now runs until 9.',
    ui: [
      "Let the team change the times of anything already posted (advisory, closure, notice, promo, event) from its row on the tile or its editor, instead of posting it again.",
      'Word the change from the old and new times: **extended** (a later end), **ended early** (an earlier end), **starts later** or **starts earlier**, and **moved to Sat 18 Oct** (another day). Show it on the original card with the old time crossed out ("Traffic advisory extended until 9 PM"), and as a short entry at the top of the feed.',
      "When saving a time change, offer an **Announce as** choice for more visibility: Feed, Pinned or Hero banner (see Tiered announcements). Suggested default: Pinned for another day or a shift of an hour or more, Feed for smaller ones.",
      'Use the same wording for events next to Delay: "Extended until 9 PM", "Ended early", "Moved to Sat 18 Oct".',
    ],
    data: [
      "Keep each time change instead of overwriting it: a change row with the old and new `startsAt` and `endsAt`, who made it, and whether it was announced. Events already have `event_updates`; items need the same.",
      "Link the feed entry for a change to the original item, so readers see one story that updated rather than two unrelated posts.",
      'Builds on "When and until on every notice" (items need times to change) and the tile\'s "Live now" list (a place to change them).',
      "Done (78c556e for events, then items): advisories, closures and notices take Change time from the tile's Live now list. It keeps the times readers first saw (`original_starts_at`, `original_ends_at`) and the change in words (`time_change`), logs a `retime` item action with who made it, rebuilds an advisory's or closure's headline, and with Also post it to the feed publishes a linked follow-up (`parent_item_id`) that ends with the post. Feed cards show the change as a tag with the former time struck through.",
    ],
    status: { state: "done", commit: "283e667" },
  },
  {
    id: "all-day",
    title: "All-day and time-TBA events",
    effort: "S · Data + UI",
    problem:
      "Every event needs a start time. Poster rows with only a date (Market Days, sectoral days) and concerts with the time still to be announced either get a made-up time or are left off the schedule.",
    ui: ['Add **All day** and **Time TBA** options to the event editor that drop the time picker. Readers see "All day" or "Oct 17 · time to follow".'],
    data: [
      "Added `all_day` and `time_known` flags to `events`. `planned_start` stays required and holds the date at 00:00 in Bacolod, so a date-only row sorts first in its day.",
      'An all-day event counts as "Happening now" only from 6 AM to 10 PM on its date; a time-to-follow one never does until the team marks it started. Giving one a time with Delay makes it a timed event.',
    ],
    status: { state: "done", commit: "05c889c" },
  },
  {
    id: "tiers",
    title: "Tiered announcements: feed, pinned, hero banner",
    effort: "M \u00b7 Data + UI",
    problem:
      'Every post has the same weight: a card in the feed, newest first. A missing child, a crush near the stage, a cancelled parade and the street dance champion sit among traffic updates, and there\'s no way to say "everyone should see this now".',
    ui: [
      'An **Announce as** choice on every notice form, and on every change to times or results: **Feed** (the default, a card in the feed), **Pinned** (stays at the top of Now until it ends) or **Hero banner** (a full-width splash at the top of Now, above "Happening now").',
      "Hero banner: one at a time, staff only, and it needs an Until. A newer hero replaces the older one, which drops to pinned; the form says so when Banner is picked. Readers can close it, and it stays closed on their device.",
      "Pinned: team members can pin. Up to three pins show, newest first; older ones fall back to the feed.",
      "Show each item's tier on the tile's \"Live now\" list, with a way to lower it (Hero banner \u2192 Pinned \u2192 Feed) or end it.",
    ],
    data: [
      "Store the tier on the item (`feed`, `pinned`, `hero`), with `endsAt` required for pinned and hero so nothing stays loud after it's over. `items.severity` exists and is unused, so it can hold this.",
      "Have `/api/feed` return the active hero and pins apart from the feed list, so the Now page can place them.",
    ],
    status: { state: "done", commit: "b1bedf8" },
  },
  {
    id: "winners-schedule",
    title: "Winners shown on the schedule",
    effort: "M · API + UI",
    problem: "Results saved to `event_updates.results` and the event's `done` status are never read. `/schedule` maps done to on_time.",
    ui: ["Schedule card: a Results badge, and the top 3 under the title with a \"Show all N results\" disclosure that opens the full list in place (there is no item page to link to). A finished event with results is not dimmed, and the \"earlier\" fold says how many hold results."],
    data: [
      "`/schedule` returns `done` as its own status, the latest posted version as `results` and `resultsExpectedAt` for a placeholder, and lists an older event while its latest version is under 36 hours old.",
    ],
    status: { state: "done", commit: "baf3e9f" },
  },
  {
    id: "result-changes",
    title: "Announce result changes: standings, corrections, final results",
    effort: "M \u00b7 Data + UI",
    problem:
      'Winners only takes final results, once. Standings between rounds, corrections and revisions (a disqualification) can only be posted again as another "Winners" card, so readers see conflicting results with nothing saying which is current.',
    ui: [
      "Let one contest's results go through stages: **Standings** (after a round), **Final**, and later **Corrected** or **Revised**. Each is an update to the same results, not a new post.",
      'Each change posts to the feed and the Now page, worded from what changed: "Standings updated: Street dance, day 2", "Results are in: Street dance", "Results corrected: 2nd and 3rd place". The results card shows the latest, with changed places marked and the old ones crossed out.',
      "Saving a change offers the same **Announce as** choice (Feed, Pinned, Hero banner). Suggested default: Hero banner for the final results of a headline contest, Pinned for corrections, Feed for standings.",
    ],
    data: [
      "Landed in 43409b5: the team desk keeps every version (stage, places, prizes, `was`) in `result_versions`, with standings, final, corrected and revised stages, and a form that pre-fills from the latest. Readers now get the results as a list on the feed card and hero banner (stage tag, changed rows with the old name struck through, the desk's note beneath) and on the schedule card. Still not done: each version is its own feed item with the earlier one hidden, rather than one item edited in place, so a link to the old card goes stale and the item's published time is the latest version's. Keep every version of a contest's results (stage, places, who posted it, when) instead of a new item each time. `event_updates.results` can hold them for an event; a contest that isn't on the schedule needs its own row.",
      "Link each feed entry to the contest, so the feed and the schedule show one story that updated. The link is `result_versions.item_id` and `event_id`; the schedule shows the latest version for its event.",
    ],
    status: { state: "done", commit: "baf3e9f" },
  },
  {
    id: "community-event",
    title: "One Add event door; the form asks who's putting it on",
    effort: "M · UI + API",
    problem:
      'The 3rd-party events tile had "Post community event" (a dateless feed notice) and "Add to schedule (not official)" (a schedule entry that never reached the feed, with an Official checkbox). Splitting by official or not mirrored the data model, not how people think: a volunteer with a concert poster could not tell which button to use.',
    ui: [
      'One **Add event** button, first on the Schedule tile; the 3rd-party events tile is gone. The rule for volunteers: if people show up at a time, it\'s an event.',
      'The form asks **Who\'s putting it on?** with three cards: the MassKara Festival (official, optional Presented by), a sponsor (Presented by required) or someone else (Organiser required). Saving always posts a feed card too.',
      "Sponsor game and raffle forms suggest Add event when the text mentions a concert, show or party, or has a start time and an area.",
    ],
    data: [
      "Added `organiser` and `presented_by` to `events`, and the nightlife, bazaar and sports kinds. The feed card for a non-official event is a `third_party_event` with \"Presented by X\" or \"By X\" in its body; the schedule card shows the same line and the Community badge.",
      "The classifier files a sponsor post about a concert, show, gig, party or night as `third_party_event`, not `sponsor_game`. The Schedule group now lists `third_party_event` and the `events:community` feed.",
    ],
    status: { state: "done", commit: "cadff32" },
  },
  {
    id: "urgent",
    title: "Urgent and pinned notices",
    effort: "S–M · UI + Data",
    problem:
      "The urgent highlight only fires for official-page items, so team-posted cancellations, closures and safety alerts look routine. Nothing can be pinned, and weather warnings never appear next to the weather pill.",
    ui: [
      "Highlight desk cancellations, closures and safety notices as urgent.",
      'Add an "Urgent: pin to top of Now until it ends" toggle for safety and announcements. This is the Pinned level of Tiered announcements.',
      "Show the active weather warning next to the weather pill.",
    ],
    data: ["Use the existing, unused `items.severity` column. Pinning = severity plus `endsAt`, so a pin can't outlive its notice."],
    status: { state: "done", commit: "259cd86" },
  },
  {
    id: "links",
    title: "Show the links and details that are already saved",
    effort: "S · UI + API types",
    problem: "Event `url`, place `url` and place `area` are saved but never sent to readers. Empty hours show a bare clock icon.",
    ui: ['Add a "Tickets / info" link on schedule and Around cards, labeled as a link rather than as the source name.', "Hide the hours row when it's empty."],
    data: ["Add `url` to `ScheduleEvent` and `AroundPlace`, and return it from `/schedule` and `/around`."],
    status: { state: "done", commit: "4e8720d" },
  },
  {
    id: "link-notices",
    title: "Notices link to the place or event they're about",
    effort: "M · Data",
    problem: "Only a promo can link to a place, and only a promo-kind one. No notice can link to an event, and adding a missing spot means leaving the form.",
    ui: [
      'Offer the place picker on every notice (raffle, game, safety, promo), listing all Around places, with "Add a spot" inline.',
      'Offer an optional event picker ("during the Street Dance").',
      "Show a place's current promos and notices on its Around card.",
      'For safety notices, add **Resolved** to the tile\'s live list, which posts a short "Found" or "All clear" follow-up linked to the original.',
    ],
    data: ["Allow `placeId` for every notice category, and add `items.eventId` or use `event_updates`."],
    status: { state: "done", commit: "f36fb63" },
  },
  {
    id: "wall-labels",
    title: "Clearer wall, and staying on it",
    effort: "S · UI",
    problem: '"stale 15m" reads as a status. The flag pill hides the age and can\'t be clicked in Update mode. Manage places and Manage tips leave the wall.',
    ui: [
      'Change the label to "Stale after 15m". Show the age and the flag pill side by side, and make the pill switch to Watch. Show "Nothing yet" instead of "none".',
      'Open Manage places and Manage tips in the slide-over, so edits like "booth moved" or "fix this tip" stay on the wall.',
    ],
    data: [],
    status: { state: "done", commit: "8a9ba8f" },
  },
  {
    id: "routing",
    title: "Steer each update to the right form",
    effort: "S · UI",
    problem:
      'Some entries land in the wrong place: a time change posted as an announcement leaves the schedule wrong, a "tonight only" tip stays in the guide for good, and reopening a road is hidden under "How busy? → Clear".',
    ui: [
      'One-line intros on Announcement vs Activity. When the text looks like a time change ("moved", "delayed"), suggest Schedule → Delay.',
      'Add tip hint: "Lasting advice. For tonight-only warnings, post an announcement." Add a section button in its empty state.',
      'Announcement hint: "A stall or booth people can visit? Add it as a place."',
      'Traffic: when a closed road is picked, show a "Reopen now" button next to it.',
    ],
    data: [],
    status: { state: "done", commit: "8a9ba8f" },
  },
  {
    id: "event-changes",
    title: "Event changes that match how timing slips",
    effort: "M · Data",
    problem:
      'Delay needs an exact time, "moved earlier" is still called Delayed, a venue change keeps the old area, a new event is never announced, and nobody can mark an event started or ended.',
    ui: [
      'Add a "Delayed, time to follow" option. Use "New time" wording, and only say Delayed when the time is later.',
      "Venue change: pick the new area too, so the feed pin follows.",
      'Add event: an "Also post to the feed" checkbox, and no parade default for Kind.',
    ],
    data: ["Add a `tba` status. Add a Started / Ended change that writes the unused `actualStart` and `actualEnd`, and have `phaseOf` prefer them."],
    status: { state: "done", commit: "e0f0974" },
  },
  {
    id: "winner-labels",
    title: "Winner labels, corrections and pending results",
    effort: "M · Data",
    problem:
      'Places are forced into ordinals, so special awards and raffle tickets come out as "4th". A correction adds a second card, and there\'s no way to post "results tomorrow".',
    ui: [
      "Let each row take a label (Champion, 1st runner-up, Best Costume, Ticket #1234), with ordinals as the default.",
      '"Results pending until …" option that posts a placeholder the real results replace.',
    ],
    data: [
      "Landed in 43409b5: rows take a label and a prize, a pending placeholder ends 6 hours after the expected time, and a later post (or a `contestId` continuation) hides the earlier card. Readers now see the labels, prizes, `was` and the pending time on the feed card, the hero banner and the schedule card. Store results as `[{label, name}]`. Posting to an event that already has results replaces the earlier item (hide the old one and link the new one to it).",
    ],
    status: { state: "done", commit: "baf3e9f" },
  },
  {
    id: "places",
    title: 'One "Add a place" button, with kinds the team can grow',
    effort: "M · Data + UI",
    problem:
      "Around has five hard-coded kinds (promo, ride, thrift, food, kiosk), stored as the `place_kind` enum. There's nowhere for first aid, police, restrooms or ATMs, no temporary closed state and no delete. Four Add buttons open the same form.",
    ui: [
      "Replace the four Add buttons with one **Add a place**.",
      'Turn the Kind field into the same search-or-add combobox the Area field uses, with aliases matched so "CR" finds Restroom and near-duplicates don\'t split the Around chips.',
      'On Around, group service kinds under "Services" (restrooms, first aid, police desk, ATM), separate from the fun spots.',
    ],
    data: [
      "Replace the enum with a `place_kinds` table modelled on `areas`: name, plural, icon, aliases, and a promo flag. Seed it with the current five plus Restroom, First aid, Police desk and ATM.",
      "Kinds added on the spot get a default pin icon. Staff can rename, pick an icon, or merge a duplicate into another kind.",
      "Replace the per-kind feeds (`place:kiosk` …) with one Places feed for every kind except promo, and update `config.test.ts`.",
      'Add a "Closed until …" status (`closedUntil`) shown on the card, separate from hidden, plus archive for places that are gone for good.',
      "Done (ce954eb, after the kinds table, combobox, Services grouping and single Places feed): `places.closed_until` and `places.archived_at`; `/api/around` sends `closedUntil` only while it is ahead; staff edit and merge kinds from the desk's Place kinds section (`PUT place-kinds/:key`, `POST place-kinds/:key/merge`). The promo flag stays as the hard-coded `PROMO_KIND` key rather than a column: one kind is ever promo, the Promos tile and promo announcements name it, and a column would let the team unflag it and break both. A kind can't be merged into or out of promo.",
    ],
    status: { state: "done", commit: "ce954eb" },
  },
  {
    id: "crowd-level",
    title: 'Team "Crowd level" update',
    effort: "L · Data + UI",
    problem: 'Nobody can report "Plaza packed". Report kinds have no crowd density, and stored reports are never reviewed or shown.',
    ui: [
      "A Crowd reports tile form shaped like Update traffic: areas × quiet / busy / packed, shown on Now and the map.",
      "Staff review list for public reports (corroborate / dismiss).",
    ],
    data: [
      "Add a crowd-level table or reading like `traffic_readings`. Then build the public report form so it writes the same thing.",
      "Done (05e233b): `crowd_readings` (area, level `quiet | busy | packed` checked in code, note up to 200, who entered it); the newest per area counts and fades after 90 minutes, as traffic does. `GET /api/crowd` feeds Now and the Traffic map. Visitors report through the Contribute page, so each report is a `submissions` row a team member approves under Visitor suggestions; one older than 45 minutes can be turned down but not approved, and the reading is stamped at approval. The old `crowd_reports` table and `POST /api/reports` are untouched and unused. Remaining gap: a visitor's report waits for approval rather than counting automatically, and the Crowd tile does not count reports waiting (the desk's Visitor suggestions badge does).",
    ],
    status: { state: "done", commit: "05e233b" },
  },
  {
    id: "recurrence",
    title: "Recurring and multi-day entries",
    effort: "L · Data",
    problem: 'Food fests, nightly parties and daily booth games need one entry per day, and a month-long event would show as "Happening now" all month.',
    ui: [],
    data: [
      'Add daily hours plus a date range on events and notices (for example "Oct 1–31, 5 PM–2 AM"), expanded into occurrences for the schedule and Now.',
      "Done (80eb3e7, 4ab7b22, b366358): an event is one row with `repeat_until` (a Manila date, at most 62 days after the first) and `skip_dates`; `plannedStart`/`plannedEnd` are the first day's hours, repeated daily. `src/lib/occurrences.ts` expands it, and `GET /api/schedule` sends a card per night (`<eventId>@<day>`, `seriesId`, `series`), so the phase, Timeline, today rail, For you and weather all work per night. Results and linked notices show on the night that is on now or next. The team sees one row; Cancel can call off one day or the rest of the run, a retime changes the daily hours from the next night, a move is refused, and started or ended mark one night without finishing the run. A notice takes `dailyFrom`/`dailyTo` (minutes after midnight, Manila) on a range across days, worded \"Daily 5:00 PM–2:00 AM until Sat 31 Oct\"; pins, the hero banner and the weather warning count only inside the hours, while the feed keeps it for the whole range and place and event notice lists keep listing it. Remaining gaps: daily only (no weekly or custom pattern), the same hours every night, no per-night delay, a notice's daily hours are set when it is posted (the Edit path does not change them); a road closure takes daily hours too (closure-hours). An edit that moves only the start is checked against the stored last day (5e1de1f), and a retime of a notice to a single day drops its daily hours (tested).",
    ],
    status: { state: "done", commit: "80eb3e7, 4ab7b22, b366358" },
  },
  {
    id: "partial-closure",
    title: "Partly closed roads",
    effort: "S–M · Data + UI",
    problem: "Update traffic offers Advisory or Closed. Half-road closures (Digicast for kiosk clearance, Lacson entry lanes Oct 12–14) go in as an Advisory, which makes them look smaller than they are.",
    ui: ["Add **Partly closed / one lane** between Advisory and Closed, with its own pin style and an optional note on which side or lane."],
    data: [
      "Add a `partial` traffic level (or closure extent) that counts between heavy and closed in the traffic score.",
      "Done (acb6f62) as a closure extent: `items.closure_extent` is `partial` on a `road_closure` that shuts one lane or one side, and the `traffic_level` enum is unchanged. `/api/traffic` overlays it as `partial`, ranked between heavy and closed (a full closure wins on the same road), but `traffic_readings` scoring stays clear/moderate/heavy, since a closure is a post and not a 30-minute reading. A new closure of either extent replaces the other, Clear reopens both, and a retime keeps the extent in the rebuilt headline.",
    ],
    status: { state: "done", commit: "acb6f62" },
  },
  {
    id: "seeds",
    title: "Venue kind, Plaza streets and Citywide, seeded",
    effort: "S · Data",
    problem:
      'Agents posting through the API reported that the Venue kind, the Plaza streets and a citywide area were missing, and posted with workarounds (hubs as Kiosk, area `null`). All of them could already be added, but the write endpoints weren\'t documented.',
    ui: ["The place note takes 500 characters, up from 200, as a text box."],
    data: [
      "Seed the Venue kind, the Rizal, Gonzaga, San Juan and Gatuslao streets, and Citywide (alias Bacolod).",
      "Document every `/api/team/*` write with its limits in `docs/ARCHITECTURE.md` §6.",
    ],
    status: { state: "done", commit: "7e9cee0" },
  },
  {
    id: "multi-venue",
    title: "Events at more than one venue",
    effort: "M · Data",
    problem: "Streetdance runs along a route and ends at an arena, but an event has one venue and one area, so the map can only pin one place.",
    ui: ["A collapsed \"More venues\" list on the event form: Route, Starts at, Ends at, Staging area or Also at, each with an optional area; shown under the main venue on the schedule card and marked on the Traffic map."],
    data: [
      "An `event_venues` table (event, venue, area, role, order); the event's own `venue`/`area` stay the main venue, so every existing read keeps working.",
      "Done (dea776a): `eventBody.venues` (max 6), `venues` on `/api/schedule` and the team list, search matches them, and `venueMarks` (`src/lib/venueMarks.ts`) places venues of events on now or within 3 hours with `areaPoint`. Remaining gaps: the main venue itself is not marked on the map (the schedule does not carry its area), places with no saved road shape are not drawn, and a venue change changes the main venue only.",
    ],
    status: { state: "done", commit: "dea776a" },
  },
  {
    id: "prize-ladder",
    title: "Prize ladders",
    effort: "S–M · Data",
    problem: "Games and contests list prizes per place (₱30k / ₱20k / ₱10k, plus consolation prizes) as plain text. Readers can read them, but prizes can't be lined up with who won.",
    ui: ["A prize on each winner row, shown next to the name."],
    data: ["An optional `prize` on the `[{label, name}]` result rows from `winner-labels`. Readers don't filter by prize, so it stays out of game notices."],
    status: { state: "done", commit: "43409b5" },
  },
  {
    id: "closure-hours",
    title: "Daily hours on a road closure",
    effort: "M · Data + UI",
    problem: "A closure that applies at night (the streets around the Plaza, 3 PM–3 AM, Oct 1–18) can only be posted as one closure for the whole range, which shows the roads closed all day, or as a fresh closure every night.",
    ui: ["Every day between [time] and [time] on the traffic form's Closed level, once the start and end fall on different days."],
    data: [
      "Let the Closed level take `dailyFrom`/`dailyTo` like a notice does (the `items` columns exist), and have `/api/traffic` and the road's pending status count a closure only inside its hours. Check how a replacing closure, Clear and the 12-hour lapse treat a closure that is outside its hours.",
      "Done (1c956be): the traffic update takes `dailyFrom`/`dailyTo` under the notice rule; the title comes from `closureTitle` (\"Closed daily 3:00 PM–3:00 AM: Lacson St until Sun 25 Oct\") so a retime regenerates it; `overlayClosures` counts it only inside its window; a replacing closure or Clear ends the whole run (the Reopened post says the daily closure ended); a busy-road report outside the hours leaves it alone; the 12-hour lapse is only for closures with no end, which a daily one never is.",
    ],
    status: { state: "done", commit: "1c956be" },
  },
];
