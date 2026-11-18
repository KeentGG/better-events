# Features and first impression

Written 2026-09-28. What Better Maskara does today, what is planned, what we suggest adding, and what a first-time visitor should feel in the first few seconds.

## 1. The first impression

The site owner's brief, in their words: *"Wow, this is a comprehensive and updated site. All info is real-time and live. I get to know that there are these X features and each is sufficiently active. I know where the search is. I know what kind of updates and alerts this site shows."*

Broken into what a visitor should feel, and what on screen earns each feeling:

| Feeling | What earns it on the first screen |
| --- | --- |
| **"It's live."** | Live dot and "Live · Bacolod City" kicker. A pulse strip where every feature shows its own freshness ("updated 8 min ago"). The event happening now is the one loud card. |
| **"It covers everything."** | The pulse strip names every feature at once: Updates, Traffic, Schedule, Weather, Around. Each shows a number that proves activity (4 updates in the last hour, 1 road closed, 9 spots). |
| **"Each part is active."** | Numbers and times, never "coming soon", on the first screen. Features with no data yet say when they last checked, not nothing. |
| **"I know where search is."** | The hero is the search prompt ("What are you interested in?"), and clicking anywhere in it opens search; the ⌘K hint shows on desktop. Once the header compacts, a search button sits beside the area. |
| **"I know what it alerts me about."** | The feed filters double as a legend with counts: Events, Traffic, Winners, Kiosks & raffles, Safety. Official posts wear the magenta Official badge; urgent official posts get the magenta edge. |
| **"It's from here."** | Abaca paper, banig weave and mask line art (see `BRAND_MASSKARA.md`). Warm and local, not a generic news template. |
| **"I can trust it."** | Source on every card, Official vs Community vs Unverified labels, times on everything. |

What they should **not** feel: overwhelmed (one loud element per screen, 80/15/5 colour rule), sold to (promos stay in Around), or lost (the same five pages everywhere).

The tone in one line: **a calm, well-informed local friend who is watching the whole festival for you.**

## 2. Current features (on `main` plus PR #3)

| Feature | For | Status |
| --- | --- | --- |
| Live feed of announcements, delays, cancellations, winners, traffic, weather, safety, kiosks, raffles | All | Live with API; sample without |
| Source tiers and badges (Official, Community, Unverified) | All | Live |
| Feed filters by category | Browsing | Live |
| Weather now (Open-Meteo), with plain-language advice | Browsing | Live (advice added in PR #3) |
| Traffic by area from advisories and reports | Finding | Live with API |
| Schedule timeline with "Happening now", delays and cancellations | Browsing | Sample data; no `/api/schedule` yet |
| Curator inbox (`/#/inbox`, `POST /api/control/posts`) and rule classifier | Team | Live |
| Collector submissions from the monitoring team (`POST /api/ingest/posts`) | Team | Live (API only, no screen) |
| Crowd report endpoint (`POST /api/reports`) | All | API only; no form yet |
| Light, dark and auto theme | All | Live |
| Design system preview at `/#/design` | Team | Live |
| **PR #3:** desktop and wide layouts, side rail | All | Draft |
| **PR #3:** "I'm here for" intent shortcuts | All | Draft |
| **PR #3:** search (⌘K, Ctrl+K, `/`) across events, roads, places, guide | Finding | Draft |
| **PR #3:** real traffic map (MapLibre + OpenFreeMap tiles, OpenStreetMap road shapes) with road filter | Finding | Draft, sample levels |
| **PR #3:** Around page (promos, rides, thrift, food, kiosks) | Browsing | Draft, sample data |
| **PR #3:** Visit guide (getting there, what to do, tips) | Visiting | Draft, sample data |
| **PR #3:** live pulse strip and hero search | All | Draft |

## 3. Planned features (from `ARCHITECTURE.md` roadmap)

1. **This week:** `/submit` screen for the monitoring team, curator inbox screen, deploy to Cloudflare + Neon.
2. **Next:** crowd report form with verification (two reports agree within 30 minutes, or an official post matches), traffic sentiment map, kiosks map.
3. **When Meta approvals land:** automated Facebook (Page Public Content Access or managed-Page webhooks) and Threads keyword ingestion, optional LLM classification.
4. **Later:** installable PWA and push alerts for closures and delays, winners archive, Filipino and Hiligaynon UI.

## 4. Suggested features

Ordered by how much they add to the first impression and to the three kinds of visitor.

| Suggestion | Why | Effort |
| --- | --- | --- |
| **Schedule and Around API routes** | Turns the two biggest sample-data pages live. The tables (`events`, `places`) already exist. | Small |
| **"Last checked" heartbeat per source** | Proves liveness even on quiet hours ("Checked official pages 2 min ago, nothing new"). Directly serves "each feature is active". | Small |
| **Alert me** (push or SMS-free web push) for closures, delays and cancellations on events you starred | The strongest "this is live" feeling, and the reason to come back. | Medium |
| **Star events, "My MassKara" plan** | Browsing and Visiting users build a day; the schedule becomes theirs. Works offline with localStorage first. | Small |
| **Winners board** with a results archive per contest | High-interest, shareable, and updates in bursts that feel live. | Small |
| **Share cards** (a closure or a winner as a nice image) | Word of mouth on Facebook, where Bacolod already is. | Medium |
| **Crowd level by area** ("Plaza: packed") from reports | What people ask each other most after traffic. | Medium |
| **Hiligaynon toggle** | Local pride and reach; strengthens "it's from here". | Medium |
| **Accessibility and family info**: wheelchair-friendly viewing spots, kid zones, restrooms, first aid | Rounds out Visit; nobody else lists it. | Small (curated) |
| **"Many faces" art commission** (see `BRAND_MASSKARA.md`) | The brand's most distinctive asset. | External |

## 5. How the landing applies this (PR #3)

1. **Hero:** live kicker, headline, and a search field that says what it searches.
2. **Live pulse strip:** one tile per feature (Updates, Traffic, On now, Weather, Around), each with a number and a freshness time, each a link. This is the "X features, each active" moment.
3. **"I'm here for…" shortcuts:** the visitor sees the site knows why they came.
4. **On today** with the one loud "Happening now" card.
5. **Know before you go** panel (weather advice, tips, worst roads) beside the feed on desktop.
6. **Latest** feed with filter chips that show counts, so the alert types read as a legend.
