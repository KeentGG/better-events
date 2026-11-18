import { and, eq, isNull, lt, or } from "drizzle-orm";
import { createDb, type Db } from "./db/client";
import { collectors, staff } from "./db/schema";
import type { Actor } from "./items/actions";

export interface Env {
  DATABASE_URL?: string;
  ADMIN_TOKEN?: string;
  /** Cloudflare Turnstile secret. When set, crowd reports need a valid Turnstile token. */
  TURNSTILE_SECRET?: string;
  /**
   * A connection for this request only. The Worker (server/worker.ts) sets it, because Workers cannot
   * reuse a socket opened by another request; the Node server leaves it unset and shares one pool.
   */
  db?: Db;
}

// One pool per process, for the Node server.
let db: Db | undefined;
export const getDb = (env: Env) => {
  if (env.db) return env.db;
  if (!env.DATABASE_URL) return undefined;
  return (db ??= createDb(env.DATABASE_URL));
};

/** The active team member (collector) a bearer token belongs to. */
export async function findCollector(database: Db, authorization: string | undefined) {
  const token = bearer(authorization);
  if (!token) return undefined;
  const [collector] = await database
    .select()
    .from(collectors)
    .where(and(eq(collectors.tokenHash, await sha256(token)), eq(collectors.active, true)))
    .limit(1);
  return collector;
}

/** The active staff member (mission control) a bearer token belongs to. */
export async function findStaff(database: Db, authorization: string | undefined) {
  const token = bearer(authorization);
  if (!token) return undefined;
  const [member] = await database
    .select()
    .from(staff)
    .where(and(eq(staff.tokenHash, await sha256(token)), eq(staff.active, true)))
    .limit(1);
  return member;
}

/**
 * Who a bearer token belongs to: ADMIN_TOKEN, an active staff member or an active team member
 * (collector), or null. Mission control and the team desk both sign in with it, so each person needs
 * one token for both.
 */
export async function resolveActor(database: Db, authorization: string | undefined, env: Env): Promise<Actor | null> {
  if (env.ADMIN_TOKEN && authorization === `Bearer ${env.ADMIN_TOKEN}`) return { kind: "admin", name: "Admin" };
  const [member, collector] = await Promise.all([findStaff(database, authorization), findCollector(database, authorization)]);
  if (member) return { kind: "staff", id: member.id, name: member.name };
  if (collector) return { kind: "collector", id: collector.id, name: collector.name };
  return null;
}

/**
 * What a signed-in person may see on mission control. Moderators (staff and admin) see flags,
 * conflicts and staff actions; team members get a view built without them, rather than a redacted
 * copy, so a new field is never shown to them by accident.
 */
export interface Viewer {
  moderator: boolean;
  /** Who is looking, to mark their own desk entries. Null for admin, which enters nothing. */
  self: { kind: "staff" | "collector"; id: string } | null;
}

export const viewerOf = (actor: Actor): Viewer => ({
  moderator: actor.kind !== "collector",
  self: actor.kind === "admin" ? null : { kind: actor.kind, id: actor.id },
});

/** Staff last-seen is written at most this often, since the board polls every 30 seconds. */
const SEEN_EVERY_MS = 60_000;

/**
 * Records that someone was here. Staff count on any request (throttled). Team members only count when
 * they entered something (`write`: a successful POST, PUT, PATCH or DELETE), which is what "active"
 * means on the sources panel (docs/MISSION_CONTROL.md §4.5). Admin has no row to touch.
 */
export async function touch(database: Db, actor: Actor, { write }: { write: boolean }) {
  const now = new Date();
  if (actor.kind === "staff") {
    await database
      .update(staff)
      .set({ lastSeenAt: now })
      .where(and(eq(staff.id, actor.id), or(isNull(staff.lastSeenAt), lt(staff.lastSeenAt, new Date(now.getTime() - SEEN_EVERY_MS)))));
  } else if (actor.kind === "collector" && write) {
    await database.update(collectors).set({ lastSeenAt: now }).where(eq(collectors.id, actor.id));
  }
}

/** Whether a response means something was written, for `touch`. */
export const wrote = (method: string, status: number) => method !== "GET" && method !== "HEAD" && status < 400;

const bearer = (authorization: string | undefined) => authorization?.replace(/^Bearer /, "") || undefined;

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The caller's address, as Cloudflare or a proxy reports it. Only ever stored hashed. */
export const clientIp = (headers: Headers) => headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

/** Checks a Cloudflare Turnstile token, for the forms anyone can send. */
export async function verifyTurnstile(secret: string, token: string | undefined, ip: string) {
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }).catch(() => undefined);
  const result = (await res?.json().catch(() => undefined)) as { success?: boolean } | undefined;
  return result?.success === true;
}
