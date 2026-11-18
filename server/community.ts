import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { crowdLabel, crowdTooOld } from "../src/lib/crowd";
import type { CommunitySubmission } from "../src/lib/types";
import type { Db } from "./db/client";
import { events, places, placeKinds, submissions, topics } from "./db/schema";
import type { Actor } from "./items/actions";
import { tierField } from "./items/announce";
import { clientIp, getDb, resolveActor, sha256, verifyTurnstile, type Env } from "./shared";
import team, { eventBody, listEvents, recentResults, listGuide, listPlaces, placeBody, tipBody, update } from "./team";

/**
 * The Contribute page: visitors fill in the same forms as the team desk, and each one arrives here as a
 * suggestion instead of a desk write. A suggestion is the desk request it would have been (method, path,
 * body), checked against the desk's own schemas and stored. Nothing on the site changes until someone on
 * the team approves it, and approving sends that request to the desk under the approver's own sign-in,
 * so the desk's rules, roles and bylines apply exactly as if they had typed it.
 *
 * Open to anyone: POST /submissions and the lists the forms pick from (GET /read/…).
 * Team only: everything under /review.
 */
const community = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

community.use("*", async (c, next) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  c.set("db", database);
  await next();
});

// What the forms pick from. The desk's own lists need a token, so these serve the public parts of them.

community.get("/read/events", async (c) => c.json((await listEvents(c.get("db"))).map(({ sourceNote: _team, ...e }) => e)));
// Who posted a version is for the team; readers of the form only need what it says.
community.get("/read/results", async (c) => c.json((await recentResults(c.get("db"))).map(({ byName: _by, ...r }) => r)));
community.get("/read/places", async (c) => c.json(await listPlaces(c.get("db"), true)));
community.get("/read/place-kinds", async (c) => {
  const rows = await c.get("db").select().from(placeKinds).orderBy(placeKinds.name);
  return c.json(rows.map((k) => ({ key: k.key, name: k.name, plural: k.plural, icon: k.icon, services: k.services, aliases: k.aliases })));
});
community.get("/read/topics", async (c) => {
  const rows = await c.get("db").select().from(topics).where(eq(topics.hidden, false)).orderBy(topics.order, topics.name);
  return c.json(rows.map((t) => ({ key: t.key, parentKey: t.parentKey, name: t.name, aliases: t.aliases, icon: t.icon, hidden: t.hidden, order: t.order })));
});
community.get("/read/guide", async (c) => {
  const sections = await listGuide(c.get("db"));
  return c.json(sections.filter((s) => s.active).map((s) => ({ ...s, tips: s.tips.filter((t) => t.active) })));
});

/**
 * The desk writes a visitor may suggest, and the desk's schema for each. Anything else is refused:
 * adding areas, kinds or topics (they would exist before anyone looked), the guide's structure, and
 * hiding or changing what is already published.
 */
const WRITES: Array<{ method: string; path: RegExp; schema: z.ZodType; label: (body: never) => string }> = [
  { method: "POST", path: /^\/updates$/, schema: update, label: (u: z.infer<typeof update>) => updateLabel(u) },
  { method: "POST", path: /^\/events$/, schema: eventBody, label: (e: z.infer<typeof eventBody>) => `New event: ${e.title}` },
  { method: "PUT", path: /^\/events\/[0-9a-f-]{36}$/, schema: eventBody, label: (e: z.infer<typeof eventBody>) => `Fix event: ${e.title}` },
  { method: "DELETE", path: /^\/events\/[0-9a-f-]{36}$/, schema: z.undefined(), label: () => "Remove an event" },
  { method: "POST", path: /^\/places$/, schema: placeBody, label: (p: z.infer<typeof placeBody>) => `New place: ${p.title}` },
  { method: "PUT", path: /^\/places\/[0-9a-f-]{36}$/, schema: placeBody, label: (p: z.infer<typeof placeBody>) => `Fix place: ${p.title}` },
  { method: "POST", path: /^\/guide\/tips$/, schema: tipBody, label: (t: z.infer<typeof tipBody>) => `New tip: ${t.title}` },
];

function updateLabel(u: z.infer<typeof update>) {
  switch (u.type) {
    case "advisory":
      return `Traffic advisory: ${u.areas.join(", ")}`;
    case "traffic":
      return `${u.level === "closed" ? (u.extent === "partial" ? "Road partly closed" : "Road closed") : `Traffic ${u.level}`}: ${u.areas.join(", ")}`;
    case "crowd":
      return `Crowd: ${u.areas.join(", ")} ${crowdLabel[u.level].toLowerCase()}`;
    case "event":
      return `Event change (${u.change.replace("_", " ")})`;
    case "winners":
      return `${{ standings: "Standings", corrected: "Results corrected", revised: "Results revised" }[u.stage as string] ?? "Winners"}: ${u.contest}`;
    case "notice":
      return `${u.category.replace(/_/g, " ")}: ${u.title ?? (u.text ?? "").split("\n")[0]}`;
  }
}

