import { manilaDay } from "../lib/occurrences";
import type { CrowdArea, FeedItem, ScheduleEvent, TrafficArea, WeatherHour, WeatherNow } from "../lib/types";

// Placeholder content used when the API is not running. Not real announcements.
const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

export const sampleFeed: FeedItem[] = [
  // A range with daily hours: Daily 5:00 PM–2:00 AM until the end day.
  {
    id: "s0",
    category: "activity",
    title: "Booth games at the Plaza every night",
    body: "Sample item. Ring toss and a lucky draw, every night of the festival.",
    area: "Public Plaza",
    startsAt: ago(3 * 24 * 60),
    endsAt: ago(-4 * 24 * 60),
    dailyFrom: 17 * 60,
    dailyTo: 2 * 60,
    publishedAt: ago(3 * 24 * 60),
    source: { name: "Sample official page", tier: 1, platform: "facebook", url: null },
    trust: "official",
    topics: [],
  },
  {
    id: "s1",
    category: "road_closure",
    title: "Lacson St closed from 6th to 21st St for street dance",
    body: "Sample item. Motorists are advised to take Araneta St or the Circumferential Road.",
    area: "Lacson St",
    startsAt: ago(-60),
    endsAt: ago(-360),
    publishedAt: ago(8),
    source: { name: "Sample official page", tier: 1, platform: "facebook", url: null },
    trust: "official",
    topics: [],
  },
  {
    id: "s1b",
    category: "road_closure",
    title: "Closed daily 3:00 PM–3:00 AM: Gonzaga St until Sun 25 Oct",
    body: "Sample item. Shut every night for the Plaza night market.",
    area: "Gonzaga St",
    startsAt: ago(-60 * 24 * 2),
    endsAt: ago(-60 * 24 * 12),
    dailyFrom: 15 * 60,
    dailyTo: 3 * 60,
    publishedAt: ago(8),
    source: { name: "Sample official page", tier: 1, platform: "facebook", url: null },
    trust: "official",
    topics: [],
  },
  {
    id: "s2",
    category: "delay",
    title: "Arena dance competition pushed back 30 minutes",
    body: "Sample item. Gates open at 2:30 PM instead of 2:00 PM.",
    area: "Panaad Park",
    startsAt: ago(-90),
    endsAt: null,
    publishedAt: ago(20),
    source: { name: "Sample official page", tier: 1, platform: "facebook", url: null },
    trust: "official",
    topics: ["competitions"],
  },
  {
    id: "s3",
    category: "traffic_sentiment",
    title: "Heavy traffic reported near the Public Plaza",
    body: "Sample item. 4 reports in the last 30 minutes.",
    area: "Public Plaza",
    startsAt: null,
    endsAt: null,
    publishedAt: ago(12),
    source: { name: "Crowd reports", tier: 4, platform: "crowd", url: null },
    trust: "crowd",
    topics: [],
  },
  {
    id: "s4",
    category: "raffle",
    title: "Sponsor raffle draw tonight at the Government Center",
    body: "Sample item. Drop your entry at any festival kiosk before 7 PM.",
    area: "Bacolod Government Center",
    startsAt: ago(-300),
    endsAt: null,
    publishedAt: ago(55),
    source: { name: "Sample community page", tier: 3, platform: "facebook", url: null },
    trust: "staff",
    topics: ["raffles"],
  },
];

export const sampleTraffic: TrafficArea[] = [
  { area: "Lacson St", level: "closed", reports: 1, updatedAt: ago(8) },
  { area: "Gonzaga St", level: "partial", reports: 1, updatedAt: ago(10) },
  { area: "Public Plaza", level: "heavy", reports: 4, updatedAt: ago(12) },
  { area: "Araneta St", level: "moderate", reports: 2, updatedAt: ago(15) },
  { area: "Mandalagan", level: "clear", reports: 1, updatedAt: ago(30) },
];

export const sampleCrowd: CrowdArea[] = [
  { area: "Public Plaza", level: "packed", note: "Hard to move near the stage", lat: 10.6769, lng: 122.9564, updatedAt: ago(10) },
  { area: "Lacson St", level: "busy", updatedAt: ago(20) },
];

/**
 * A week of made-up Bacolod October weather from the current hour: hot clear mornings, clouds building
 * after noon, showers some afternoons and a thunderstorm the second evening, so every card scene shows.
 */
