import { ArrowLeft, Bell, Filter, Inbox, Monitor, Moon, Plus, Send, Share2, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FeedCard } from "../components/FeedCard";
import { Timeline } from "../components/Timeline";
import { BurstArt, MaskArt } from "../craft/MaskArt";
import { WeatherScene } from "../craft/WeatherScene";
import { WeaveBand, WeaveRibbon } from "../craft/WeaveBand";
import { WeatherStrip } from "../components/EventWeather";
import { SCENES, sceneLabel, sceneOf } from "../lib/eventWeather";
import { TrafficStrip } from "../components/TrafficStrip";
import { sampleFeed, sampleSchedule, sampleTraffic, sampleWeather } from "../data/sample";
import { categoryMeta } from "../lib/categories";
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardSkeleton,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  LiveDot,
  SegmentedControl,
  Select,
  Spinner,
  Textarea,
  type ThemePreference,
  useTheme,
} from "../ui";

const scales = ["brand", "gold", "teal", "neutral", "abaca"] as const;
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
// abaca only has 100–500; missing steps render empty.
const tones: BadgeTone[] = ["brand", "gold", "ok", "warn", "danger", "info", "neutral"];
const semantic = [
  "surface",
  "surface-raised",
  "surface-sunken",
  "surface-inverse",
  "ink",
  "ink-muted",
  "line",
  "primary",
  "primary-soft",
  "accent",
  "accent-soft",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-caption font-semibold tracking-wider text-ink-subtle uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Living reference for the design system. Open at /#/design. */
export function DesignPreview() {
  const [theme, setTheme] = useTheme();
  const [chip, setChip] = useState("all");
  const [day, setDay] = useState<"today" | "tomorrow" | "week">("today");

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-16">
      <header className="sticky top-0 z-10 flex h-15 items-center gap-2 border-b border-line bg-surface/85 px-2 backdrop-blur-lg">
        <IconButton label="Back to app" icon={<ArrowLeft className="size-5" />} onClick={() => (location.hash = "")} />
        <h1 className="flex-1 font-display text-title">Design system</h1>
        <div className="w-44">
          <SegmentedControl<ThemePreference>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "system", label: "Auto" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </header>

      <main className="space-y-10 px-4 pt-6">
        <Section title="Typography">
          <div className="space-y-2">
            <p className="font-display text-display">
              Street dance day, <em className="text-primary-ink">all smiles.</em>
            </p>
            <p className="font-display text-title">Arena competition moved to 3 PM</p>
            <p className="text-base">Body text uses Inter at 16px for comfortable reading on phones.</p>
            <p className="text-sm text-ink-muted">Secondary text for supporting details and metadata.</p>
            <p className="font-mono text-sm tracking-wide">Monday, September 28 · mono for dates and kickers</p>
            <p className="text-caption font-semibold tracking-wider text-ink-subtle uppercase">Caption · labels</p>
          </div>
        </Section>

        <Section title="Palette">
          <div className="space-y-2">
            {scales.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="w-14 text-xs text-ink-muted capitalize">{s}</span>
                <div className="flex flex-1 overflow-hidden rounded-control">
                  {steps.map((n) => (
                    <div key={n} title={`${s}-${n}`} className="h-8 flex-1" style={{ background: `var(--color-${s}-${n})` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Semantic colors (switch theme to compare)">
          <div className="grid grid-cols-3 gap-2">
            {semantic.map((t) => (
              <div key={t} className="overflow-hidden rounded-control border border-line">
                <div className="h-10" style={{ background: `var(--color-${t})` }} />
                <p className="truncate px-2 py-1 text-[0.6875rem] text-ink-muted">{t}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Craft: weave, sawali and background art">
          <WeaveBand as="p">Explore</WeaveBand>
          <WeaveRibbon className="-mx-4" />
          <div className="sawali -mx-4 flex h-11 items-center justify-center border-y border-line bg-surface-band">
            <span className="rounded-control bg-surface-band px-3 font-mono text-sm">Sawali date strip</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Card variant="outline" className="grid place-items-center text-ambient">
              <MaskArt className="w-32" />
            </Card>
            <Card variant="outline" className="grid place-items-center text-ambient">
              <BurstArt className="w-32" />
            </Card>
          </div>
          <p className="text-sm text-ink-muted">Specimens only. Pages use the dotted paper grain.</p>
        </Section>

        <Section title="Timeline">
          <Timeline events={sampleSchedule.slice(0, 6)} limit={2} />
        </Section>

        <Section title="Weather on event cards">
          <p className="text-sm text-ink-muted">A start-only event wears the sky at its start hour; a start-to-end event gets the strip.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCENES.flatMap((scene) =>
              [true, false].map((isDay) => (
                <div key={`${scene}-${isDay}`} className="on-sky relative isolate h-28 overflow-hidden rounded-card p-2.5 text-sm font-semibold">
                  <WeatherScene scene={scene} isDay={isDay} className="absolute inset-0 -z-10 size-full" />
                  {sceneLabel[scene]} · {isDay ? "day" : "night"}
                </div>
              )),
            )}
          </div>
          <WeatherStrip
            slots={(sampleWeather.hourly ?? []).slice(0, 8).map((h) => ({ at: h.at, hours: 1, temperatureC: h.temperatureC, precipitationProbability: h.precipitationProbability, scene: sceneOf(h.weatherCode, h.precipitationMm), isDay: h.isDay, cloudCover: h.cloudCover, precipitationMm: h.precipitationMm }))}
          />
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Send className="size-4" />}>Submit report</Button>
            <Button variant="secondary" icon={<Share2 className="size-4" />}>
              Share
            </Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Remove</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Notifications" icon={<Bell className="size-5" />} />
            <IconButton label="Filter" variant="secondary" icon={<Filter className="size-5" />} />
            <IconButton label="Add" variant="primary" icon={<Plus className="size-5" />} />
          </div>
          <Button block size="lg">
            Full-width action
          </Button>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-1.5">
            {tones.map((t) => (
              <Badge key={t} tone={t}>
                {t}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tones.map((t) => (
              <Badge key={t} tone={t} variant="solid">
                {t}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(categoryMeta).map(([k, m]) => (
              <Badge key={k} tone={m.tone} icon={<m.icon aria-hidden />}>
                {m.label}
              </Badge>
            ))}
          </div>
          <p className="flex items-center gap-2 text-sm">
            <LiveDot /> Live now <LiveDot tone="ok" className="ml-3" /> Ongoing
          </p>
        </Section>

        <Section title="Chips and segmented control">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {[
              ["all", "All", 24],
              ["events", "Events", 8],
              ["traffic", "Traffic", 6],
              ["winners", "Winners", 2],
            ].map(([id, label, n]) => (
              <Chip key={id} active={chip === id} count={n as number} onClick={() => setChip(id as string)}>
                {label}
              </Chip>
            ))}
          </div>
          <SegmentedControl
            label="Day"
            value={day}
            onChange={setDay}
            options={[
              { value: "today", label: "Today" },
              { value: "tomorrow", label: "Tomorrow" },
              { value: "week", label: "This week" },
            ]}
          />
        </Section>

        <Section title="Alerts">
          <Alert tone="danger" title="Lacson St closed until 9 PM">
            Street dance route. Use Araneta St or the Circumferential Road.
          </Alert>
          <Alert tone="warn" title="Rain likely after 3 PM">
            60% chance of thunderstorms. Bring an umbrella.
          </Alert>
          <Alert tone="info" title="Schedule updated" action={<Button size="sm" variant="secondary">View schedule</Button>}>
            Two events moved to the Government Center.
          </Alert>
          <Alert tone="ok" title="Report sent">
            Thanks! It will show once another report or an official post confirms it.
          </Alert>
        </Section>

        <Section title="Cards">
          <FeedCard item={sampleFeed[0]} />
          <FeedCard item={sampleFeed[2]} />
          <div className="grid grid-cols-2 gap-2">
            <Card variant="outline">
              <p className="text-sm font-semibold">Outline</p>
              <p className="text-xs text-ink-muted">Grouping without weight</p>
            </Card>
            <Card variant="sunken">
              <p className="text-sm font-semibold">Sunken</p>
              <p className="text-xs text-ink-muted">Secondary panels</p>
            </Card>
          </div>
          <TrafficStrip areas={sampleTraffic} />
        </Section>

        <Section title="Form fields">
          <Card className="space-y-4">
            <Field label="What's happening?" hint="Keep it short. No names of private people.">
              {(p) => <Textarea placeholder="Heavy traffic near the plaza…" {...p} />}
            </Field>
            <Field label="Area">
              {(p) => (
                <Select defaultValue="" {...p}>
                  <option value="" disabled>
                    Choose an area
                  </option>
                  <option>Lacson St</option>
                  <option>Public Plaza</option>
                  <option>Panaad Park</option>
                </Select>
              )}
            </Field>
            <Field label="Post link" error="Paste a full link starting with https://">
              {(p) => <Input type="url" defaultValue="facebook.com/post" {...p} />}
            </Field>
            <Button block icon={<Send className="size-4" />}>
              Send report
            </Button>
          </Card>
        </Section>

        <Section title="Loading and empty">
          <CardSkeleton />
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner /> Checking for updates…
          </p>
          <Card variant="outline">
            <EmptyState icon={Inbox} title="No winners yet" action={<Button size="sm" variant="secondary">Turn on alerts</Button>}>
              Results are posted here as soon as the judges announce them.
            </EmptyState>
          </Card>
        </Section>

        <Section title="Icons">
          <p className="flex items-center gap-3 text-sm text-ink-muted">
            <Sun className="size-5" /> <Moon className="size-5" /> <Monitor className="size-5" /> lucide-react, 20px in navigation, 16px inline,
            14px in badges.
          </p>
        </Section>
      </main>
    </div>
  );
}
