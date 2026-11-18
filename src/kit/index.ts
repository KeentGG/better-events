/**
 * The app's own cards, exported as-is for reuse outside it (the portfolio's case study).
 * Everything here is presentational: pass data in, nothing is fetched. Wrap what you render in
 * `.bm-kit` and load kit/kit.css (see kit/README.md), so the app's tokens stay inside that wrapper.
 */
export { NowCard, EventRow, Timeline, phaseOf, type EventPhase } from "../components/Timeline";
export { WeatherChip, WeatherStrip, DayForecast, sceneIcon } from "../components/EventWeather";
export { WeatherScene } from "../craft/WeatherScene";
export { WeaveBand, WeaveRibbon } from "../craft/WeaveBand";
export { Badge, Chip, LiveDot, PreferredBadge, forYouClass, cn } from "../ui";
export { showcaseInterests } from "../lib/interests";
export { forecastFor, type WeatherSlot, type Scene } from "../lib/eventWeather";
export type { ScheduleEvent, WeatherNow, WeatherHour, TopicNode } from "../lib/types";