/**
 * Whether a desk write may be suggested, and what to store for it: the body as the desk's schema read
 * it (so nothing the desk doesn't know about rides along) and a line for the review list.
 */
export function planSubmission(method: string, path: string, sent: unknown): { error: unknown; status: 400 | 403 } | { body: unknown; summary: string } {
  const write = WRITES.find((w) => w.method === method && w.path.test(path));
  if (!write) return { error: "That can't be suggested here.", status: 403 };
  // A visitor can't ask for a pin or a banner; whoever approves decides how loud it is.
  const { tier: _loud, ...quiet } = typeof sent === "object" && sent !== null && !Array.isArray(sent) ? (sent as Record<string, unknown>) : {};
  const body = write.schema.safeParse(typeof sent === "object" && sent !== null && !Array.isArray(sent) ? quiet : sent);
  if (!body.success) return { error: body.error.issues, status: 400 };
  // A removal carries no body.
  return { body: body.data ?? {}, summary: (write.label as (b: unknown) => string)(body.data).slice(0, 200) };
}

/** A crowd level goes stale in under an hour, so one sent long ago can be turned down but not posted. */
export function staleCrowd(method: string, path: string, body: unknown, sentAt: Date, now: Date): string | null {
  const crowd = method === "POST" && path === "/updates" && (body as { type?: unknown } | null)?.type === "crowd";
  return crowd && crowdTooOld(sentAt, now) ? "This crowd report is too old to post. Crowds change fast, so turn it down instead." : null;
}

const submission = z.object({
  method: z.enum(["POST", "PUT", "DELETE"]),
  path: z.string().max(120),
  body: z.unknown().optional(),
  turnstileToken: z.string().max(2048).optional(),
});

// Per device (hashed IP), counted in the database so the limits hold across Worker isolates.
const LIMIT = 6;
const WINDOW_MS = 10 * 60_000;
const DAILY_LIMIT = 40;
/** Past this many waiting, new ones are refused, so a flood can't bury what the team still has to read. */
const QUEUE_LIMIT = 400;
const BODY_LIMIT = 8_000;

community.post("/submissions", async (c) => {
  const db = c.get("db");
  const raw = await c.req.text();
  if (raw.length > BODY_LIMIT) return c.json({ error: "That's too long to send. Shorten it and try again." }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Falls through to the schema error.
  }
  const sent = submission.safeParse(json);
  if (!sent.success) return c.json({ error: sent.error.issues }, 400);

  const plan = planSubmission(sent.data.method, sent.data.path, sent.data.body);
  if ("error" in plan) return c.json({ error: plan.error }, plan.status);

  const ip = clientIp(c.req.raw.headers);
  if (c.env.TURNSTILE_SECRET && !(await verifyTurnstile(c.env.TURNSTILE_SECRET, sent.data.turnstileToken, ip))) {
    return c.json({ error: "We couldn't confirm you're a person. Reload the page and try again." }, 403);
  }
  const ipHash = await sha256(ip);
  const since = (ms: number) => db.select({ n: count() }).from(submissions).where(and(eq(submissions.ipHash, ipHash), gte(submissions.createdAt, new Date(Date.now() - ms))));
  const [[recent], [today], [waiting]] = await Promise.all([
    since(WINDOW_MS),
    since(24 * 3_600_000),
    db.select({ n: count() }).from(submissions).where(eq(submissions.status, "pending")),
  ]);
  if (recent.n >= LIMIT || today.n >= DAILY_LIMIT) {
    c.header("Retry-After", String(WINDOW_MS / 1000));
    return c.json({ error: "That's a lot at once. Give the team a few minutes to catch up, then send more." }, 429);
  }
  if (waiting.n >= QUEUE_LIMIT) return c.json({ error: "The team has a lot to review right now. Try again later." }, 429);

  const [row] = await db
    .insert(submissions)
    .values({ method: sent.data.method, path: sent.data.path, body: plan.body, summary: plan.summary, ipHash })
    .returning({ id: submissions.id });
  return c.json({ id: row.id, title: plan.summary }, 201);
});

// Review, for the team.

type Reviewer = Extract<Actor, { kind: "staff" | "collector" }>;

async function reviewer(db: Db, authorization: string | undefined, env: Env, write: boolean): Promise<Actor | Response> {
  const actor = await resolveActor(db, authorization, env);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (write && actor.kind === "admin") {
    return Response.json({ error: "Sign in with your own token to review, so entries show who approved them." }, { status: 403 });
  }
  return actor;
}

/** What a suggestion is about, for the ones that only carry an id: the event or place as it stands now. */
async function subjects(db: Db, rows: Array<{ path: string; body: unknown }>) {
  const idOf = (r: { path: string; body: unknown }) => r.path.match(/^\/(events|places)\/([0-9a-f-]{36})$/)?.[2] ?? (r.body as { eventId?: string } | null)?.eventId;
  const ids = [...new Set(rows.flatMap((r) => idOf(r) ?? []))];
  if (!ids.length) return (_: { path: string; body: unknown }) => null;
  const [evs, pls] = await Promise.all([
    db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, ids)),
    db.select({ id: places.id, title: places.name }).from(places).where(inArray(places.id, ids)),
  ]);
  const titles = new Map([...evs, ...pls].map((r) => [r.id, r.title]));
  return (r: { path: string; body: unknown }) => {
    const id = idOf(r);
    return id ? (titles.get(id) ?? "(no longer listed)") : null;
  };
}

