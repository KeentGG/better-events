import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Db } from "./db/client";
import journal from "./db/migrations/meta/_journal.json";
import { topicsOf, topicTree } from "./topics";

// These run against the local database (.env's DATABASE_URL) and skip without one. Each test works
// inside a transaction it rolls back, so nothing it creates stays behind.
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

const one = async <T,>(tx: Db, q: ReturnType<typeof sql>) => (await tx.execute(q))[0] as T;
const newEvent = (tx: Db, title: string) =>
  one<{ id: string }>(tx, sql`insert into events (title, planned_start, kind) values (${title}, now() + interval '1 hour', 'competition') returning id`);
const newItem = (tx: Db, placeId: string | null = null) =>
  one<{ id: string }>(tx, sql`insert into items (category, title, published_at, place_id) values ('winner', 'Test winners', now(), ${placeId}) returning id`);
const newPlace = (tx: Db) => one<{ id: string }>(tx, sql`insert into places (name, kind) values ('Test stall', 'food') returning id`);
const tag = (tx: Db, type: string, id: string, key: string) => tx.execute(sql`insert into entity_topics (entity_type, entity_id, topic_key) values (${type}, ${id}, ${key})`);

describe.skipIf(!db)("topics in the database", () => {
  it("gives an item the topics of the event it reported on and the place it is about", () =>
    inTx(async (tx) => {
      const event = await newEvent(tx, "Chess tournament");
      await tag(tx, "event", event.id, "sports.chess");
      const place = await newPlace(tx);
      await tag(tx, "place", place.id, "food");
      const item = await newItem(tx, place.id);
      await tx.execute(sql`insert into event_updates (event_id, item_id, kind) values (${event.id}, ${item.id}, 'winner')`);
      await tag(tx, "item", item.id, "games");

      expect((await topicsOf(tx, "item", [item.id])).get(item.id)).toEqual(["food", "games", "sports.chess"]);
      // The event does not take the item's topics back.
      expect((await topicsOf(tx, "event", [event.id])).get(event.id)).toEqual(["sports.chess"]);
    }));

  it("counts a child's live entity on its root too, once", () =>
    inTx(async (tx) => {
      const before = await topicTree(tx);
      const event = await newEvent(tx, "Chess tournament");
      await tag(tx, "event", event.id, "sports.chess");
      await tag(tx, "event", event.id, "sports");
      const after = await topicTree(tx);
      const sports = (tree: typeof after) => tree.find((t) => t.key === "sports")!;
      expect(sports(after).count).toBe(sports(before).count + 1);
      expect(sports(after).children.find((t) => t.key === "sports.chess")!.count).toBe(sports(before).children.find((t) => t.key === "sports.chess")!.count + 1);
    }));

  it("counts a daily event while any night remains, and as today when one is within the day", () =>
    inTx(async (tx) => {
      const sports = async () => (await topicTree(tx)).find((t) => t.key === "sports")!;
      const before = await sports();
      // Started four days ago, 5 PM to 2 AM Manila, and runs until the day after tomorrow.
      const run = (until: string, skip = "'{}'") =>
        one<{ id: string }>(
          tx,
          sql.raw(`insert into events (title, planned_start, planned_end, kind, repeat_until, skip_dates)
            values ('Nightly party', ((current_date - 4)::timestamp + interval '17 hours') at time zone 'Asia/Manila', ((current_date - 3)::timestamp + interval '2 hours') at time zone 'Asia/Manila', 'party', ${until}, ${skip}) returning id`),
        );
      const live = await run("(now() at time zone 'Asia/Manila')::date + 2");
      await tag(tx, "event", live.id, "sports");
      const during = await sports();
      expect(during.count).toBe(before.count + 1);
      expect(during.today).toBe(before.today + 1);
      // The run ended yesterday: nothing remains.
      await tx.execute(sql`update events set repeat_until = (now() at time zone 'Asia/Manila')::date - 2 where id = ${live.id}`);
      expect((await sports()).count).toBe(before.count);
      // Every remaining night called off.
      await tx.execute(sql`update events set repeat_until = (now() at time zone 'Asia/Manila')::date + 1, skip_dates = array[(now() at time zone 'Asia/Manila')::date - 1, (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 1] where id = ${live.id}`);
      expect((await sports()).count).toBe(before.count);
    }));

  it("keeps topics to two levels", async () => {
    await expect(inTx((tx) => tx.execute(sql`insert into topics (key, parent_key, name) values ('sports.chess.blitz', 'sports.chess', 'Blitz')`).then(() => {}))).rejects.toThrow();
    // A root with children cannot move under another root.
    await expect(inTx((tx) => tx.execute(sql`update topics set parent_key = 'games' where key = 'sports'`).then(() => {}))).rejects.toThrow();
    await inTx((tx) => tx.execute(sql`insert into topics (key, parent_key, name) values ('sports.basketball', 'sports', 'Basketball')`).then(() => {}));
  });

  it("removes an entity's topics when it is deleted", () =>
    inTx(async (tx) => {
      const event = await newEvent(tx, "Chess tournament");
      const place = await newPlace(tx);
      const item = await newItem(tx);
      await tag(tx, "event", event.id, "sports.chess");
      await tag(tx, "place", place.id, "food");
      await tag(tx, "item", item.id, "games");
      await tx.execute(sql`delete from events where id = ${event.id}`);
      await tx.execute(sql`delete from places where id = ${place.id}`);
      await tx.execute(sql`delete from items where id = ${item.id}`);
      const left = await one<{ n: number }>(tx, sql`select count(*)::int as n from entity_topics where entity_id in (${event.id}, ${place.id}, ${item.id})`);
      expect(left.n).toBe(0);
    }));

  it("backfilled every event, place and item that existed with a mapped kind", async () => {
    const migrated = new Date(journal.entries.find((e) => e.tag === "0018_topics")!.when).toISOString();
    const missing = await one<{ n: number }>(
      db!,
      sql`select
        (select count(*) from events e where e.created_at < ${migrated} and e.kind in ('parade','competition','concert','food','workshop','ceremony')
          and not exists (select 1 from entity_topics t where t.entity_type = 'event' and t.entity_id = e.id and t.source = 'desk'))
      + (select count(*) from places p where p.created_at < ${migrated} and p.kind in ('food','ride','thrift','promo')
          and not exists (select 1 from entity_topics t where t.entity_type = 'place' and t.entity_id = p.id and t.source = 'desk'))
      + (select count(*) from items i where i.created_at < ${migrated} and i.category in ('sponsor_game','raffle')
          and not exists (select 1 from entity_topics t where t.entity_type = 'item' and t.entity_id = i.id and t.source = 'desk')) as n`,
    );
    expect(Number(missing.n)).toBe(0);
  });
});
