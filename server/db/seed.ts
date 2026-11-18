import { createDb } from "./client";
import { areas } from "./schema";
import { gazetteer } from "../ingest/classify";

// Seeds the Bacolod area gazetteer. Sources (official pages) are added once their page IDs are confirmed;
// mission control groups live in code (server/control/config.ts).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
await db
  .insert(areas)
  .values(gazetteer.map((g) => ({ name: g.name })))
  .onConflictDoNothing();
console.log(`seeded ${gazetteer.length} areas`);
await db.$client.end();
