# Better Maskara: architecture plan

A mobile-first website that shows everything happening at the MassKara Festival in Bacolod, updated all day: official announcements, schedule changes and delays, winners, traffic advisories and crowd sentiment, weather, kiosks, raffles and other activities.

Written 2026-09-28. The festival runs through October, so the plan is ordered to ship something useful within days and grow from there.

## 1. Guiding decisions (from the site owner)

| Topic | Decision |
| --- | --- |
| Platform | Website, mobile-first (installable PWA later) |
| Frontend | Latest React + Vite, Tailwind v4, lucide-react icons, our own design system |
| Data | Postgres with Drizzle ORM |
| Cost | Must run on free tiers, scale to low-cost paid tiers |
| Source priority | Official MassKara pages first, then posts related to events |
| Traffic | FB advisories plus post sentiment (heavy traffic by area and time) |
| Weather | Free APIs |

## 2. System overview

```
             ┌──────────────────── scheduled (every 5–15 min) ─────────────────────┐
             │                                                                      │
  FB Pages ──┤                                                                      │
  Threads  ──┤  ingest/*  ──►  raw_posts  ──►  classify  ──►  items  ──►  feed API ──┼──► React app
  X        ──┤  (fetchers)     (verbatim,       (rules,        (normalized,           │   (Vite SPA,
  Weather  ──┤                  deduped)         optional LLM)  ranked)               │    CDN-hosted)
  Curators ──┘                                                                        │
  Crowd reports (in-app form) ───────────────────────────────►  crowd_reports ────────┘
```

* **Web app**: static Vite build on a CDN. Reads a small JSON API. No server rendering needed.
* **API**: one Hono app (`server/`). Hono runs unchanged on Cloudflare Workers, Vercel, Netlify, Deno or Node, so hosting stays a free choice.
* **Ingestion**: the same codebase. One ingest pass every 15 minutes (`INGEST_INTERVAL_MINUTES`): the Worker's Cron Trigger (`server/worker.ts`, `wrangler.toml`) in production, a timer in the Node API (`server/node.ts`) locally. Both skip a pass when `ingest_runs` shows one ran recently, so they never double up. Each fetcher is logged to `ingest_runs`; the classifier turns raw posts into feed items.
* **Database**: Postgres (Neon or Supabase free tier) through Drizzle.

## 3. Sources and how to get them legally

Meta, X and Threads all forbid scraping in their terms, and scraped pipelines break without notice during exactly the busy days that matter. The plan uses official APIs where they are affordable and a **curator inbox** everywhere else, so the app works on day one and gets more automated as API approvals come through.

Update from the site owner (2026-09-28): a team of people will monitor FB, X and Threads during the festival and submit what they find. Section 3.7 covers how that plugs in.

### 3.1 Source tiers (drives ranking and the "Official" badge)

| Tier | Examples | Default trust |
| --- | --- | --- |
| 1 Official | MassKara Festival Bacolod page, City Government of Bacolod, Bacolod City PIO | Shown immediately, "Official" badge |
| 2 Authority / media | BTAO / traffic office, BCPO (police), PAGASA, DRRMO, local news outlets | Shown immediately |
| 3 Community | Event organizers, sponsors, barangay pages, known community groups | Shown, "Community" label |
| 4 Crowd | In-app reports, public posts found by keyword | "Unverified" until corroborated |

The exact page list lives in the `sources` table so it can be edited without a deploy. Page IDs still need to be confirmed with the site owner.

### 3.2 Facebook (the main source)

**Decision (2026-09-29): no automated FB fetcher.** People enter the data: the team desk, team members forwarding posts (`POST /api/ingest/posts`) and the curator inbox. The Graph API fetcher was removed. The notes below are kept in case that changes.

* **Official route**: Graph API `/{page-id}/posts` for public Pages you do not manage needs the **Page Public Content Access** feature, which requires Meta App Review and business verification. Apply early; it can take weeks.
* **Pages you or partners manage**: if a festival organizer adds the app to their Page, we can read posts with a Page token and get **webhooks** for new posts in real time, with no PPCA needed. Worth asking the organizers.
* **Until approval (the day-one path)**: the curator inbox. A curator pastes a post URL and its text in the inbox (`/#/inbox`); the classifier fills in category, area and time; the curator confirms. A few minutes of human time per hour covers the official pages.
* No scraping of facebook.com or mbasic.

