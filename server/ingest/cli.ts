import { createDb } from "../db/client";
import { runIngest } from "./run";

// `npm run ingest`: one pass now, whether or not one is due.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
try {
  console.log(await runIngest(db));
} finally {
  await db.$client.end();
}