community.get("/review", async (c) => {
  const db = c.get("db");
  const actor = await reviewer(db, c.req.header("authorization"), c.env, false);
  if (actor instanceof Response) return actor;
  const status = z.enum(["pending", "approved", "rejected"]).catch("pending").parse(c.req.query("status"));
  const rows = await db.select().from(submissions).where(eq(submissions.status, status)).orderBy(desc(submissions.createdAt)).limit(200);
  const about = await subjects(db, rows);
  // How many each sender has waiting, so a flood from one device is easy to spot. The hash itself stays here.
  const perSender = new Map<string, number>();
  for (const r of rows) perSender.set(r.ipHash, (perSender.get(r.ipHash) ?? 0) + 1);
  return c.json(
    rows.map(
      (r): CommunitySubmission => ({
        id: r.id,
        summary: r.summary,
        method: r.method,
        path: r.path,
        body: r.body,
        about: about(r),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedBy: r.reviewedByName,
        reason: r.reason,
        sender: r.ipHash.slice(0, 6),
        fromSender: perSender.get(r.ipHash) ?? 1,
      }),
    ),
  );
});

const reviewedBy = (a: Reviewer) => ({
  reviewedAt: new Date(),
  reviewedByStaffId: a.kind === "staff" ? a.id : null,
  reviewedByCollectorId: a.kind === "collector" ? a.id : null,
  reviewedByName: a.name,
});

community.post("/review/:id/approve", async (c) => {
  const db = c.get("db");
  const authorization = c.req.header("authorization");
  const actor = await reviewer(db, authorization, c.env, true);
  if (actor instanceof Response) return actor;
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "not found" }, 404);
  // How loud it goes up is the reviewer's call, never the visitor's: a tier, and the end a pin or banner needs.
  const loud = z.object({ tier: tierField, endsAt: z.iso.datetime({ offset: true }).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!loud.success) return c.json({ error: loud.error.issues }, 400);

  // Checked before claiming it, so a stale one stays in the queue to be turned down.
  const [waiting] = await db.select().from(submissions).where(and(eq(submissions.id, id.data), eq(submissions.status, "pending")));
  const tooOld = waiting && staleCrowd(waiting.method, waiting.path, waiting.body, waiting.createdAt, new Date());
  if (tooOld) return c.json({ error: tooOld }, 422);
  if (waiting && loud.data.tier && !(waiting.method === "POST" && waiting.path === "/updates")) {
    return c.json({ error: "Only updates can be pinned or made a banner." }, 400);
  }

  // Claimed first, so two people approving at once send it to the desk once.
  const [row] = await db
    .update(submissions)
    .set({ status: "approved", reason: null, ...reviewedBy(actor as Reviewer), ...(waiting && loud.data.tier && { body: { ...(waiting.body as object), tier: loud.data.tier, ...(loud.data.endsAt && { endsAt: loud.data.endsAt }) } }) })
    .where(and(eq(submissions.id, id.data), eq(submissions.status, "pending")))
    .returning();
  if (!row) return c.json({ error: "Someone already reviewed this one." }, 409);

  // The desk does the work, as the approver: its checks, its roles, their name on what gets published.
  const res = await team.request(
    row.path,
    {
      method: row.method,
      headers: { authorization: authorization!, ...(row.method !== "DELETE" && { "content-type": "application/json" }) },
      body: row.method === "DELETE" ? undefined : JSON.stringify(row.body),
    },
    c.env,
  );
  const data = (await res.json().catch(() => null)) as { error?: unknown; title?: string } | null;
  if (!res.ok) {
    const reason = typeof data?.error === "string" ? data.error : "The desk didn't accept it as written. It may be out of date.";
    // Back in the queue with what went wrong, to turn down or try again once it's sorted.
    await db.update(submissions).set({ status: "pending", reason, ...(waiting && { body: waiting.body }), reviewedAt: null, reviewedByStaffId: null, reviewedByCollectorId: null, reviewedByName: null }).where(eq(submissions.id, row.id));
    return c.json({ error: reason }, 422);
  }
  return c.json({ ok: true, title: data?.title ?? row.summary });
});

community.post("/review/:id/reject", async (c) => {
  const db = c.get("db");
  const actor = await reviewer(db, c.req.header("authorization"), c.env, true);
  if (actor instanceof Response) return actor;
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = z.object({ reason: z.string().trim().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const [row] = await db
    .update(submissions)
    .set({ status: "rejected", reason: body.data.reason ?? null, ...reviewedBy(actor as Reviewer) })
    .where(and(eq(submissions.id, id.data), eq(submissions.status, "pending")))
    .returning({ id: submissions.id });
  if (!row) return c.json({ error: "Someone already reviewed this one." }, 409);
  return c.json({ ok: true });
});

export default community;