### 3.3 Threads

The Threads API has keyword search (`threads_keyword_search` permission, needs App Review) and a public profile lookup. Use it for keyword queries like `masskara`, `#MassKara2026`, `bacolod traffic`. Rate limits are modest, so poll every 15 minutes with a few queries.

### 3.4 X

X's free API tier is effectively write-only for reads at our volume, and paid read access starts in the hundreds of USD a month (check current pricing before committing). Treat X as **curator-only** for now.

### 3.5 Weather (free)

* **Open-Meteo** for current conditions, hourly forecast and precipitation probability. Free, no API key, 10,000 calls/day. Its free tier is for non-commercial use; if the app ever runs ads or sponsorships, switch to its paid plan or OpenWeatherMap's free tier (1,000 calls/day, key required).
* **PAGASA** for typhoon and rainfall advisories. There is no stable public API, so these come through the curator inbox or PAGASA's official FB page once Graph access exists.
* Bacolod coordinates: `10.6765, 122.9509`. Poll every 15–30 minutes and cache in `weather_snapshots`.

### 3.6 Crowd reports (in-app)

A short form: type (traffic, crowd, delay, lost & found, safety), area, optional photo later. Anonymous, protected with Cloudflare Turnstile (free) and per-IP rate limits. A report shows as **Unverified** until two independent reports agree within 30 minutes, or an official post matches.

### 3.7 Monitoring team (collectors)

The monitoring team watches official pages, keyword searches and traffic groups with their own normal accounts, and submits relevant posts. Each person is a **collector** with their own token, so submissions are attributed and one person's access can be revoked alone. The same endpoint also accepts posts from any future automated fetcher.

Collectors send posts to `POST /api/ingest/posts` (batch of up to 50):

```json
{ "posts": [ {
  "platform": "facebook | threads | x | web",
  "url": "https://facebook.com/.../posts/...",
  "author": "MassKaraFestivalBacolod",
  "text": "full post text",
  "postedAt": "2026-10-04T09:30:00+08:00"
} ] }
```

* Tokens come from `npm run collector:add -- "Name"` and are stored hashed. `raw_posts.collector_id` records who sent what.
* The post URL is the dedupe key, so two people submitting the same post create one entry.
* `author` is matched against the `sources` table, so a post from an official page keeps its "Official" badge whoever submitted it. Unknown authors count as crowd tier.
* Then the normal pipeline runs: classify, publish or queue for review.

**One token per person.** Team members (collectors) and staff each have their own token, and the same token signs in everywhere: the team desk, mission control and (for staff) the curator inbox. The device keeps it once, whichever page is opened first. `ADMIN_TOKEN` signs in as "Admin"; it can read but not post on the desk, since its entries would name nobody.

**Team desk**: team members open `/#/team` on their phone and paste their token once. Staff can post there too, with the same token. Instead of copying posts, they enter the update itself by type: traffic on one or more roads in one form, as a level, a closure or an advisory (Clear, Moderate, Heavy or Closed, which can be the whole road or partly closed with an optional lanes note; a closure can be scheduled with an optional start and end, and any other level set on the road later replaces it, with Clear also cancelling one still scheduled; an advisory is a heads-up for the feed), event changes (new time, new venue, cancelled), winners, and announcements. They also keep the schedule and the Around places up to date. Headlines are written from the fields (for example "Closed: Lacson St until 2:00 AM" or "Partly closed: Lacson St until 9:00 PM"), each entry can carry a link to the post it came from, and it publishes straight away under "Better Maskara team", recording who entered it (`items.collector_id` or `items.staff_id`; events and places record who added and last changed them). Mission control's Update mode opens the same forms from the wall. Recent entries can be hidden from the same screen. Times are entered in Bacolod time whatever the phone's time zone. `POST /api/ingest/posts` stays for automated fetchers, whose unsure posts go to the curator inbox at `/#/inbox`.