const sampleHourly: WeatherHour[] = Array.from({ length: 24 * 7 }, (_, i) => {
  const at = Math.floor(now / 3_600_000) * 3_600_000 + i * 3_600_000;
  const hour = (new Date(at).getUTCHours() + 8) % 24;
  const day = Math.floor(i / 24);
  const isDay = hour >= 6 && hour < 18;
  const temperatureC = 25 + 7 * Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const [weatherCode, precipitationProbability, precipitationMm] =
    day === 1 && hour >= 18 && hour < 22 ? [95, 85, 9]
    : day % 2 === 0 && hour >= 14 && hour < 17 ? [hour === 15 ? 65 : 61, 75, hour === 15 ? 5 : 1.5]
    : hour >= 12 && hour < 18 ? [3, 35, 0]
    : hour >= 9 && hour < 12 ? [2, 15, 0]
    : hour >= 4 && hour < 7 ? [hour === 5 ? 45 : 51, 20, 0.2]
    : [0, 5, 0];
  const cloudCover = weatherCode >= 51 ? 85 : weatherCode === 3 ? 90 : weatherCode === 2 ? 45 : weatherCode === 45 ? 100 : 10;
  return { at: new Date(at).toISOString(), temperatureC: Math.round(temperatureC * 10) / 10, precipitationProbability, precipitationMm, weatherCode, isDay, cloudCover };
});

export const sampleWeather: WeatherNow = {
  temperatureC: 30,
  apparentC: 35,
  precipitationProbability: 40,
  weatherCode: 2,
  isDay: true,
  fetchedAt: ago(10),
  hourly: sampleHourly,
};

// Starts are rounded to the half hour so the sample schedule reads like a real one.
const slot = (min: number) => {
  const d = new Date(now + min * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.toISOString();
};

export const sampleSchedule: ScheduleEvent[] = [
  {
    id: "e0",
    title: "Mask-making contest",
    kind: "competition",
    venue: "Public Plaza",
    startsAt: slot(-300),
    endsAt: slot(-180),
    actualEnd: slot(-170),
    status: "done",
    note: null,
    official: true,
    topics: ["competitions"],
    results: {
      contest: "Mask-making contest",
      stage: "corrected",
      postedAt: ago(40),
      rows: [
        { label: "Champion", name: "Brgy Taculing", was: "Brgy 16", prize: "PHP 50,000" },
        { label: "1st runner-up", name: "Brgy 16", was: "Brgy Taculing", prize: "PHP 30,000" },
        { label: "2nd runner-up", name: "Brgy Mandalagan", prize: "PHP 20,000" },
        { label: "Best Costume", name: "Brgy Alijis" },
        { label: "Crowd Favourite", name: "Brgy Villamonte" },
      ],
    },
  },
  { id: "e1", title: "Street dance competition", kind: "parade", venue: "Lacson St", venues: [{ venue: "Lacson St", area: "Lacson St", role: "route" }, { venue: "Bacolod Government Center", area: "Bacolod Government Center", role: "finish" }], startsAt: slot(-60), endsAt: slot(120), status: "on_time", note: null, official: true, topics: ["parades"] },
  // One night of a daily event, as /api/schedule sends it.
  { id: "e1b@sample", seriesId: "e1b", series: { from: manilaDay(now - 2 * 86_400_000), until: manilaDay(now + 3 * 86_400_000) }, title: "Plaza night market", kind: "bazaar", venue: "Public Plaza", startsAt: slot(30), endsAt: slot(360), status: "on_time", note: null, official: false, organiser: "Bacolod Makers Guild", topics: ["food"] },
  { id: "e2", title: "Mask-making workshop for kids", kind: "workshop", venue: "Public Plaza", startsAt: slot(60), endsAt: slot(150), status: "on_time", note: null, official: false, topics: ["workshops"] },
  { id: "e3", title: "Arena dance competition", kind: "competition", venue: "Panaad Park", startsAt: slot(120), endsAt: slot(240), status: "delayed", note: "Gates open 30 minutes later", official: true, topics: ["competitions"] },
  { id: "e4", title: "Food and sugar fair", kind: "food", venue: "Bacolod Government Center", startsAt: slot(180), endsAt: slot(420), status: "on_time", note: null, official: false, topics: ["food"] },
  { id: "e5", title: "Electric MassKara parade", kind: "parade", venue: "Lacson St", startsAt: slot(300), endsAt: slot(420), status: "on_time", note: null, official: true, topics: ["parades"] },
  { id: "e6", title: "Plaza concert night", kind: "concert", venue: "Public Plaza", startsAt: slot(360), endsAt: slot(480), status: "cancelled", note: "Rain forecast", official: true, topics: ["music"] },
  { id: "e7", title: "Mask-making workshop", kind: "workshop", venue: "Public Plaza", startsAt: slot(1440 + 60), endsAt: slot(1440 + 150), status: "on_time", note: null, official: false, topics: ["workshops"] },
  { id: "e8", title: "Barangay street dance finals", kind: "competition", venue: "Panaad Park", startsAt: slot(1440 + 240), endsAt: slot(1440 + 420), status: "on_time", note: null, official: true, topics: ["competitions"] },
  { id: "e9", title: "Awarding ceremony", kind: "ceremony", venue: "Bacolod Government Center", startsAt: slot(1440 + 540), endsAt: null, status: "on_time", note: null, official: true, topics: ["ceremonies"] },
];
