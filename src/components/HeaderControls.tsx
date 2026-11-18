import { AlertTriangle, Droplets, Moon, Sun } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WeatherScene } from "../craft/WeatherScene";
import { adviceFor, hoursAhead, sceneLabel, sceneOf, sceneOfHour } from "../lib/eventWeather";
import { skyLook } from "../lib/sky";
import { hourLabel } from "../lib/time";
import { onNow } from "../lib/dailyWindow";
import type { FeedItem, WeatherNow } from "../lib/types";
import { cn, IconButton, useResolvedTheme, useTheme } from "../ui";
import { sceneIcon, WeatherStrip } from "./EventWeather";

/**
 * A panel that opens under a header button, in a portal so the header can clip its own content while it
 * shrinks. It closes on a click away, Escape, a scroll or a resize.
 */
export function useAnchored<B extends HTMLElement>(width: number) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<B>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = at !== null;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && setAt(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    const close = () => setAt(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setAt(null);
    const r = button.current!.getBoundingClientRect();
    setAt({ left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)), top: r.bottom + 8 });
  };
  return { at, open, toggle, close: () => setAt(null), button: button as RefObject<B>, panel };
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const isDark = useResolvedTheme(theme) === "dark";
  return (
    <IconButton
      label={isDark ? "Switch to day theme" : "Switch to night theme"}
      variant="secondary"
      size="sm"
      className="rounded-chip border-line"
      icon={isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    />
  );
}

/** The newest weather notice the team has up that has started, for a warning beside the weather. The feed already drops ended ones. */
export function weatherWarning(feed: FeedItem[] | undefined, now = Date.now()) {
  return feed?.find((i) => i.category === "weather" && onNow(i, now));
}

/**
 * The weather now as a pill wearing the live sky, the same one the schedule's cards draw. It opens the
 * next few hours, with a line of advice and any weather warning the team has up.
 */
export function WeatherPill({ weather, warning }: { weather: WeatherNow; warning?: FeedItem }) {
  const { at, open, toggle, button, panel } = useAnchored<HTMLButtonElement>(320);
  // The hour we're in when the forecast has it, so the pill rains only when the cards do.
  const hour = weather.hourly?.[0];
  const sky = { scene: hour ? sceneOfHour(hour) : sceneOf(weather.weatherCode), isDay: hour?.isDay ?? weather.isDay, cloudCover: hour?.cloudCover, rainMm: hour?.precipitationMm, at: hour?.at ?? weather.fetchedAt };
  const Icon = sceneIcon(sky.scene, sky.isDay);
  const temp = Math.round(weather.temperatureC);
  const ahead = hoursAhead(weather, 6);
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${sceneLabel[sky.scene]}, ${temp} degrees, ${weather.precipitationProbability}% chance of rain${warning ? `. Weather warning: ${warning.title}` : ""}. Show the next hours`}
        className={cn(
          "relative isolate flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-chip px-3 text-sm shadow-card transition hover:brightness-110 active:scale-[0.97]",
          skyLook(sky).hour === "sunset" ? "on-sunset" : "on-sky",
        )}
      >
        <WeatherScene {...sky} className="absolute inset-0 -z-10 size-full" />
        {warning && <AlertTriangle className="size-4 text-warn-ink" aria-hidden />}
        <Icon className="size-4" aria-hidden />
        <span className="font-semibold tabular-nums">{temp}°</span>
        <span className="weather-rain flex items-center gap-0.5 text-ink-muted tabular-nums">
          <Droplets className="size-3.5" aria-hidden />
          {weather.precipitationProbability}%
        </span>
      </button>
      {at &&
        createPortal(
          <div ref={panel} style={at} className="fixed z-50 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-card border border-line bg-surface-raised p-3 text-ink shadow-overlay">
            <p className="text-sm">
              <span className="font-semibold">{sceneLabel[sky.scene]} now</span>
              <span className="text-ink-muted">
                {" "}
                · {temp}°, feels {Math.round(weather.apparentC)}° · {weather.precipitationProbability}% rain
              </span>
            </p>
            {warning && (
              <p className="flex items-start gap-1.5 rounded-control bg-warn-soft px-2.5 py-2 text-sm font-medium text-warn-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {warning.title}
              </p>
            )}
            {ahead.length > 1 ? <WeatherStrip slots={ahead} /> : <p className="text-sm text-ink-muted">{ahead.length ? adviceFor(ahead, hourLabel) : "No hourly forecast yet."}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