**Contribute page**: `/#/report`, in the menu as Contribute, lets any visitor send what the team desk can enter: traffic, how crowded a place is, event changes, winners, announcements, schedule entries, Around places and visitor tips. It shows the desk's own forms, handed a community token in place of a sign-in (`COMMUNITY_TOKEN`, `src/lib/team.ts`), so a fix to a desk form reaches both. With that token a form reads the public lists and everything it saves becomes a row in `submissions` instead of a desk write. Nothing on the site changes until a team member approves it under "Visitor suggestions" on the team desk; approving sends the stored write to the desk under the approver's own sign-in (`server/community.ts`), so the desk's checks, roles and bylines apply as if they had typed it, and the result reads "Verified by staff". A crowd level is stale within the hour, so the review list shows how long ago it was sent and approving one older than 45 minutes is refused (it can still be turned down); the reading is stamped when it is approved. Visitors can't add areas, kinds or topics, change the guide's structure, hide anything, or ask for a pin or banner. The sender is stored only as a hashed address, for rate limits and for spotting a flood from one device.

**Rules for the team**

* Send the exact post text and link, not a summary, so the app can always show and verify the original.
* Public posts by private individuals (traffic complaints, crime reports) are personal data under the Philippine Data Privacy Act. Only Pages and public officials are named in the app; raw crowd posts are deleted after the festival.

## 4. Classification

Every raw post becomes zero or more feed **items** with:

* `category`: `announcement`, `schedule_change`, `delay`, `cancellation`, `winner`, `traffic_advisory`, `road_closure`, `road_reopening`, `traffic_sentiment`, `weather`, `crime_safety`, `kiosk`, `raffle`, `activity`, `other`
* `area` (from a Bacolod gazetteer), `starts_at` / `ends_at` if stated, `severity`, `confidence`

**Stage 1: rules (free, runs everywhere).** Keyword and regex lists in English, Tagalog and Hiligaynon, plus an area gazetteer (Lacson St, Araneta St, Burgos Ave, Libertad, Public Plaza, Capitol Lagoon, Panaad Park, Bacolod Government Center, Mandalagan, Banago, etc.). Starter lists are in `server/ingest/classify.ts` and need tuning with local speakers.

**Stage 2: LLM (optional, low cost).** For posts the rules mark as low confidence, a small model call extracts the same structured fields as JSON. A cheap model at a few thousand posts a month costs a few dollars. Off by default; turned on with an env var.

### Traffic sentiment

Posts classified as `traffic_sentiment` feed a score per **area × 30-minute bucket**:

* `heavy` = +2, `slow` = +1, `moving` / `clear` = −1, official `road_closure` = +3
* Scores decay over 90 minutes, so old complaints fade
* The app shows each area as Clear / Moderate / Heavy / Partly closed / Closed, with the posts behind it one tap away. Partly closed is not a reading and does not enter the score: it comes from a `road_closure` item with `closure_extent = 'partial'` (one lane or one side shut), drawn in the closed red with longer dashes

Official closures and reroutes always outrank sentiment. A full closure outranks a partial one on the same road.

## 5. Data model (Drizzle, `server/db/schema.ts`)

