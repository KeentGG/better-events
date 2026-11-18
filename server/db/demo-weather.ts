import "../demoBoot";
import { sql } from "drizzle-orm";
import { BACOLOD, HOURLY_VARIABLES, weatherFromHourly, type OpenMeteoHourly } from "../ingest/weather";
import { createDb } from "./client";
import { weatherSnapshots } from "./schema";

// Usage: DEMO_NOW=2026-10-17T21:00:00+08:00 DATABASE_URL=postgres://…/masskara_demo npx tsx server/db/demo-weather.ts
// Replaces the demo clone's weather with the archive's forecast for the pinned night, so the Weather pill
// and the schedule cards show what was forecast then, not today's weather.
const url = process.env.DATABASE_URL;
const pinned = process.env.DEMO_NOW;
if (!url) throw new Error("DATABASE_URL is not set");
if (!pinned) throw new Error("DEMO_NOW is not set");

const db = createDb(url);
try {
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!row.name.includes("demo")) throw new Error(`refusing to write to "${row.name}": its name does not contain "demo"`);

  const at = Date.now(); // frozen at DEMO_NOW by ../demoBoot
  const query = new URLSearchParams({
    latitude: String(BACOLOD.latitude),
    longitude: String(BACOLOD.longitude),
    start_date: "2026-10-17",
    end_date: "2026-10-20",
    hourly: HOURLY_VARIABLES,
    timezone: BACOLOD.timezone,
    timeformat: "unixtime",
  });
  const res = await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${query}`);
  if (!res.ok) throw new Error(`Open-Meteo historical forecast ${res.status}`);
  const { hourly } = (await res.json()) as { hourly: OpenMeteoHourly };

  // The hour holding the pin supplies the "current" readings; the archive has no current block.
  const data = weatherFromHourly(hourly, at);
  await db.insert(weatherSnapshots).values({ provider: "open-meteo", data, fetchedAt: new Date(at) });
  console.log(`demo weather: ${data.hourly?.length ?? 0} hours, ${data.temperatureC}°C, fetched_at ${data.fetchedAt}`);
} finally {
  await db.$client.end();
}
