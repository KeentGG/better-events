import "./demoBoot";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import app from "./app";
import { runIngest } from "./ingest/run";
import { isIngestDue, startIngestTimer } from "./ingest/scheduler";
import { getDb, type Env } from "./shared";

// Local development and self-hosting. On Cloudflare Workers the entry is server/worker.ts.
const env: Env = { DATABASE_URL: process.env.DATABASE_URL, ADMIN_TOKEN: process.env.ADMIN_TOKEN, TURNSTILE_SECRET: process.env.TURNSTILE_SECRET };
const port = Number(process.env.PORT ?? 8787);
// Localhost by default. In the production container HOST=0.0.0.0, published only on the VPS's 127.0.0.1, and the
// host Caddy is the only way in. Caddy rewrites cf-connecting-ip from the client IP, which it believes only from
// Cloudflare's ranges, so the header cannot be forged.
const hostname = process.env.HOST ?? "127.0.0.1";
// Demo mode serves a pinned, frozen copy of the site. Nothing may be written to it, and no ingest run.
const demo = Boolean(process.env.DEMO_NOW);

// STATIC_DIR serves the built site from the same process (the container has no Caddy in front of it).
const staticDir = process.env.STATIC_DIR;
const site = new Hono();
if (staticDir) {
  site.use("*", async (c, next) => {
    await next();
    c.header("Strict-Transport-Security", "max-age=31536000");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-Frame-Options", "SAMEORIGIN");
  });
}
if (demo) {
  // The demo is a snapshot: reads still work (team and control sign in with a bearer token on a GET),
  // but nothing may be saved to the clone. No sign-in flow posts, so no route needs an exception.
  site.use("/api/*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    return c.json({ error: "This is a demo, so nothing is saved." }, 403);
  });
}
site.all("/api/*", (c) => app.fetch(c.req.raw, env));
if (staticDir) {
  site.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  site.use("*", serveStatic({ root: staticDir }));
  site.get("/assets/*", (c) => c.notFound());
  // Anything else is a client-side route.
  site.get("*", serveStatic({ root: staticDir, path: "index.html", onFound: (_, c) => c.header("Cache-Control", "no-cache") }));
}
serve({ fetch: site.fetch, port, hostname });
console.log(`API on http://localhost:${port}/api`);

// The ingest pass, in process. Set INGEST_TIMER=off when something else runs it (a cron, another server).
const db = getDb(env);
if (demo) console.log(`Demo mode: clock pinned to ${process.env.DEMO_NOW}, ingest off, /api read-only`);
else if (db && process.env.INGEST_TIMER !== "off") {
  startIngestTimer({ run: () => runIngest(db), isDue: () => isIngestDue(db), everyMs: 60_000 });
  console.log("Ingest timer on (INGEST_TIMER=off to disable)");
}