| Table | Purpose |
| --- | --- |
| `sources` | Pages/accounts we follow: platform, external id, name, tier, active |
| `collectors` | Team members and fetchers that submit posts; hashed token, last seen |
| `raw_posts` | Verbatim fetched posts; unique on (platform, external_id); keeps the source link |
| `items` | Normalized feed entries with category, area, time window, severity, confidence, status (published / hidden / needs_review). A desk notice can link to an Around place (`place_id`) and a schedule event (`event_id`, set null if the event is deleted); `parent_item_id` points at the post a follow-up follows (set null if that post is deleted). A retime keeps what readers first saw in `original_starts_at` and `original_ends_at` (set by the first change only) and the latest change in words in `time_change` (set means the times were changed). `daily_from` and `daily_to` (minutes after midnight in Manila, both or neither, a check keeps them in 0–1439 and apart) give a range daily hours: set only when `ends_at` falls on a later day than `starts_at`, and past midnight when `daily_to` is not after `daily_from`. A retime to a single day clears them. `closure_extent` is `partial` on a `road_closure` that shuts one lane or one side (null is the whole road; a check keeps it to closures) |
| `areas` | Gazetteer: name, aliases, lat/lng |
| `events` | Planned schedule: title, venue, area, planned and actual start/end, status (scheduled / delayed / ongoing / done / cancelled). `repeat_until` (a Manila date, null for a single event) makes it repeat daily: `planned_start` and `planned_end` are the first day's hours and every day through `repeat_until` has the same hours (an end past midnight stays past midnight; all-day and time-to-follow events repeat as date-only days); at most 62 days after the first. `skip_dates` (dates, default empty) are days called off. `actual_start` and `actual_end` on a repeating event belong to the one night they were made on (the nearest to them), and the run's status is not set to done by a night ending or by winners being posted. `src/lib/occurrences.ts` expands a row into its nights |
| `event_venues` | The venues an event has besides its main `venue`/`area`: `event_id` (cascade), `venue` (up to 120), `area_id` (null when the place has no area), `role` (`route`, `start`, `finish`, `staging` or `other`, checked in code) and `order`. Every existing read keeps using the main venue |
| `event_updates` | Delays, cancellations, results/winners linked to an event and the item that reported it |
| `result_versions` | Each posting of a contest's results. Versions of one contest share `contest_id` (the first version's id). `stage` is text (`pending`, `standings`, `final`, `corrected`, `revised`), checked in code. Posting again for the same event (or `contest_id`, for a contest not on the schedule) hides the previous feed item. Rows carry `label`, `name`, optional `prize`, and `was` (the name a correction replaced) |
| `place_kinds` | Kinds of Around place: key, name, plural, icon, aliases ("CR" for Restroom), and whether it is a service (restroom, first aid, police desk, ATM). Seeded (including Venue for festival hubs), and the team adds more from the place form. Staff rename them, change icon, plural, aliases and the service flag, and merge duplicates (the Place kinds section of the desk). The promo kind is the hard-coded `PROMO_KIND` key, not a column |
| `places` | Around places (promos, rides, food, services…): name, kind (a `place_kinds` key), area, lat/lng, open hours, source item, map pin (lat/lng); `closed_until` (temporarily closed until then; Around keeps the card, marked closed, and the Now teaser skips it); `archived_at` (gone for good, unlike `active` which only hides it: never on Around, in pickers, search, topic counts or the Places feed, but notices already linked to it keep the link); `updated_at` for mission control |
| `tip_sections`, `tips` | The visitor guide: sections of ordered tips, edited on the team desk; a section can feed the Now page |
| `traffic_readings` | Per area and time bucket: score, level (`clear`, `moderate`, `heavy`, `closed`), contributing item count |
| `crowd_readings` | How crowded an area is: area, `level` (`quiet`, `busy`, `packed`, checked in code), optional note (200), who entered it (collector or staff). The newest row per area counts and fades after 90 minutes (`READING_FADE_MS`, `src/lib/crowd.ts`). Written by the team desk, or by approving a visitor suggestion |
| `weather_snapshots` | Cached weather JSON per fetch |
| `crowd_reports` | Older in-app submissions, hashed IP, status. Nothing calls `POST /api/reports` now; crowd levels use `crowd_readings` |
| `submissions` | Visitor suggestions from the Contribute page: the desk write, hashed IP, status, who reviewed it |

Items keep a pointer to their raw post, so every card links back to where it came from.

## 6. API (Hono, `server/`)

