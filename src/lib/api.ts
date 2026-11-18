import { sampleAround, sampleTips, sampleVisit } from "../data/guide";
import { sampleCrowd, sampleFeed, sampleSchedule, sampleTraffic, sampleWeather } from "../data/sample";
import type { AroundPlace, CrowdArea, FeedItem, FeedTop, ScheduleEvent, Tip, TrafficArea, VisitSection, WeatherNow } from "./types";
import { demoNow } from "./demoBoot";
import { atOrBefore } from "./demoClock";

async function get<T>(path: string, fallback: T): Promise<{ data: T; live: boolean }> {
  try {
    const res = await fetch(path, { headers: { accept: "application/json" } });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) throw new Error(String(res.status));
    return { data: (await res.json()) as T, live: true };
  } catch (err) {
    // Samples are for the local dev server with no API. In production a failure is a real failure.
    if (import.meta.env.DEV) return { data: fallback, live: false };
    throw err;
  }
}

export const api = {
  feed: async () => {
    const result = await get<FeedItem[]>("/api/feed", sampleFeed);
    // A demo build shows the feed as it stood at the pin: everything published later is dropped before
    // any view or count reads it. With VITE_DEMO_NOW unset, the list is returned untouched.
    if (!demoNow) return result;
    const pin = demoNow;
    return { ...result, data: result.data.filter((item) => atOrBefore(item.publishedAt, pin)) };
  },
  // The hero banner and pins; the sample has none.
  feedTop: async () => {
    const result = await get<FeedTop>("/api/feed/top", { hero: null, pins: [] });
    if (!demoNow) return result;
    const pin = demoNow;
    const { hero, pins } = result.data;
    return { ...result, data: { ...result.data, hero: hero && atOrBefore(hero.publishedAt, pin) ? hero : null, pins: pins.filter((item) => atOrBefore(item.publishedAt, pin)) } };
  },
  traffic: () => get<TrafficArea[]>("/api/traffic", sampleTraffic),
  crowd: () => get<CrowdArea[]>("/api/crowd", sampleCrowd),
  weather: () => get<WeatherNow>("/api/weather", sampleWeather),
  // Schedule and Around come from the team desk; the samples show when the API is not running.
  schedule: () => get<ScheduleEvent[]>("/api/schedule", sampleSchedule),
  around: () => get<AroundPlace[]>("/api/around", sampleAround),
  // The visitor guide comes from the team desk too.
  tips: () => get<Tip[]>("/api/tips", sampleTips),
  visit: () => get<VisitSection[]>("/api/visit", sampleVisit),
};
