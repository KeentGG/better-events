import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import app from "./app";
import { createDb, type Db } from "./db/client";
import { collectors } from "./db/schema";
import { checkedLine, laneIsStale } from "./control/lanes";
import type { ControlBoard } from "../src/lib/types";

// A team member's token signs in without a database lookup. Writes don't touch last-seen.
vi.mock("./shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared")>();
  return {
    ...actual,
    resolveActor: (...args: Parameters<typeof actual.resolveActor>) =>
      args[1] === "Bearer team-token"
        ? Promise.resolve({ kind: "collector" as const, id: "00000000-0000-4000-8000-0000000000c1", name: "Juan" })
        : actual.resolveActor(...args),
    touch: () => Promise.resolve(),
  };
});

const COLLECTOR = "00000000-0000-4000-8000-0000000000c1";
const offline = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" };

const post = (path: string, body?: unknown, token?: string) =>
  app.request(
    path,
    {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    offline,
  );

describe("lane check auth and validation", () => {
  it("requires a token", async () => {
    expect((await post("/api/team/lanes/winners/checked", {})).status).toBe(401);
  });

  it("rejects an unknown lane and lists the real ids", async () => {
    const res = await post("/api/team/lanes/not-a-lane/checked", {}, "team-token");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; lanes: string[] };
    expect(body.error).toMatch(/Unknown lane/);
    expect(body.lanes).toContain("traffic");
    expect(body.lanes).toContain("winners");
    expect(body.lanes).not.toContain("not-a-lane");
  });

  it("rejects a check dated in the future", async () => {
    const res = await post("/api/team/lanes/winners/checked", { checkedAt: "2099-01-01T00:00:00.000Z" }, "team-token");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/future/);
  });
});

describe("lane freshness", () => {
  const now = new Date("2026-10-08T08:00:00.000Z");

  it("treats a check inside the window as fresh and one outside it as stale", () => {
    expect(laneIsStale(new Date("2026-10-08T07:10:00.000Z").toISOString(), 60, now)).toBe(false);
    expect(laneIsStale(new Date("2026-10-08T06:00:00.000Z").toISOString(), 60, now)).toBe(true);
    expect(laneIsStale(null, 60, now)).toBe(true);
  });

  it("says nothing new, and keeps the note for the tile", () => {
    expect(checkedLine(null, [])).toBe("Checked, nothing new");
    expect(checkedLine("hunted, none sourced yet", ["city page"])).toBe("Checked, nothing new — hunted, none sourced yet · city page");
  });
});

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

class Rollback extends Error {}
async function inTx(run: (tx: Db) => Promise<void>) {
  await db!
    .transaction(async (tx) => {
      await run(tx as unknown as Db);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

describe.skipIf(!db)("lane check against the database", () => {
  const envOf = (tx: Db) => ({ db: tx, DATABASE_URL: url, ADMIN_TOKEN: "admin-secret" });

  it("resets staleness and posts no feed item", () =>
    inTx(async (tx) => {
      await tx.insert(collectors).values({ id: COLLECTOR, name: "Juan", tokenHash: randomBytes(16).toString("hex") });
      const note = `vitest lane check ${randomBytes(8).toString("hex")}`;
      const before = await tx.execute<{ n: number }>(sql`select count(*)::int as n from items`);

      const res = await app.request(
        "/api/team/lanes/winners/checked",
        {
          method: "POST",
          headers: { authorization: "Bearer team-token", "content-type": "application/json" },
          body: JSON.stringify({ note, sources: ["city page"] }),
        },
        envOf(tx),
      );
      expect(res.status).toBe(200);
      const saved = (await res.json()) as {
        lane: string;
        note: string;
        sources: string[];
        by: string;
        checkedAt: string;
        freshness: { stale: boolean; staleMinutes: number; lastUpdateAt: string; health: string };
      };
      expect(saved.lane).toBe("winners");
      expect(saved.note).toBe(note);
      expect(saved.sources).toEqual(["city page"]);
      expect(saved.by).toBe("Juan");
      expect(saved.freshness.stale).toBe(false);
      expect(saved.freshness.staleMinutes).toBe(24 * 60);
      expect(Date.parse(saved.freshness.lastUpdateAt)).toBeGreaterThanOrEqual(Date.parse(saved.checkedAt) - 1000);

      const board = (await (await app.request("/api/control/board", { headers: { authorization: "Bearer team-token" } }, envOf(tx))).json()) as ControlBoard;
      const winners = board.groups.find((g) => g.key === "winners")!;
      expect(winners.activity.some((a) => a.text === `Checked, nothing new — ${note} · city page`)).toBe(true);
      expect(laneIsStale(winners.lastUpdateAt, winners.staleMinutes, new Date(board.generatedAt))).toBe(false);

      const after = await tx.execute<{ n: number }>(sql`select count(*)::int as n from items`);
      expect(after[0].n).toBe(before[0].n);
      const titled = await tx.execute<{ n: number }>(sql`select count(*)::int as n from items where title ilike ${"%" + note + "%"} or body ilike ${"%" + note + "%"}`);
      expect(titled[0].n).toBe(0);
      const feed = await app.request("/api/feed", {}, envOf(tx));
      expect(await feed.text()).not.toContain(note);
    }));

  it("counts an edit of a published item as a refresh", () =>
    inTx(async (tx) => {
      const title = `vitest edit ${randomBytes(8).toString("hex")}`;
      const [item] = await tx.execute<{ id: string }>(sql`
        insert into items (category, title, status, published_at)
        values ('winner', ${title}, 'published', now() - interval '10 days')
        returning id`);
      await tx.execute(sql`
        insert into item_actions (item_id, by_name, action, created_at)
        values (${item.id}, 'Juan', 'edit', now())`);

      const board = (await (await app.request("/api/control/board", { headers: { authorization: "Bearer team-token" } }, envOf(tx))).json()) as ControlBoard;
      const winners = board.groups.find((g) => g.key === "winners")!;
      const line = winners.activity.find((a) => a.text === `Edited: ${title}`);
      expect(line).toBeTruthy();
      expect(Date.parse(winners.lastUpdateAt!)).toBeGreaterThanOrEqual(Date.parse(line!.at) - 5);
      expect(laneIsStale(winners.lastUpdateAt, winners.staleMinutes, new Date(board.generatedAt))).toBe(false);
    }));
});