| Route | Returns |
| --- | --- |
| `GET /api/feed?category=&area=&since=` | Latest items, official first within each time window. An item carries `event` (`id`, `title`) when linked to a schedule entry, `followsUp` (`id`, `title`) when it has a parent, and `resolved: true` when a published safety follow-up resolves it, and, once a retime changed its times, `formerStartsAt`, `formerEndsAt` (only those that differ from the current ones; an end that was added has no former end) and `timeChange` ("Extended until 9:00 PM"), all read with the list, no per-item queries. A winners item carries `results` (`contest`, `stage`, `rows` with `was`/`prize`, `note`, `expectedAt` when pending), read from its `result_versions` row in one extra query; `body` keeps the same text |
| `GET /api/now` | What is happening now: ongoing events, active closures, current weather |
| `GET /api/events?date=` | Schedule with live status |
| `GET /api/traffic` | Current level per area. Active (and past-start) `road_closure` items overlay the readings: `closed`, or `partial` when every closure on the road is partial. A closure with daily hours (`daily_from`/`daily_to`) counts only inside them; outside, the road reads as it otherwise would (`src/lib/trafficOverlay.ts`). The feed carries `closureExtent: "partial"` on the partial ones so scheduled closures draw too |
| `GET /api/crowd` | Live crowd levels: `[{area, level, note?, lat?, lng?, updatedAt}]`, the newest reading per area from the last 90 minutes, with the area's coordinates when it has them. Cached like `/api/traffic` |
| `GET /api/weather` | Latest snapshot |
| `GET /api/areas` | Area names, for pickers |
| `POST /api/reports` | Crowd report. Checks a Turnstile token when `TURNSTILE_SECRET` is set; at most 5 per device per 10 minutes |
| `POST /api/ingest/posts` | Monitoring team (collectors) push posts, per-person token |
| `POST /api/community/submissions` | A visitor's suggestion from the Contribute page: one team desk write (`method`, `path`, `body`) held for review. Same Turnstile check as reports; at most 6 per device per 10 minutes and 40 a day |
| `GET /api/community/read/…` | The public parts of the lists the desk's forms pick from (events, places, place kinds, topics, guide) |
| `GET /api/community/review`, `POST …/:id/approve`, `POST …/:id/reject` | The review queue, for signed-in team members and staff |
| `GET /api/schedule` | Schedule from the team desk, with live status (`done` is its own status). A single event is one entry with its plain `id`. A repeating event is one entry per night, from the 36-hour look-back through the next 7 days (its first night too, when the run starts later), with `id` `<eventId>@<YYYY-MM-DD>` (unique, so safe as a React key and an `event-<id>` anchor), `seriesId` (the event's id) and `series: {from, until}` (Manila dates); a cancelled run keeps only the night that is on or next. Topics, results and notices belong to the event, and show only on the night that is on now or next. Anything linking by event id (search, `During:` links) resolves a series id to that night. An event with posted results carries `results` (latest non-pending version) and `resultsExpectedAt` (when the latest version is a placeholder); `notices` lists up to 2 current notices linked to the event (`id`, `title`, `category`, `startsAt`, `endsAt`; not the event's own change or winners posts); an older event is listed too while its latest version is under 36 hours old |
| `GET /api/around` | Live Around places from the team desk (hidden and archived ones left out). A place carries `closedUntil` only while that time is still ahead. Each carries `notices`: up to 3 published, unhidden, unended items linked to it, newest first (`id`, `title`, `category`, `startsAt`, `endsAt`); an item with no end counts for 24 hours after posting |
| `GET /api/visit` | Visitor guide sections with their tips, from the team desk |
| `GET /api/tips` | Tips from the sections shown on the Now page |
| `/api/team/*` | Team desk, with a team member's or staff member's own token: `GET me`, `POST updates` (road, traffic, event, winners, notice), `POST lanes/:lane/checked` (swept, nothing new), `GET recent` (rows carry `startsAt` and `retimable`), `GET results` (the latest version of each contest posted in the last 7 days, which the winners form pre-fills from; visitors read the same at `/api/community/read/results`), `PATCH items/:id` (hide, show, end, or edit headline and details on your own entry), `POST items/:id/resolve` (a safety post: publishes a follow-up and ends it), `POST items/:id/retime` (change the times of an advisory, closure or notice), `GET/POST/PUT/DELETE events`, `GET/POST/PUT places` (`GET ?archived=1` includes archived ones; `PUT` takes `closedUntil` and `archived`), `POST areas` (add an area, or find it by name or alias in any case), `GET/POST place-kinds` (add a kind, or find it by name or alias; `GET` adds each kind's live place count), staff only `PUT place-kinds/:key` (name, plural, icon, aliases, services; a name or alias another kind already has is a 409 naming that kind) and `POST place-kinds/:key/merge {into}` (moves its places, keeps its names as aliases of `into`, deletes the kind; promo, itself or an unknown target are refused), `GET/POST/PUT topics`, `PUT items/:id/topics`, `GET guide`, `POST/PUT/DELETE guide/sections`, `POST/PUT/DELETE guide/tips`, `POST guide/move` |
| `POST /api/control/posts` | Curator pastes a post by hand (staff token; recorded as theirs) |
| `GET /api/control/inbox?status=` | Curator queue: `needs_review` (default), `published` or `hidden` items with the original post and who sent it |
| `POST /api/control/items/:id/actions` | Publish (verify), hide, unhide, send back to review, recategorize or edit an item; logged in `item_actions` |
| `/api/control/*` | Mission control, see `docs/MISSION_CONTROL.md` §6. Team members can watch it; moderation routes are staff only |

### Posting through the API (agents and scripts)

Everything the team desk does goes through `/api/team/*` with `Authorization: Bearer <token>`. Anything the desk can add on the spot, the API can too.

**Rule for agents and anyone sourcing posts:** read this table before you post, and again before you report a gap. If an area, place kind or topic is missing, add it with the call below; don't fall back to a workaround (`area: null`, a near-enough kind, details squeezed into a note). Report a gap only when no call here can carry what the post says, and name the call you tried and the limit or field it lacked.

| Need | Call | Limits and notes |
| --- | --- | --- |
| An area that isn't listed (a street, a hub) | `POST /api/team/areas {name}` | Name 2–80. Returns the existing area if the name or an alias matches, in any case. `Citywide` (alias `Bacolod`) is for notices about the whole city. |
| A place kind that isn't listed | `POST /api/team/place-kinds {name}` | Matches existing names and aliases first. Seeded: promo, ride, thrift, food, kiosk, venue, restroom, first_aid, police, atm. |
| A notice (announcement, safety, raffle, sponsor game, promo, community event…) | `POST /api/team/updates {type:"notice", category, title, body, area?, placeId?, eventId?, startsAt?, endsAt?, dailyFrom?, dailyTo?, url?, topics?}` | Title up to 140 (`TITLE_MAX`), body up to 1000. `area` is a name, and `endsAt` must come after `startsAt`. `dailyFrom` and `dailyTo` (minutes after midnight, Manila, both or neither, 0–1439, not equal) give the range daily hours, and need a `startsAt` and an `endsAt` on a later day; the item stays in the feed for the whole range, but pins, the hero banner and the weather warning count only inside the hours. Notices linked to a place or event keep listing for the whole range. `placeId` is any active Around place and `eventId` any schedule entry, cancelled or not; with no area given the notice takes the place's area, else the event's. |
| A traffic level, closure or advisory | `POST /api/team/updates {type:"traffic" \| "advisory", areas[], level?, extent?, lanes?, dailyFrom?, dailyTo?, startsAt?, endsAt?, note?, url?}` | 1–10 areas by name. Note up to 500. With `level: "closed"`, `extent` is `"full"` (default) or `"partial"` (headline "Partly closed: Lacson St until 9:00 PM", stored as `items.closure_extent`), and `lanes` (up to 120, partial only: "northbound lanes", "one lane open") leads the body. A new closure of either extent replaces an earlier one on the road, and any other level (Clear) reopens either; a time change keeps the extent in the rebuilt headline and the follow-up. A closure takes `dailyFrom`/`dailyTo` (minutes after midnight, Manila; both or neither, needs a start and an end on a later day) and reads "Closed daily 3:00 PM–3:00 AM: Lacson St until Sun 25 Oct"; a replacing closure or Clear ends the whole run (the Reopened post says "daily closure ended"), a heavy or moderate report leaves a daily closure alone outside its hours, and a retime to a single day drops the hours. A closure with an end never hits the 12-hour lapse, which is only for closures with no end. |
| A crowd level (quiet, busy, packed) for one to ten areas | `POST /api/team/updates {type:"crowd", areas, level, note? (200)}`. A reading in `crowd_readings`, not a feed post; no `tier` |
| An event change | `POST /api/team/updates {type:"event", eventId, change, …}` | `change` is retime (the desk sends this: `newStart` and/or `newEnd`; another start day reads as a move, the same day as a delay or earlier start, an end alone as extended or "now ends at"; no difference is an error), tba, cancel, venue, on_time (back to the first start), started or ended (an end well before the planned end reads "Ended early, at 7:00 PM"). The older delay, extend, early and move are still accepted. On a repeating event: `cancel` with `day` (`YYYY-MM-DD`, a night still to come, not the last one left) calls off that day only (added to `skip_dates`, announced "No <event> on Sat 18 Oct"), without `day` it cancels the rest of the run; a retime changes the daily hours from the next night ("From tonight: 6:00 PM") and a move or a retime to a day outside the run is refused (change the range in the schedule editor); delay acts as a retime; tba, extend and early are refused; started and ended mark one night (`actual_start` / `actual_end`) and leave the status alone. Note up to 500. Giving an all-day or time-to-follow event a start time makes it a timed event (its old day stays struck through, and Back restores all day or time to follow); `keepDateOnly: true` on a retime moves only its day and leaves it date-only. |
| Winners | `POST /api/team/updates {type:"winners", contest, places[], eventId?, contestId?, stage?, note?, pendingUntil?, tier?, endsAt?}` | 0–10 places, each a string or `{label?, name, prize?}` (prize up to 60). A blank label stays 1st, 2nd, 3rd. `stage` is standings, final, corrected or revised; left out it is final after nothing or a pending/standings version, and corrected after a final/corrected/revised one. `pendingUntil` with no places posts "Results pending" (ending 6 hours after the expected time) and does not mark the event done; standings do not either. The previous version is the latest for `eventId`, else for `contestId` (a contest not on the schedule; unknown is 400). A correction or revision sets `was` on a place whose name changed, opens its body with "Changed: 2nd, 3rd", and is refused when nothing differs. The earlier card is hidden. `tier`/`endsAt` announce it like other posts. |
| A schedule entry | `POST /api/team/events` (`PUT …/:id` to edit) | Title 140, venue 120, description 1000, short note 200 (delays and venue changes replace it), `repeatUntil` (`YYYY-MM-DD`, Manila; after the first day, at most 62 days on; null makes a single event, left out keeps it) to repeat the hours daily, and `skipDates` (left out keeps them; send a shorter list to bring a day back; cleared when `repeatUntil` is null), and `official: false` for community events, which then needs `organiser` (a bar, a school) or `presentedBy` (a sponsor, which official events may carry too; both up to 120). `allDay: true` or `timeKnown: false` (not both) make it a date-only event: only the date of `startsAt` counts, stored as 00:00 in Manila with no end, and readers see "All day" or "Time to follow". `announce: true` also posts a feed card (a `third_party_event` when not official, with the credit in its body); the desk always sets it for a new event, the API defaults it off. `kind` is parade, competition, concert, nightlife, bazaar, sports, food, workshop or ceremony. `venues` is up to 6 extra `{venue (1–120), area?, role}` (role: `route`, `start`, `finish`, `staging`, `other`; left out keeps them, a list, even empty, replaces them); `/api/schedule` and `GET /api/team/events` return them as `venues`. A venue change moves the main venue only. A `PUT` that sends no `repeatUntil` is checked against the stored one (after the new first day, at most 62 days on) and answers 400 saying what to fix. |
| An Around place | `POST /api/team/places` (`PUT …/:id` to edit) | Title 120, place 160, hours 80, note 500, and at least one topic. `closedUntil` (ISO time, null reopens) marks it closed for now; `archived: true` removes it for good and `false` restores it. Anyone who may edit a place may archive it. |
| Resolve a safety post | `POST /api/team/items/:id/resolve {outcome:"found"\|"all_clear"\|"other", text?, url?}` | Only the Safety tile's categories. Publishes a follow-up of the same category, area, place and event with `parent_item_id` ("Found: …", "All clear: …", or `text`, required for `other`, up to 140), ends the original now through the item actions, and drops any pin or banner it held. Team members only on their own entries; a second call is a 409. |
| Change the times of a post | `POST /api/team/items/:id/retime {startsAt?, endsAt? (null clears), announce? (default true), tier?, pinUntil?, note? (200)}` | Published, not-ended desk posts in advisories, closures and the notice categories; not winners or event changes (those are changed through their event). Team members only on their own entries. `planRetime` (`src/lib/retime.ts`, shared with the desk's live line) words the change ("Extended until 9:00 PM", "Now ends at 5:00 PM", "Starts later, at 7:00 PM", "Starts earlier, 4:00 PM", "Moved to Sat 18 Oct", "Until 9:00 PM") and suggests Pinned for a day change or a shift of an hour or more. An advisory's or closure's headline is rebuilt by the builders the post used, so `/api/traffic`'s closure overlay follows the new times; a notice's headline stays. Logged as a `retime` item action with the before and after times. With `announce`, a follow-up of the same category, area, place and event points back at it (`parent_item_id`), titled from the change ("Extended until 9:00 PM: Traffic advisory, Lacson St"), ending with the post (a day when it has no end) or at `pinUntil`; the banner is staff only. |
| Take a post down or put it back | `PATCH /api/team/items/:id {hidden}` | Team members can do this only on their own desk entries. |
| A lane was checked and nothing changed | `POST /api/team/lanes/:lane/checked {checkedAt?, note?, sources?}` | Resets that lane's stale clock. The board shows "Checked, nothing new" (note and sources on the same line). No feed item. `checkedAt` defaults to now and cannot be in the future. An unknown lane is 400 with `lanes` listing the ids. |
| Fix a live post's headline or details | `PATCH /api/team/items/:id {title, body, area}` or `POST /api/control/items/:id/actions {actions:[{action:"edit", title?, body?, area?}]}` | Team members edit their own desk entries through the desk route; staff may edit any item through the item actions route (and may recategorize there). The feed shows when a card was corrected. |

Public GET responses carry `Cache-Control: public, max-age=30, stale-while-revalidate=120` (team and staff routes under `/api/team` and `/api/control` are `no-store`), so the CDN absorbs festival-night spikes and the database sees a few requests a minute.

## 7. Hosting (free tier first)

**Recommended default: Cloudflare + Neon**

| Piece | Service | Free tier |
| --- | --- | --- |
| Web app | Cloudflare Pages | Unlimited bandwidth |
| API + cron | Cloudflare Workers + Cron Triggers | 100k requests/day |
| Database | Neon Postgres | 0.5 GB storage, scales to zero |
| Bot protection | Cloudflare Turnstile | Free |

Workers connect to Neon via `postgres` (with `nodejs_compat`) or Neon's serverless driver; Drizzle supports both. Paid step-up is Workers Paid ($5/mo) and Neon Launch when needed.

Alternatives that fit the same code: Vercel (Hobby is non-commercial only) + Supabase (free projects pause after a week idle), or a single $5 VPS running Node + Postgres.

## 8. Frontend

* Vite SPA, React 19, React Router later if pages grow beyond tabs.
* Tailwind v4 with design tokens in `src/index.css` (`@theme`): festival palette, type scale, radii. Components in `src/ui/` (Button, Card, Badge, Chip, SectionHeader) use only tokens, so the look changes in one place.
* Icons: `lucide-react`.
* Mobile layout: sticky top bar with weather chip, category chips, a single feed, bottom nav (Now, Schedule, Traffic, Map, Report).
* Polling every 60 seconds while visible; web push later.
* PWA (offline shell, add to home screen) with `vite-plugin-pwa` in a later step.

### Map

The traffic map uses MapLibre GL JS (open source) with OpenFreeMap vector tiles (OpenStreetMap data, free, no API key, no request limits; attribution shown on the map). The roads the feed reports on are saved from OpenStreetMap in `src/data/bacolod-roads.json`, keyed by the same area names as `TrafficArea.area`, so each road is coloured by its level. To add a road, fetch its OSM ways (Overpass) and add a feature with its area name. MapLibre loads only on the Traffic page. Areas have no coordinates yet, so crowd rings and event venues are placed with `areaPoint` (`src/lib/areaPoint.ts`): the area's own lat/lng when it has them, else the midpoint along the longest saved line of that name. An area with neither is list-only. Venues of events on now or starting within 3 hours (`src/lib/venueMarks.ts`) get a hollow dot with the event on tap.

## 9. Roadmap

1. **This week (festival is starting)**: collector endpoint and `/submit` screen for the monitoring team, curator inbox, feed, schedule, weather, traffic advisories. Deploy to Cloudflare + Neon.
2. **Next**: crowd reports with verification, traffic sentiment map, kiosks map.
3. **When approvals land**: automated FB (PPCA or managed-Page webhooks) and Threads keyword ingestion, optional LLM classification.
4. **Later**: PWA + push alerts for closures and delays, winners archive, Filipino / Hiligaynon UI.

## 10. Open questions for the site owner

1. Which exact official pages should be tier 1 (page names or URLs)?
2. ~~Who curates?~~ Answered: a monitoring team of people (section 3.7).
3. Any plan to monetize (ads, sponsors)? That decides Open-Meteo free vs paid and Vercel Hobby eligibility.
4. ~~Which GitHub repo?~~ `KeentGG/super-masskara`.
