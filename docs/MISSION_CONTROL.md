# Mission control: internal data board

An internal page that shows every data group on the site at a glance: what's fresh, what's stale, what's broken, and what might be misinformation. It also shows the raw intake (posts sent in by the team and pasted by curators) next to what each post became.

Written 2026-09-29 from a design session with the site owner. The mocks from that session were throwaway; this doc is the source of truth.

Updated 2026-09-29 as each slice shipped, again after slice 6 reconciled this doc with the code, and for slice 7 (Watch / Update, the intake table and graph).

## 0. Where the data comes from

People enter the data, not social media APIs. There is no FB or X fetcher in use.

| Path | Who | Where it lands |
| --- | --- | --- |
| Team desk (`#/team`, `/api/team/*`), or Update mode on the wall | Monitoring team and staff, each with their own token | Published `items`, `events`, `places`, `traffic_readings`, `crowd_readings` directly, under the team's name and recording who entered them. No raw post. |
| Collector push (`POST /api/ingest/posts`) | Team members forwarding posts they saw | `raw_posts`, then the classifier turns them into items |
| Curator inbox (`#/inbox`, `POST /api/control/posts`) | The site owner and curators pasting a post by hand, with their staff token | `raw_posts` (with who pasted it), then the classifier |
| Crowd levels from the Contribute page (`POST /api/community/submissions`, approved under Visitor suggestions) | The public, via a team member | `crowd_readings`, as a team entry. The older `POST /api/reports` and `crowd_reports` are unused |
| Open-Meteo | The only automated API fetcher | `weather_snapshots` |

So **gray (stale) is the main signal on most tiles**: it means nobody has entered anything for that group lately. **Red** only comes from the automated parts: Open-Meteo and the classifier pass. The FB Graph API fetcher was removed on 2026-09-29; posts seen on Facebook come in through the team and curators with `platform: "facebook"`.

## 1. Decisions

| Topic | Decision |
| --- | --- |
| Who uses it | The site owner and a few trusted staff, and the monitoring team (team members). One page for both; each person signs in with their own token. Web, desktop first. Not linked from the public nav. |
| Roles | **Staff** (and `ADMIN_TOKEN`, as "Admin") see everything and moderate: flags, the group slide-over, verify and hide. **Team members** get a read-only Watch with no flags and no moderation, and can hide and unhide only their own desk entries. |
| Purpose | Two modes. **Watch**: spot a stale group (nobody entering data), a dead fetcher or suspected misinformation, then act. **Update**: see which groups need data and post it from the wall. |
| Where actions live | In a slide-over panel that opens from the right when you click a tile. Simple actions happen there; heavy ones (editing the schedule) link out to a full editor. |
| Health states | **Red**: broken (missed heartbeat, fetch errors). **Gray**: stale, nothing new within that group's own window. **Green**: healthy. A fetcher silent for over a day is **idle**, not red (see §4.1). |
| Misinformation | **Amber**, shown as a separate flag count. It never replaces the health color, so a tile can be red and amber, or gray and amber. |
| Stale windows | Set per group and editable from the page (traffic 60m, weather 30m, places 1d, tips 3d…). |
| Used vs ignored | Every group shows its last-24h raw posts as **used / pending / dropped** (§4.4). Dropped posts are counted, not listed by default. Team desk entries skip raw posts, so they are not part of intake. |
| Public badges | **Official** (official page) > **Verified by staff** > **Crowd-sourced**. Items auto-publish with the badge they have earned. |
| Verifiers | The site owner plus trusted staff, each with their own named token. All staff have the same powers, and every action and every entry is attributed. |
| New public groups | Sponsor games and promos, entered by the team or pasted from social posts. Third-party events have no group of their own: if people show up at a set time it is an event, and the **Add event** form on the Schedule tile asks who is putting it on (the festival, a sponsor, or someone else). Non-official events are welcome if people would want to go. |

## 2. Page layout

