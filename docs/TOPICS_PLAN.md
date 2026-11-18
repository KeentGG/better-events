# Topics, preferences and "For you"

## Context
Visitors want what matches their interests (food, music, sports > chess, games). The app has no *topic* notion: `items.category` is message type (delay, winner, promo), `events.kind` is free text (6 values), plus `place_kinds`. FKs already exist (item → place, event_update → event/item, everything → area). Missing: a topic node type and tagged-with edges.

## Decision: topic graph in Postgres (no graph DB)
Small volume, Cloudflare Worker target, recursive CTEs suffice. The mislabel problem is fixed at entry: topic required with good suggestions.

### Schema (new migration)
- `topics`: `key` (pk, immutable, e.g. `sports.chess`), `parent_key` (fk topics, nullable), `name`, `aliases text[]`, `icon`, `hidden`, `order`, authorship. Staff-managed like `place_kinds` with the same alias trick ("chess", "ahedres" → Sports > Chess). **Max two levels**, enforced by check/trigger.
- `entity_topics`: `entity_type` ('item'|'event'|'place'), `entity_id`, `topic_key`, `source` ('desk'|'classifier'), `confidence`, `created_by_*`. PK (entity_type, entity_id, topic_key); index on topic_key. Multiple topics per entity. Polymorphic → trigger (or app-level delete) cleans up on entity delete.
- Topic ≠ category. Do not merge.

### Inheritance (computed on read)
Item effective topics = own ∪ linked event's (via `event_updates.item_id`) ∪ linked place's (`items.place_id`). One SQL view `entity_effective_topics` feeds the API.

### Seed + backfill
Seed from data: event kinds → topics (Parades, Competitions, Concerts→Music, Food, Workshops, Ceremonies); non-service place kinds → topics (Food, Rides, Thrift, Promos); add roots Sports, Games, Raffles. Backfill `entity_topics` from `events.kind`, `places.kind`, item categories (sponsor_game, raffle → Games), source='desk'.

## Tagging flow
- Desk forms (event, place, item editors in team desk + Update mode) get `TopicPicker`: pre-fills by alias match on title/body; required ≥1 for events and places; optional for items linked to event/place; typing new name offers "add topic under…" like place kinds.
- Classifier writes suggested topics with confidence; below threshold → item shows under **To verify** in intake table.
- Mission control graph: topics layer, zero-recent-content topic node gray (step 4, may follow later).

## API
- `GET /api/topics`: tree with live count per topic (published/upcoming in next N hours). Dock grays empty ones (doesn't hide).
- `/feed`, `/schedule`, `/around` payloads gain `topics: string[]` (effective keys). Update `src/lib/types.ts` and sample data.
- Staff CRUD for topics in `server/team.ts`, aliases editor like place kinds.

## Preferences (client, localStorage)
Key `sm-interests` = `{ topics: string[] }`, try/catch like `src/lib/intents.ts`, `usePreferences()` via `useSyncExternalStore` + `storage` events. Picking a parent subscribes the subtree (future children included). Match = `prefs ∩ ancestorsOrSelf(entity.topics)`, one helper in `src/lib/interests.ts`.

## UI
- `src/ui/PreferredBadge.tsx`: gold `Badge` "For you · Chess" naming matched topic. In FeedCard, HeroBanner, Timeline/ScheduleView rows, AroundView cards, SearchPalette results.
- `src/components/InterestDock.tsx`: portaled to body like `Toast.tsx`, bottom-right above bottom nav. Collapsed: pill with chosen topic icons or "What are you into?" + CTA "For you (12) →" to `#/foryou`. Expanded: root chips → sub-chips with counts. Hidden on staff tabs; on For you page it's only the editor.
- `ForYouView` (`#/foryou`, new `Tab` in `src/lib/route.ts`): sections Happening now/next (events), Latest (items), Places; removable topic chips; empty states "no interests yet" (inline picker) and "nothing on for Chess right now" (suggest siblings).

## Build order
1. Migration, seed, backfill, view, `/api/topics`, topics on payloads.
2. Desk TopicPicker + alias suggestions, staff topic CRUD, classifier writes + To verify.
3. Client prefs store, badge, dock, For you page.
4. Topics layer in mission control graph.

## Verification
- Vitest: inheritance (item linked to chess event → sports.chess), subtree match, depth limit, backfill counts, delete cleanup.
- Local masskara-pg on 55432: create "Chess tournament" on desk → picker suggests Sports > Chess; post winner item linked to it; `/api/feed` returns `topics: ["sports.chess"]`.
- Browser (preview build on :5180): pick Sports in dock → badges on event + announcement; For you lists both; survives reload; phone layout no overlap with nav/toasts; dock absent on `#/control`.
- `npm test` + typecheck pass; commit to main.

## Update, 2026-10-10: interests, not event kinds
- Migration `0025_interest_topics` rewrote the list in visitor language (Festival highlights, Music › Concerts / Parties & DJs / Rap / Singing / Drums, Dance, Pageants, Celebrities & shows, Art, Sports › kinds, Food › kinds, Kids & family › Pets, Community & services…) and retagged the schedule by title. `competitions` and `ceremonies` are hidden: they say how an event is run.
- `/api/topics` counts changed: `count` = events still to come + items from the last day, `today` = the part on within 24 h, `places` = active places (no longer mixed into `count`).
- The picker (`TopicChips`) shows every topic at once, grouped under its parent. `#/foryou` owns picking and editing (the dock stays off that page), lists Today then Coming up (3 days, then "Show more days"), and leaves venues out of Places.
