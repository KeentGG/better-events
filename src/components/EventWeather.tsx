import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudRainWind, CloudSun, Droplet, type LucideIcon, Moon, Sun } from "lucide-react";
import { adviceFor, dayOutlook, type Scene, sceneLabel, type WeatherSlot } from "../lib/eventWeather";
import { dayKey, hourLabel } from "../lib/time";
import { WeatherScene } from "../craft/WeatherScene";
import { cn } from "../ui";

export function sceneIcon(scene: Scene, isDay: boolean): LucideIcon {
  if (scene === "clear") return isDay ? Sun : Moon;
  if (scene === "partly") return isDay ? CloudSun : CloudMoon;
  return { cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, downpour: CloudRainWind, storm: CloudLightning }[scene];
}

/** The sky in words, over the WeatherScene: "Forecast at 8 PM: Rain · 27°, feels 33° · 70% rain". It is a forecast even for the hour we're in. */
export function WeatherChip({ slot, live }: { slot: WeatherSlot; live: boolean }) {
  const Icon = sceneIcon(slot.scene, slot.isDay);
  const when = live ? "Forecast for now" : `Forecast at ${hourLabel(slot.at)}`;
  const temp = Math.round(slot.temperatureC);
  const feels = Math.round(slot.apparentC ?? slot.temperatureC);
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>
        <span className="text-ink-muted">{when}:</span> {sceneLabel[slot.scene]} · {temp}°
        {feels - temp >= 3 && `, feels ${feels}°`}
        {slot.thunder && slot.scene !== "storm" ? " · thunder nearby" : slot.precipitationProbability >= 20 && ` · ${slot.precipitationProbability}% rain`}
      </span>
    </p>
  );
}

/**
 * The weather for an event with a date but no time, as one plain line: "Rest of today: rain likely, 25–27°"
 * or "Sat daytime: showers possible, 26–31°". No animated sky, since there's no hour to draw.
 */
export function DayForecast({ slot, lowC }: { slot: WeatherSlot; lowC: number }) {
  const Icon = sceneIcon(slot.scene, true);
  const today = dayKey(slot.at) === dayKey(new Date().toISOString());
  const day = new Date(slot.at).toLocaleDateString("en-PH", { weekday: "short", timeZone: "Asia/Manila" });
  const low = Math.round(lowC);
  const high = Math.round(slot.temperatureC);
  return (
    <p className="flex items-center gap-1.5 text-sm text-ink-muted">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-ink">{today ? "Rest of today" : `${day} daytime`}:</span> {dayOutlook(slot)}, {low === high ? `${high}°` : `${low}–${high}°`}
      </span>
    </p>
  );
}

/**
 * The forecast from start to end, one slot per hour (or per few hours on a long event), each with its
 * own little animated sky, and a line of advice under it. The slot we're in reads "Now".
 */
export function WeatherStrip({ slots, now = Date.now() }: { slots: WeatherSlot[]; now?: number }) {
  return (
    <figure className="space-y-1.5 pt-1">
      {/* An hour or two left: kept to a hand's width instead of one hour stretched across the card. */}
      <ol
        className="grid gap-px overflow-hidden rounded-control border border-line bg-line"
        style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))`, maxWidth: slots.length <= 2 ? `${slots.length * 5.5}rem` : undefined }}
      >
        {slots.map((s, i) => {
          const from = Date.parse(s.at);
          const current = now >= from && now < from + s.hours * 3_600_000;
          // Sunny hours draw the sun and clouds on the card itself; the rest, nights included, get their own full sky and light text, which on-sky shadows.
          const fair = s.isDay && (s.scene === "clear" || s.scene === "partly");
          return (
            <li key={s.at} className={cn("relative isolate flex h-16 flex-col items-center justify-between overflow-hidden bg-surface-raised px-0.5 pt-1 text-center", !fair && "on-sky [text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_0_6px_rgb(0_0_0/0.35)]")}>
              <WeatherScene scene={s.scene} isDay={s.isDay} cloudCover={s.cloudCover} rainMm={s.precipitationMm} at={s.at} transparent={fair} className="absolute inset-0 -z-10 size-full" />
              <span className={cn("text-[0.6875rem] leading-none whitespace-nowrap tabular-nums", current ? "font-semibold text-accent-ink" : "text-ink-muted")}>{current ? "Now" : hourLabel(s.at)}</span>
              <span className="sr-only">{sceneLabel[s.scene]}</span>
              <span className="flex flex-col items-center pb-1">
                <span className="text-xs font-semibold tabular-nums">{Math.round(s.temperatureC)}°</span>
                <span className="flex items-center gap-0.5 text-[0.6875rem] leading-none text-ink-muted tabular-nums">
                  {s.precipitationProbability >= 20 ? (
                    <>
                      <Droplet className="size-2.5" aria-hidden />
                      {s.precipitationProbability}%<span className="sr-only"> chance of rain</span>
                    </>
                  ) : (
                    "\u00a0"
                  )}
                </span>
              </span>
              {/* Rounded only where the strip is: its two ends. */}
              {current && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 border-2 border-accent",
                    i === 0 && "rounded-l-[calc(var(--radius-control)-1px)]",
                    i === slots.length - 1 && "rounded-r-[calc(var(--radius-control)-1px)]",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <figcaption className="text-sm text-ink-muted">{adviceFor(slots, hourLabel)}</figcaption>
    </figure>
  );
}