Route: `#/control`. `#/control/<group>` opens that group's slide-over and `#/control/<update>` opens an update form (update keys never equal group keys), so both can be deep-linked and Back closes them. Everyone signs in once with their own token; the device keeps one token for every team page.

**Input audit** (`#/audit`, linked from the wall's header): every tile tested against the scenarios volunteers need to post, what happens today, and the recommended fixes in priority order. It is the canonical list for fixing the UX of data entry. The content lives in `src/data/inputAudit.ts`; update it there as fixes land (`inputAudit.test.ts` checks every partial or failing scenario still points at a fix). `#/audit/<id>` scrolls to a tile, a scenario (`s-weather-1`) or a fix (`fix-until`).

A **Watch / Update** switch sits next to the title. Team members start in Update, staff in Watch, and the choice is kept on the device per role (`sm.control.mode.<role>`). Admin and the sample-data preview only watch, since the desk refuses posts that name nobody.

```
┌ Mission control ───────────────────── ● 1 broken  ● 2 stale  [4 flags]  14:49:07 ┐
│┌────────────────┬────────────────┬────────────────┬────────────────┐            │
││● Weather   47m ││● Schedule  18m ││● Traffic   [2] ││● Closures   4m │            │
││14:02 timeout   ││14:31 moved 4PM ││14:45 Lacson…   ││14:45 Lacson…   │  camera    │
││13:32 timeout   ││12:10 on time   ││14:40 conflict  ││11:00 reopened  │  wall,     │
││stale 30m  ▬▬▬  ││stale 2h   ▬▬   ││stale 15m  ▬    ││stale 30m  ▬▬   │  ~50% of   │
│├────────────────┼────────────────┼────────────────┼────────────────┤  viewport  │
││ …              │ …              │ …              │ …              │            │
│└────────────────┴────────────────┴────────────────┴────────────────┘            │
│ Intake stream   24h · 42 in · 27% used            │ Sources                       │
│ Curator · Site owner  [Official]                         │ ● Open-Meteo   47m · 3 errors │
│ "Lacson St closed…"  → Road closure · Published   │ ● Classifier         4m       │
│ Team · Maria  [Crowd-sourced]                     │ ● Maria (team)      11m       │
│ "lacson open na ya"  → Conflict · Flagged         │ ○ Juan               6h       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The wall

* One bordered grid with shared hairlines, not separate cards, like a CCTV wall. It fills the top half of the viewport. Column count comes from the container width (about 4 columns on a laptop), and rows stretch to fill the height.
* **Tile anatomy**:
  * **Header strip:** status dot (pulses gently when green), group name, and either the time since the last update or the amber flag count.
  * **Body:** the last ~5 activity lines (time + one-line summary), mixing published updates with errors and flags.
  * **Footer:** the stale window and a thin used/ignored bar.
* **Red** tiles get a danger inset frame and header. **Gray** tiles mute their text. Amber appears only as the flag pill.
* In Watch, clicking a tile opens the slide-over (staff only; team members' tiles don't open).
* In **Update**, the tile body swaps its activity list for one to five buttons for that group's kinds of update ("Update traffic", "Post safety notice"…), see §3. The tile name turns into plain text so the buttons can be clicked. A form button opens the matching team desk form in a slide-over with its option already picked; posting closes it, shows "Published: …" and reloads the wall. Staff-only updates (Refresh now) are hidden from team members. Tiles with nothing to post (Tips, Crowd reports) say where their data comes from.

### 2.2 Slide-over (right)

* Header with status and close. Three stats: last update, stale after, used/ignored.
* On red groups, an error banner with the failing fetcher, failed-run count and **Retry now**.
* Items list, flagged first. Each item has **Verify**, **Hide** and **Recategorize**, and shows its history ("Verified by Maria · 14:20", "Hidden by Juan (team)").
* Each item shows "Conflicts with: …" when the classifier linked it to the official item it contradicts.
* Footer: **Edit stale window**, and **Open full editor** for the group's own admin screen (where one exists: the schedule and places editors).

### 2.3 Intake table, graph and sources

* **Intake table:** raw posts sent in, and entries made on the team desk (marked Desk), newest first. Columns: time, from (who sent or entered it, platform, Official badge), the post, what it became (category and area), status (Published, or why it is pending or dropped, with flag and Verified badges) and actions. The header shows the 24h totals and the used percentage, which count raw posts only. Below `sm` the rows stack into cards.
* **Filters:** chips for **Open** (everything except dropped; the default), **To verify** (waiting for review, or flagged and still up; oldest first so nothing waits too long), **Flagged**, **Published** and **Dropped**, plus a group picker. `matchesIntakeFilter` in `src/lib/types.ts` defines them for the server and the sample data alike. Team members don't get To verify or Flagged.
* **Row actions** (`availableActions` in `src/lib/inbox.ts`): staff get Verify, Hide and Unhide on every row with an item. Team members get Hide and Unhide on their own desk entries only, sent through the team desk's `PATCH /api/team/items/:id`.
* **Live now on a tile:** each tile's update form lists what is live under it. Rows offer Take down, Resolved (safety posts), End now, Lower to pinned (staff), Edit, and **Change time** on advisories, closures and notices: When and Until pre-filled in Bacolod time, a line saying what readers will see ("Extended until 9:00 PM"), **Also post it to the feed** (on) with Announce as pre-set to the suggestion, and an optional note. It posts to `POST /api/team/items/:id/retime`; team members only on their own rows.
* **Graph:** a Table | Graph switch shows the same rows (same filter and group, up to 100) as a layered graph: people and pages → posts → feed items → events and places → areas. Edges are sent, entered, became, in area, about event, and for staff verified, hid and contradicts (a conflict and the official item it contradicts, drawn as an arc beside the items). Hovering or clicking a node highlights its neighbours; clicking an item opens its group's slide-over. The layout is deterministic, so nodes stay put across polls. The table stays the accessible view, and phones are asked to use a larger screen.
* **Sources:** one row per fetcher (Open-Meteo, classifier) and per team member (collector), with a health dot and last-seen time. A team member is active if they entered or sent anything in the last hour, whether through the team desk or a post push (see §4.5).

The board polls every 30 seconds. Like the public app, it falls back to clearly labeled sample data when the API is not running.

## 3. Data groups

Groups are defined in code: `GROUPS` in `server/control/config.ts`, in wall order. The only thing stored is a stale window staff changed from the board (`data_groups`, one row per override; picking the default again removes it), so a deploy that changes the groups needs no re-seed. Every item category belongs to exactly one group, and so do the two place feeds (promo spots, and every other kind), which `config.test.ts` checks. Place kinds live in `place_kinds`, so a kind the team adds needs no code change.

Each group also lists what **Update** mode offers on its tile (`updates`, at most five; `UPDATES` in `src/lib/types.ts` names every kind and what it freshens). `config.test.ts` checks that each update freshens a category, feed or fetcher of its own group, that each is offered on exactly one tile, and that no update key equals a group key.

A group's latest update is the newest of: its published items (by category, from the team desk or the classifier), the newest row of each feed it lists (`FEEDS` in `server/control/feeds.ts`), a lane check (`POST /api/team/lanes/:lane/checked`, which posts nothing to the public feed), an edit of a published item, and a later desk change to that item's topics. Feeds on `events`, `places`, `tips` and `traffic_readings` read `updated_at`, so edits count as well as additions. Every group except Weather, Tips and Crowd reports also lists the classifier as a fetcher, so a broken classifier turns them red.

| Group | Fed by | Default stale window |
| --- | --- | --- |
| Weather | `weather`; `weather_snapshots` feed, Open-Meteo fetcher | 30m |
| Schedule | `schedule_change`, `delay`, `cancellation`, `third_party_event`; `events:official` and `events:community` feeds (the schedule editor, official and community events alike). Desk event changes publish items in these categories, and a new event posts a `schedule_change` card, or a `third_party_event` card when it isn't official. The 3rd-party events tile was merged in on 2026-10-02. | 2h |
| Traffic | `traffic_advisory`, `traffic_sentiment`, `road_closure`, `road_reopening`; `traffic_readings` feed. Road closures had their own tile until 2026-09-29: readers see closures on the same map, conflicts are about the same roads, and "no new closure in 30 minutes" is normal, so it was a poor stale signal alone. The window is an hour so an hourly sweep can keep it green without re-posting. | 60m |
| Public safety | `crime_safety` | 1h |
| Announcements | `announcement`, `activity`, `other` | 6h |
| Places | `kiosk`; every Around place except promo spots (festival spots and services alike) | 1d |
| Sponsor games | `raffle`, `sponsor_game` | 6h |
| Winners | `winner` | 1d |
| Promos | `promo`; promo places | 6h |
| Tips | `tips` feed: the visitor guide's sections and tips (`tip_sections`, `tips`), added or edited on the team desk | 3d |
| Crowd reports | `crowd_readings` feed; the Crowd level update freshens it | 15m |

What each tile offers in Update mode:

| Group | Updates |
| --- | --- |
| Weather | Post weather notice · Refresh now (staff) |
| Schedule | Add event · Delay · Cancel event · Change venue · Back on schedule |
| Traffic | Update traffic (one form: traffic level, closed, or advisory) |
| Public safety | Post safety notice |
| Announcements | Post announcement · Post activity |
| Places | Add a place (Kind is a search-or-add field) · Manage places (temporarily closed until, Archive, Show archived) |
| Sponsor games | Post raffle · Post sponsor game |
| Winners | Post winners. A row has a label, a name and an optional prize, or "Results aren't out yet". Pick Standings or Final results; when results are already posted the form pre-fills from them (an event, or "Continue an earlier contest" for one off the schedule) and also offers Correction and Revision. Has the Announce as choice (Pinned suggested for corrections and for the final of a competition or parade). Posting again hides the earlier card. |
| Promos | Announce a promo (a deal, in the feed, optionally at a promo spot) · Add promo spot (a place on Around) |
| Tips | Add tip · Manage tips |
| Crowd reports | Crowd level (`crowd_level`). Visitors' reports wait under Visitor suggestions on the team desk, and are not counted on the tile |

The event form has **Repeats every day until** (optional) next to the timing: the hours repeat daily through that date, a line says what readers will see ("Daily, 5–9 Oct, 5:00 PM–2:00 AM"), and days called off are listed with **Bring back**. The schedule editor shows one row per run. For a repeating event, Cancel asks **Just one day** or **The rest of the run**, Change time changes the daily hours from the next night, and Started / Ended mark tonight only. Under the venue, **Add more venues** (collapsed until used) takes up to 6 more, each Route, Starts at, Ends at, Staging area or Also at, with an optional area; they can be reordered and removed. Readers see them under the main venue on the schedule card, search finds them, and the Traffic map marks those of events on now or starting within 3 hours. A venue change from Schedule → Venue changes the main venue only, and its hint says so. A notice, and a Closed road on the traffic form, show **Every day between** once From and Until fall on different days: a road shut every night reads closed only inside those hours and "Closes 3:00 PM" outside them. With a daily closure picked, the Reopen button says "Reopens Lacson St and ends the daily closure".

## 4. Rules

### 4.1 Health (per group)

Each fetcher (Open-Meteo, classifier) is checked on its last 10 runs:

* **Red** if its last 3 finished runs failed, or it has not run within 2× its expected interval (missed heartbeat; every 15m, so red after 30m).
* A run still marked `running` after one full interval died without finishing and counts as a failure ("did not finish"). One still inside its interval is ignored.
* **Idle** if it has not run for over 24h. That means it was switched off, not that it is broken, so it does not turn anything red.
* The error shown is the one behind the current run of failures. Once a run succeeds, no error is shown.

A group is then:

* **Red** if any fetcher it lists is red.
* Otherwise **gray** if its latest update (§3) is older than its stale window, or it has none.
* Otherwise **green**.

Failed runs from the last 24h also appear as error lines on the tile, but never count as an update.

The rules live in `streamHealth()` in `server/control/health.ts`, with unit tests next to it (`npm test`).

The ingest pass runs every `INGEST_INTERVAL_MINUTES` (15): the Worker cron in production (`server/worker.ts`, `wrangler.toml`) and a timer in the Node API locally (`server/ingest/scheduler.ts`, `INGEST_TIMER=off` to disable). Both run a pass only when `ingest_runs` shows one is due, so a restarted dev server does not refetch and the two never double up. Classifying right after a post comes in is logged as a classifier run too. Classifier runs may overlap: one item per raw post (a unique index) keeps a post from being published twice.

### 4.2 Flags (amber)

An item is flagged when any of these is true:

* **Conflict:** it contradicts a recent official item in the same area and topic, e.g. a crowd "Lacson is open" against an official closure.
* **Low confidence:** classifier confidence is below 0.6.
* **Unverified high stakes:** a crowd-sourced item about safety, cancellations or closures.

Flagged items stay published with their Crowd-sourced badge. Staff resolve a flag by verifying the item (which upgrades the badge), hiding it, or recategorizing it. Verifying an item that is waiting for review also publishes it.

Every change to an item goes through one set of actions (`server/items/actions.ts`), whoever makes it, and is logged in `item_actions`:

| Action | Does | Refused when |
| --- | --- | --- |
| `verify` | Records who verified it, clears the flag, publishes it if it was waiting for review | it is hidden |
| `hide` | Hides it, clears the flag | it is already hidden |
| `unhide` | Publishes it again | it is not hidden |
| `return_to_review` | Back to the inbox queue; withdraws the verification | it is already waiting for review |
| `recategorize` | New category, clears the flag | never |
| `edit` | New headline, details or area; keeps the flag | never |

A refused action (409) means the person acting saw an old copy, e.g. verifying an item somebody hid a moment ago. Actions that change nothing are not logged.

* **Mission control** sends them from the slide-over and the intake table's row actions (staff).
* **The curator inbox** signs in with a staff token and sends the same actions: Publish is `verify` (a curator vouches for the item, so it shows as Verified by staff), Hide is `hide`, and edits are `edit` and `recategorize`, sent together with the publish so they apply all or nothing. Undo puts the item back without vouching for anything new.
* **The team desk** can only `hide` and `unhide` desk entries; the history shows "(team)". On mission control, team members get these on their own entries only.

How the rules run (`server/ingest/flags.ts`, unit-tested; `findConflict` finds the official item a post contradicts, which is stored as `items.conflict_item_id`): the classifier pass flags new items only; official items (tier 1–2) and curator pastes are never flagged. **Conflict** means the post is in the same area as an official closure still in force (or a reopening) from the last 12h and says the opposite, by category or by words like "open", "bukas", "sarado". A conflicting post is filed under the claim it makes (e.g. a reopening), so it shows in the Traffic group next to the closure. Otherwise **unverified high stakes** covers `crime_safety`, `cancellation`, `road_closure` and `road_reopening`; then **low confidence** is below 0.6. One flag per item, in that order.

### 4.3 Public badges

| Badge | When |
| --- | --- |
| Official | The source is an official page (tier 1–2) |
| Verified by staff | Any staff member verified it |
| Crowd-sourced | Everything else |

The public site never shows which staff member verified an item; the control page does.

Team desk entries (by team members or staff; `isDeskEntry` in `server/items/desk.ts`) show **Verified by staff**, not Official: the team checked them, but the team is not an official page, so a promo or bazaar a team member posts never looks endorsed by the festival. On the schedule, events that aren't the festival's own show a **Community** badge, with "Presented by X" (a sponsor) or "By X" (the organiser) under the title. The Add event form asks "Who's putting it on?" (the MassKara Festival, a sponsor, or someone else); the answer sets the official flag and which credit is required. Events can also be all day or time TBA, and then readers see "All day" or "Time to follow" instead of a clock.

### 4.4 Intake buckets

Intake counts raw posts (collector pushes and curator pastes) from the last 24h. Each post falls in exactly one bucket, so the buckets always add up to the total:

| Bucket | Meaning |
| --- | --- |
| **Used** | It became an item that is published |
| **Pending** | Its item is waiting for review, or it has not been classified yet |
| **Dropped** | The classifier ignored it, or staff hid its item |

A group counts the posts whose item is in one of its categories. Posts with no item have no category, so they only count in the board-wide summary.

The classifier ignores a post (`outcome = ignored`, reason `irrelevant`) only when no rule matched and nobody vouches for it. Official and authority sources, curators and team members vouch, so their posts always become items. `raw_posts.outcome = used` means "became an item", published or not; the buckets read the item's status for the rest.

### 4.5 Team member activity

A team member (collector) is **active** if they did anything in the last hour, otherwise **idle**. `collectors.last_seen_at` is updated by `POST /api/ingest/posts` and by every successful team desk write (POST, PUT, PATCH or DELETE under `/api/team/*`). Reading the desk does not count. The sources panel's posts-in-24h count includes both.

## 5. Data model additions

| Table / column | Purpose |
| --- | --- |
| `ingest_runs` ✅ | One row per fetcher run: fetcher key, source, started/finished, status (`running`, `ok`, `error`), posts in, error text. This is what makes red trustworthy. Rows older than 7 days are deleted at the end of each ingest pass (`pruneRuns()` in `server/ingest/runs.ts`), which keeps the board fast. |
| `staff` ✅ | Name, hashed token, active, last seen. Same pattern as `collectors`, but for people who act on data rather than submit it. |
| `data_groups` ✅ (slice 6) | Now only `key` and `stale_minutes`: the stale windows staff changed. Groups are defined in code. |
| `raw_posts.outcome` ✅ | `used` (became an item) or `ignored` (+ reason). Only `irrelevant` is set today; `duplicate` and `spam` are reserved. Feeds the intake buckets (§4.4). |
| `items.verified_by`, `items.verified_at` ✅ | Staff verification, which drives the public badge. |
| `items.flag`, `items.flagged_at` ✅ | Open flag reason (`conflict`, `low_confidence`, `unverified_high_stakes`) or null once resolved. |
| `item_actions` ✅ | Audit log: item, staff or team member, action (`verify`, `hide`, `unhide`, `recategorize`, `edit`, `return_to_review`), before/after, time. |
| `raw_posts.staff_id` ✅ | Who pasted a post into the curator inbox. |
| `items.raw_post_id` unique ✅ | One item per post, so overlapping classifier runs cannot publish a post twice. |
| `places` ✅ | Renamed from `kiosks`, which always held every Around place; `kind` was an enum until 2026-09-30 and now references `place_kinds`. `events` and `places` gained `updated_at`. |
| Categories ✅ | Add `third_party_event`, `sponsor_game`, `promo`. |
| `items.staff_id` ✅ (slice 7) | Staff member who entered a desk item; a check keeps it and `collector_id` from both being set. Either makes the item a desk entry. |
| `events`/`places` `created_by_*`, `updated_by_*` ✅ (slice 7) | Who added and last changed an event or place on the desk: `created_by_collector_id`, `created_by_staff_id`, `updated_by_collector_id`, `updated_by_staff_id`. |
| `event_updates (item_id)` index ✅ (slice 7) | The graph looks events up by item. |
| `tip_sections`, `tips` ✅ | The visitor guide, which used to be written into the site: sections (stable slug for `#/visit/<slug>`, icon, "show on the Now page", order, hidden) each with ordered tips (title, text, optional icon, hidden). Migration 0013 seeds the old content. |
| `places.lat`, `places.lng` ✅ | Set from the map pin in the place editor. |
| `items.conflict_item_id` ✅ (slice 7) | The official item a conflict contradicted, set by the classifier and kept after the flag is resolved. |

✅ = shipped.

Staff are added the same way collectors are: `npm run staff:add -- "Name"` prints the token once.

## 6. API

All routes live under `/api/control`, with `authorization: Bearer <token>`: a staff member's or a team member's own token, or `ADMIN_TOKEN` (signs in as "Admin"). Team members get the watch routes built without flags; the routes marked **staff** refuse them with 403. Responses are `private, no-store`.

| Route | Returns / does |
| --- | --- |
| `GET /me` ✅ | `{ name, role }`, role `admin`, `staff` or `collector`; every team page checks a token with it |
| `GET /board` ✅ | Every group: health, the reasons it is red, open flag count, last update, stale window, intake buckets, last 5 activity lines; plus a summary |
| `GET /stream?filter=&group=` ✅ | The intake table: raw posts and desk entries with their outcome and resulting item. `filter` is `open` (default), `verify`, `flagged`, `published` or `dropped`; `verify` and `flagged` are staff only |
| `GET /graph?filter=&group=` ✅ | The same rows (up to 100, `truncated` beyond) as nodes and edges; staff also get verified, hid and contradicts edges |
| `GET /sources` ✅ | Fetcher and collector health |
| `GET /groups/:key` ✅ **staff** | Slide-over detail: stats, errors, items (flagged first) with action history |
| `POST /items/:id/actions` ✅ **staff** | `{ actions: [...] }`: one to four item actions (§4.2), applied in order, all or nothing, each written to `item_actions` |
| `GET /inbox?status=` ✅ **staff** | The curator inbox queue (`needs_review` by default) with the original post, who sent it and who pasted it |
| `POST /posts` ✅ **staff** | A curator pastes a post by hand; classified straight away |
| `PATCH /groups/:key` ✅ **staff** | Change the stale window (the default again removes the override) |
| `POST /fetchers/:key/retry` ✅ **staff** | Run one fetcher now |

The public `FeedItem` gains `trust: "official" | "staff" | "crowd"` for the badge.

## 7. Build slices

1. ✅ **Health backend**. `ingest_runs`, `data_groups`, `raw_posts.outcome`. Each fetcher in `runIngest` is wrapped in `logRun()`, and one failing fetcher no longer stops the others. `GET /board` and `GET /sources`.
2. ✅ **Staff and the wall.** `staff` table and token sign-in, the `#/control` route, the read-only wall with health, activity and ratio, and sample data for offline work.
3. ✅ **Intake stream and sources panel.** Team desk entries count in each team member's posts-in-24h. (Team desk entries counting as activity (§4.5) and `ingest_runs` retention shipped ahead of slice 2.)
4. ✅ **Flags and the slide-over.** Flag rules in the classifier pass, the slide-over, the actions and `item_actions`, and retry.
5. ✅ **Public side.** New categories in the classifier, `trust` on feed items, badges in `FeedCard`, and 3rd-party events, sponsor games and promos on the public pages.
6. ✅ **Reconciliation.** The ingest pass on a timer and a Worker cron; an idempotent classifier; groups in code with typed feeds, Places and Announcements; edits to events and places count as updates; the curator inbox and team desk on the shared item actions.
7. ✅ **Watch / Update, intake table and graph.** One sign-in for staff and team members, with roles; staff can post on the team desk and every desk entry, event and place records who made it. Update mode puts each group's kinds of update on its tile and opens the desk forms in a slide-over. The intake stream becomes a table with filters and row actions, with a graph of how people, posts, items, events, places and areas relate. Conflicts store the official item they contradict. Editing an event keeps its official flag. (Community events freshened a 3rd-party events tile until 2026-10-02, when it merged into Schedule.)

Each slice ships on its own and is useful alone: slice 1 already answers "is anything broken?" through the API.
