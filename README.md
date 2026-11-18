# Better Maskara

Mobile-first website with everything happening at the MassKara Festival in Bacolod: official announcements, schedule changes, delays, winners, traffic, weather, kiosks and raffles, updated all day.

## Screenshots

| Desktop | Mobile |
| --- | --- |
| ![Live feed on desktop](docs/screenshots/now-light.png) | ![Live feed on mobile](docs/screenshots/now-mobile.png) |

Read `docs/ARCHITECTURE.md` for sources, data model, hosting and the roadmap, and `docs/DESIGN_SYSTEM.md` for tokens and components (live at `/#/design`), and `docs/FIRST_IMPRESSION.md` for the feature list and what a first visit should feel like.

Posting through the API (agents sourcing posts from Facebook and elsewhere): read "Posting through the API" in `docs/ARCHITECTURE.md` §6 first. Add a missing area, place kind or topic instead of working around it, and report a gap only when no call there can carry the post.

## Stack

React 19 + Vite 8, Tailwind CSS v4, lucide-react icons, own design system (`src/ui`, tokens in `src/index.css`), Hono API (`server/`), Drizzle ORM + Postgres.

## Run locally

```sh
npm install
cp .env.example .env          # set DATABASE_URL to any Postgres
npm run db:migrate            # applies server/db/migrations
npm run db:seed               # Bacolod area gazetteer
npm run dev:api               # API on http://localhost:8787/api, runs the ingest pass every 15 min
npm run dev                   # web app on http://localhost:5173
```

Without the API the web app shows clearly labeled sample data.

## Demo mode

Pin the site to Saturday 17 October 2026, 9 PM in Bacolod: the clock is frozen, the API is read-only and ingest is off.

```sh
npm run demo:db   # clone masskara into masskara_demo, prune after the pin, add that night's weather (needs Docker)
npm run demo:api  # API on http://localhost:8788
npm run demo:web  # build and preview at http://localhost:5182
```

`demo:db` uses the local `masskara-pg` container and never writes to `masskara`. Content created after the pin is deleted, `/api` answers every write with 403, and the web build shows a demo notice. `DEMO_NOW` turns the server on and `VITE_DEMO_NOW` the web build; with them unset, nothing changes.

Production is pinned the same way, against the real database and with no pruning: the image build in `.github/workflows/deploy.yml` passes `VITE_DEMO_NOW` and `DEMO_NOW` (`2026-10-17T21:00:00+08:00`), so the deployed clock is frozen, the feed stops at the pin, `/api/weather` serves the snapshot in `server/data/demo-weather.json`, writes answer 403 and ingest is off. To return to the live clock, delete those two lines from the workflow's `build-args` and redeploy; an empty value means off.

The ingest pass (Open-Meteo weather, then the classifier over posts people sent in) runs every 15 minutes. Locally the API runs it in process when one is due; set `INGEST_TIMER=off` when something else runs it. `npm run ingest` runs one pass now.

Add a post through the curator inbox (it is classified straight away):

```sh
curl -X POST localhost:8787/api/control/posts \
  -H "authorization: Bearer <staff token>" -H "content-type: application/json" \
  -d '{"text":"TRAFFIC ADVISORY: Lacson St closed to vehicles\nFrom 6th to 21st St."}'
```

Monitoring team members (collectors) push posts with their own token:

```sh
npm run collector:add -- "Maria"   # prints the token once
curl -X POST localhost:8787/api/ingest/posts -H "authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{"posts":[{"platform":"facebook","url":"https://facebook.com/...","author":"MassKaraFestivalBacolod","text":"...","postedAt":"2026-10-04T09:30:00+08:00"}]}'
```

The team can use screens instead of curl. They are not linked from the public nav; share the links:

* `/#/team`: the team desk. Post closures, traffic levels, event changes, winners and announcements, and edit the schedule, Around places (with a map pin) and the visitor guide's tips. Area pickers search the list and can add a new area on the spot. Team members and staff both use it with their own token.
* `/#/inbox`: curators publish, hide or fix posts the classifier was unsure about. Staff only (`ADMIN_TOKEN` also works). Publishing verifies the item, so it shows as "Verified by staff".

Each person has one token, which every team page accepts and the device remembers once.

Mission control (internal, see `docs/MISSION_CONTROL.md`) is at `/#/control`: a wall with one tile per data group, green, gray (stale) or red (broken). **Watch** shows what each group last got; **Update** turns each tile into buttons that open the right desk form. Staff and team members sign in with their own token (team members land in Update and see no flags); `ADMIN_TOKEN` also works, watch only. Below the wall, the intake table (or graph) lists what came in and what it became. "Preview with sample data" shows the wall without a server.

```sh
npm run staff:add -- "Maria"   # prints the token once
curl localhost:8787/api/control/board -H "authorization: Bearer <token>"     # group health, activity, used/ignored
curl localhost:8787/api/control/sources -H "authorization: Bearer <token>"   # fetcher and collector health
```

## Deploy the API (Cloudflare Workers)

`server/worker.ts` serves the API and runs the ingest pass from the cron in `wrangler.toml`. The web app is built separately (`npm run build`, Cloudflare Pages).

```sh
npx wrangler secret put DATABASE_URL        # also ADMIN_TOKEN and TURNSTILE_SECRET
npm run db:migrate                          # then deploy straight away: new code expects the new schema
npm run deploy:api
npm run dev:worker                          # local Worker; curl localhost:8787/__scheduled runs the cron
```

## Layout

```
src/
  ui/            design system components (Badge, Button, Card, Chip, SectionHeader)
  components/    app components (SiteHeader, FeedCard, TrafficStrip, NowView)
  lib/           shared types, API client, category metadata, helpers
  data/sample.ts placeholder content for offline development
server/
  app.ts         Hono API (portable: Cloudflare Workers, Vercel, Node)
  node.ts        local Node entry (API + ingest timer)
  worker.ts      Cloudflare Workers entry (API + ingest cron)
  db/            Drizzle schema, client, migrations, seed
  ingest/        weather (Open-Meteo), rule classifier, the ingest pass and its scheduler
  items/         item actions (verify, hide, edit…) shared by mission control, the inbox and the desk
  control/       mission control groups and feeds, fetcher registry, board, inbox and sources queries
```
