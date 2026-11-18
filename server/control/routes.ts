import { Hono } from "hono";
import { z } from "zod";
import { CATEGORIES, INTAKE_FILTERS, ITEM_STATUSES, MODERATOR_FILTERS, type ControlMe, type ItemActionInput } from "../../src/lib/types";
import type { Db } from "../db/client";
import { getDb, resolveActor, touch, viewerOf, wrote, type Env, type Viewer } from "../shared";
import { runFetcher } from "../ingest/fetchers";
import { applyItemActions, ItemActionError, type Actor } from "../items/actions";
import { buildBoard, buildSources } from "./board";
import { FETCHERS, STALE_MINUTES_RANGE, type FetcherKey } from "./config";
import { buildGraph } from "./graph";
import { buildGroupDetail } from "./groups";
import { addCuratedPost, buildInbox } from "./inbox";
import { setStaleWindow } from "./stale-windows";
import { buildStream } from "./stream";

/**
 * Mission control and the curator inbox (docs/MISSION_CONTROL.md §6), mounted at /api/control. Staff
 * and team members sign in with their own token, ADMIN_TOKEN signs in as "Admin". Team members get a
 * watch-only view of the wall; the moderation routes below are for staff and admin. Responses are
 * `private, no-store` (see app.ts).
 */
type Vars = { db: Db; actor: Actor; viewer: Viewer };
const control = new Hono<{ Bindings: Env; Variables: Vars }>();

control.use("*", async (c, next) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const actor = await resolveActor(database, c.req.header("authorization"), c.env);
  if (!actor) return c.json({ error: "unauthorized" }, 401);
  c.set("db", database);
  c.set("actor", actor);
  c.set("viewer", viewerOf(actor));
  await next();
  await touch(database, actor, { write: wrote(c.req.method, c.res.status) });
});

control.get("/me", (c) => {
  const { name, kind } = c.get("actor");
  return c.json({ name, role: kind } satisfies ControlMe);
});
control.get("/board", async (c) => c.json(await buildBoard(c.get("db"), c.get("viewer"))));
control.get("/sources", async (c) => c.json(await buildSources(c.get("db"))));
const streamQuery = z.object({ filter: z.enum(INTAKE_FILTERS).default("open"), group: z.string().min(1).optional() });

// The intake table (§2.3). The filters that pick rows by their flag are for staff, here and on /graph.
control.get("/stream", async (c) => {
  const q = streamQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: q.error.issues }, 400);
  const viewer = c.get("viewer");
  if (!viewer.moderator && MODERATOR_FILTERS.includes(q.data.filter)) return c.json({ error: "This filter is for staff." }, 403);
  const stream = await buildStream(c.get("db"), { ...q.data, viewer });
  if (!stream) return c.json({ error: "unknown group" }, 404);
  return c.json(stream);
});

// The same rows as a graph of who sent what, what it became, and where and what it is about (§2.3).
control.get("/graph", async (c) => {
  const q = streamQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: q.error.issues }, 400);
  const viewer = c.get("viewer");
  if (!viewer.moderator && MODERATOR_FILTERS.includes(q.data.filter)) return c.json({ error: "This filter is for staff." }, 403);
  const graph = await buildGraph(c.get("db"), { ...q.data, viewer });
  if (!graph) return c.json({ error: "unknown group" }, 404);
  return c.json(graph);
});

// ── Moderation: staff and admin only ────────────────────────────────────────

/**
 * Routes that change items, groups and fetchers, or show what only moderators see. Its middleware
 * refuses team members and narrows the actor to `moderator`, so a route here cannot act as a team
 * member by mistake. Mounted last (at the bottom of this file): Hono runs a sub-app's `*` middleware
 * for every route registered after it, so a route added below the mount would be staff-only too.
 */
const moderation = new Hono<{ Bindings: Env; Variables: Vars & { moderator: Extract<Actor, { kind: "staff" | "admin" }> } }>();

moderation.use("*", async (c, next) => {
  const actor = c.get("actor");
  if (actor.kind === "collector") return c.json({ error: "This is for staff. Team members can post updates and hide their own entries." }, 403);
  c.set("moderator", actor);
  await next();
});

moderation.get("/groups/:key", async (c) => {
  const detail = await buildGroupDetail(c.get("db"), c.req.param("key"));
  if (!detail) return c.json({ error: "unknown group" }, 404);
  return c.json(detail);
});

const staleBody = z.object({ staleMinutes: z.number().int().min(STALE_MINUTES_RANGE.min).max(STALE_MINUTES_RANGE.max) });

moderation.patch("/groups/:key", async (c) => {
  const body = staleBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const row = await setStaleWindow(c.get("db"), c.req.param("key"), body.data.staleMinutes);
  if (!row) return c.json({ error: "unknown group" }, 404);
  return c.json(row);
});

const itemActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["verify", "hide", "unhide", "return_to_review"]) }),
  z.object({ action: z.literal("recategorize"), category: z.enum(CATEGORIES) }),
  z.object({
    action: z.literal("edit"),
    title: z.string().trim().min(1).max(140).optional(),
    body: z.string().max(1000).optional(),
    area: z.string().max(80).nullable().optional(),
  }),
]) satisfies z.ZodType<ItemActionInput>;
const itemActionsBody = z.object({ actions: z.array(itemActionInput).min(1).max(4) });

// Changes to an item (§4.2), applied in order and all or nothing: verify, hide, unhide, return to review,
// recategorize, edit. Each is logged with who did it. The board and the curator inbox both use it.
moderation.post("/items/:id/actions", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "not found" }, 404);
  const body = itemActionsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  try {
    const row = await applyItemActions(c.get("db"), id.data, body.data.actions, c.get("moderator"));
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  } catch (err) {
    if (err instanceof ItemActionError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

const inboxQuery = z.object({ status: z.enum(ITEM_STATUSES).default("needs_review") });

// The curator inbox: items the classifier was unsure about (or any other status), with the original post.
moderation.get("/inbox", async (c) => {
  const q = inboxQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: q.error.issues }, 400);
  return c.json(await buildInbox(c.get("db"), q.data.status));
});

const curatedPost = z.object({
  sourceId: z.uuid().optional(),
  url: z.url().optional(),
  text: z.string().min(1).max(5000),
  postedAt: z.iso.datetime().optional(),
});

// A curator pastes a post by hand; it is classified like any other.
moderation.post("/posts", async (c) => {
  const body = curatedPost.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  return c.json(await addCuratedPost(c.get("db"), body.data, c.get("moderator")), 201);
});

// Run one fetcher now, e.g. after fixing whatever broke it. The run is logged like any other.
moderation.post("/fetchers/:key/retry", async (c) => {
  const key = c.req.param("key");
  if (!Object.hasOwn(FETCHERS, key)) return c.json({ error: "unknown fetcher" }, 404);
  const result = await runFetcher(c.get("db"), key as FetcherKey);
  return c.json({ ok: result !== null });
});

// Keep this last; see `moderation` above.
control.route("/", moderation);

export default control;
