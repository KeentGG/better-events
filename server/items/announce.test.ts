import { describe, expect, it, vi } from "vitest";
import { update } from "../team";
import { tierPicker, tierProblem, withTier } from "./announce";

const endsAt = "2026-10-18T09:00:00.000Z";
const advisory = { type: "advisory", areas: ["Lacson St"] };
const closure = { type: "traffic", areas: ["Lacson St"], level: "closed" };
const eventChange = { type: "event", eventId: "00000000-0000-4000-8000-000000000000", change: "cancel" };

// The tier rules are shared by notices, closures, advisories and event changes.
describe("tier validation off the notice path", () => {
  it("refuses a pin or banner with no end on an advisory or closure", () => {
    for (const body of [advisory, closure]) {
      expect(update.safeParse({ ...body, tier: 1 }).success).toBe(false);
      expect(update.safeParse({ ...body, tier: 2 }).success).toBe(false);
      expect(update.safeParse({ ...body, tier: 1, endsAt }).success).toBe(true);
      expect(update.safeParse({ ...body, tier: 0 }).success).toBe(true);
      expect(update.safeParse(body).success).toBe(true);
    }
  });

  it("lets an event change leave the end out, since it defaults to the event's own", () => {
    expect(update.safeParse({ ...eventChange, tier: 2 }).success).toBe(true);
  });

  it("refuses a tier that doesn't exist", () => {
    expect(update.safeParse({ ...advisory, tier: 3, endsAt }).success).toBe(false);
  });
});

describe("tierProblem", () => {
  it("refuses a banner from anyone but staff, whatever the post", () => {
    expect(tierProblem(2, endsAt, "collector")).toMatchObject({ status: 403 });
    expect(tierProblem(2, endsAt, "staff")).toBeNull();
    expect(tierProblem(1, endsAt, "collector")).toBeNull();
  });

  it("refuses a pin or banner with no end, and lets the feed tier go without", () => {
    expect(tierProblem(1, undefined, "collector")).toMatchObject({ status: 400 });
    expect(tierProblem(2, undefined, "staff")).toMatchObject({ status: 400 });
    expect(tierProblem(0, undefined, "collector")).toBeNull();
    expect(tierProblem(undefined, undefined, "collector")).toBeNull();
  });
});

describe("withTier", () => {
  const fake = () => {
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    const tx = { update: vi.fn(() => ({ set })), insert: vi.fn() };
    const db = { ...tx, transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { db, tx, set };
  };

  it("lowers the banner showing now to pinned, in the same transaction as the new one", async () => {
    const { db, tx, set } = fake();
    const made = await withTier(db as never, 2, new Date(), async (handle) => (handle === (tx as never) ? "in-tx" : "outside"));
    expect(made).toBe("in-tx");
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ severity: 1 });
  });

  it("leaves other banners alone for a pin or a feed post", async () => {
    for (const tier of [0, 1, undefined]) {
      const { db, set } = fake();
      await withTier(db as never, tier, new Date(), async () => null);
      expect(db.transaction).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    }
  });
});

describe("tierPicker", () => {
  it("makes only the first of several posts the banner", () => {
    const next = tierPicker(2);
    expect([next(), next(), next()]).toEqual([2, 1, 1]);
  });

  it("gives every post the same lower tier", () => {
    const next = tierPicker(1);
    expect([next(), next()]).toEqual([1, 1]);
  });
});
