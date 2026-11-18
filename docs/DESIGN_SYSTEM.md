# Better Maskara design system

Live reference: run `npm run dev` and open `http://localhost:5173/#/design`. It has a Light / Auto / Dark switch.

## Principles

* **Phone first, outdoors.** People read this on a street during a parade, in sun or at night. High contrast, 16px body text, 44px touch targets, and nothing important hidden behind hover.
* **Official stands out.** Official sources get a solid magenta badge, and urgent official posts (closures, cancellations) get a magenta edge. Everything else stays quieter.
* **Festive, not noisy.** Magenta and gold carry the MassKara feel in a few places (brand mark, primary actions, badges, the event happening now). Surfaces stay beige so content leads.
* **Warm and hand-made.** Abaca beige paper, banig weave bands, sawali cross-hatch and faint line drawings of a MassKara mask give the app a local-craft feel. See `docs/BRAND_MASSKARA.md` for where this comes from and the rules that keep it quiet.

## Layout

Phone first. Wider layouts come from **container queries and intrinsic grids, never viewport breakpoints** (order of preference: container query, then intrinsic sizing, then a media query only for input or preference such as `pointer: fine`).

| Piece | How it adapts |
| --- | --- |
| `.app` container | Holds the site header (`SiteHeader`). |
| `.hero-head` container | The site header is a sticky size container (`hero`). On Now it opens at its natural height, capped by `--hmax` (40rem, 34rem from 52rem wide; a clipped middle fades at its edge), and gives up a pixel for each pixel scrolled down to `--hc`, and its layout follows the height it has: the middle (area, prompt, what's on) clips, shrinks and fades, then under 9rem the area and search join the brand and the pills take their own row (one row with the brand from 52rem wide). Other pages hold it at `--hc`. `.page-gutter` matches `.app-main`'s gutter. |
| `.app-main` container | The content column, max 96rem. Pages lay out from its width, so they also work in split windows. `--gutter` grows with `cqi`; `--bleed` is the gutter on phones and 0 elsewhere. |
| `.bleed`, `.bleed-panel`, `.bleed-scroll` | Edge-to-edge strips and scroll rows on phones; rounded panels and wrapping rows once there is room. |
| `.auto-grid` (+ `.fit`) | `repeat(auto-fill, minmax(min(var(--min), 100%), 1fr))`. Feed, places, traffic tiles, schedule days. No query. |
| `.split` | Map beside list when both fit (`--main`, `--side`), stacked otherwise. No query. |
| `.now-grid` | Home page areas under the header. One column on phones (what to know, then the feed); from a 54rem content column the panel sits beside the feed and stays in view. |
| `.text-hero` | Headline size from the content column's width (`cqi`), not the screen. |

The site header is `sticky`, not `fixed`: inline-size containment on `.app` makes it the containing block for fixed elements. `AmbientArt` sits outside `.app` for the same reason.

## Home header

The full header on Now (`src/components/SiteHeader.tsx`) answers two questions:

* **Where are you?** A searchable list of festival zones (`src/lib/zones.ts`), remembered per device. No zone means all of Bacolod. A zone puts its posts, roads, spots and events first; the rest of Bacolod follows under "Elsewhere in Bacolod", so a quiet zone is never empty.
* **What are you interested in?** The search prompt. Clicking anywhere in the header that isn't a control opens search, as do `⌘K`, `Ctrl+K` and `/`.

Beside them, what's on today on the schedule's own timeline (the live event as a `NowCard`, then the next one), in its `brief` form: a slim live card (what, where, until when) and one-line rows (start, title, venue, kind), each linking to the event; under them, the menu pills. The art behind it (`src/craft/HeroArt.tsx`) is the only place the festival gets loud colour, and it stays at a few percent opacity (see `BRAND_MASSKARA.md`).

Search covers events, roads, places, the visitor guide and page shortcuts (`src/lib/intents.ts`). Pages live in the URL hash (`#/traffic`, `#/around/food`) so back buttons and shared links work.

## Tokens (`src/index.css`)

Two layers:

1. **Palette scales**: `brand` (mask magenta), `gold` (accent), `teal` (secondary), `neutral` (abaca beige to soil brown), steps 50–950, and `abaca` (fibre, 100–500) for patterns and art only. Same in both themes.
2. **Semantic tokens**: what components use. Redefined for dark mode.

| Group | Tokens |
| --- | --- |
| Surfaces | `surface`, `surface-raised`, `surface-sunken`, `surface-band` (woven and date strips), `surface-inverse` |
| Text | `ink`, `ink-muted`, `ink-subtle`, `ink-inverse` |
| Lines | `line`, `line-strong`, `focus` |
| Craft | `weave`, `weave-soft` (rail and pattern colour), `weave-thread` (the banig lattice), `ambient` + `--ambient-opacity` (background art) |
| Brand roles | `primary`, `primary-hover`, `primary-soft`, `primary-ink`, `accent`, `accent-soft`, `accent-ink` |
| Status | `ok`, `warn`, `danger`, `info`, each with `-soft` (background) and `-ink` (text on soft) |
| Type | `font-sans` Inter, `font-display` Fraunces (soft serif), `font-mono` for dates and kickers, `text-display`, `text-title`, `text-caption` |
| Shape | `rounded-control` 12px, `rounded-card` 18px, `rounded-sheet` 24px, `rounded-chip` |
| Elevation | `shadow-card`, `shadow-raised`, `shadow-overlay` |
| Motion | `ease-out-quint`, `animate-live`, `animate-shimmer`; all motion stops under reduced-motion |

Rules:

* Components use semantic tokens only, never `brand-600` for a surface or text. That keeps dark mode automatic.
* Text on a tinted background uses the matching `-ink` token (`bg-danger-soft text-danger-ink`), which keeps contrast readable in both themes.
* Fonts are self-hosted with Fontsource (no Google Fonts request), which keeps the page fast and works offline later.

## Theme

Follows the OS by default. `useTheme()` stores a per-device choice and sets `data-theme="light" | "dark"` on `<html>`; a small script in `index.html` applies it before first paint. The dark values live in `src/index.css` in two identical blocks (OS dark, forced dark); change both together.

## Components (`src/ui`)

| Component | Use |
| --- | --- |
| `Button`, `IconButton` | `primary`, `secondary`, `ghost`, `danger`; sizes `sm` `md` `lg`; `icon`, `loading`, `block`. `IconButton` requires `label`. |
| `Badge` | Category and status labels. `soft` (default) or `solid`, 7 tones. |
| `Chip` | Feed filters; `active`, optional `icon` and `count`. |
| `SegmentedControl` | 2–4 exclusive views (Today / Tomorrow). |
| `Card` | `raised`, `outline`, `sunken`, `highlight` (urgent official); `interactive` for tappable cards. |
| `Alert` | Inline closures, advisories, form results. `danger`/`warn` are announced to screen readers. |
| `Field` + `Input`, `Textarea`, `Select` | Label, hint and error wiring with ids handled for you. |
| `Skeleton`, `CardSkeleton`, `Spinner` | Loading states. |
| `EmptyState` | Nothing to show yet, with optional action. |
| `LiveDot` | Pulsing "live / happening now" marker. |
| `SectionHeader` | Section title with optional subtitle and action. |

## Craft layer (`src/craft`, `src/index.css`)

| Piece | Use |
| --- | --- |
| `.weave`, `.weave-accents` | Banig lattice traced from the reference tile: one diagonal thread per cell on a 17 x 6 grid, drawn as a mask in `weave-thread`. Accents are the reference's own gold diamond and single pink and blue threads, at `--weave-accent-opacity`. |
| `WeaveBand` | Section break with a centred label ("Latest", "Schedule"). At most one or two per screen. |
| `WeaveRibbon` | Thin woven edge with no label. |
| `.sawali` | Bamboo cross-hatch for date strips and quiet headers. |
| `AmbientArt` | Fixed line drawings (mask, petal burst) behind the page. Render once per page; never put content-bearing art here. |

## Timeline (`src/components/Timeline.tsx`)

The live event is a `NowCard` (deep mulberry, woven wedge where a photo will go). Later events hang off a thin abaca rail, each marked with a woven knot that turns gold while the event is live. `limit` shows a `N+` knot at the end of the rail that opens the full schedule. The Schedule tab groups days under sawali date strips.

Icons are `lucide-react`: 20px in navigation, 16px inline, 14px inside badges.
