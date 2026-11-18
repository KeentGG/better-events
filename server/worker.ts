import type { ExecutionContext } from "hono";
import app from "./app";
import { createDb } from "./db/client";
import { runIngest } from "./ingest/run";
import { isIngestDue } from "./ingest/scheduler";
import type { Env } from "./shared";

/** The part of Cloudflare's ScheduledController this entry reads. */
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

/**
 * Cloudflare Workers entry (wrangler.toml). A Worker cannot reuse a socket another request opened,
 * so every request and every cron run gets its own connection, closed once the work is done.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!env.DATABASE_URL) return app.fetch(request, env, ctx);
    const db = createDb(env.DATABASE_URL);
    try {
      return await app.fetch(request, { ...env, db }, ctx);
    } finally {
      ctx.waitUntil(db.$client.end({ timeout: 5 }));
    }
  },

  // The cron in wrangler.toml. It still asks whether a pass is due, in case a Node server shares the database.
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (!env.DATABASE_URL) return console.error(`cron ${controller.cron}: DATABASE_URL is not set`);
    const db = createDb(env.DATABASE_URL);
    const pass = async () => {
      try {
        if (await isIngestDue(db)) console.log(await runIngest(db));
        else console.log("ingest pass not due, skipped");
      } finally {
        await db.$client.end({ timeout: 5 });
      }
    };
    ctx.waitUntil(pass());
  },
};
