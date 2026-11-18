import { describe, expect, it, vi } from "vitest";
import app from "./app";
import { planEventChange, type EventRow } from "./eventChange";
import { eventBody, storedRepeatProblem, itemPatch, kindClash, mergeProblem, placeBody, placeKindEdit, pluralOf, tidyAliases, uniqueSlug, update } from "./team";
import { formerWhen } from "../src/lib/time";

// A team member's token signs in without a database.
vi.mock("./shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared")>();
  return {
    ...actual,
    resolveActor: (...args: Parameters<typeof actual.resolveActor>) =>
      args[1] === "Bearer team-token" ? Promise.resolve({ kind: "collector", id: "collector-juan", name: "Juan" }) : actual.resolveActor(...args),
    touch: () => Promise.resolve(),
  };
});

// Guide sections are linked as #/visit/<slug>, so a slug must be readable and never clash.
describe("uniqueSlug", () => {
  it("makes a readable slug from the title", () => {
    expect(uniqueSlug("Where to eat & drink!", new Set())).toBe("where-to-eat-drink");
    expect(uniqueSlug("Pagkaon sa Bacolod–Silay", new Set())).toBe("pagkaon-sa-bacolod-silay");
  });

  it("numbers a slug that is taken", () => {
    expect(uniqueSlug("Getting there", new Set(["getting-there", "getting-there-2"]))).toBe("getting-there-3");
  });

  it("falls back when the title has no letters or digits", () => {
    expect(uniqueSlug("★★★", new Set())).toBe("section");
  });
});

// A kind added on the spot names its filter chip on Around, so its plural should read naturally.
describe("pluralOf", () => {
  it("pluralizes the last word of a kind's name", () => {
    expect(pluralOf("Photo booth")).toBe("Photo booths");
    expect(pluralOf("Bus stop")).toBe("Bus stops");
    expect(pluralOf("Charging station")).toBe("Charging stations");
    expect(pluralOf("Massage")).toBe("Massages");
  });

  it("handles -s, -ch and consonant -y endings", () => {
    expect(pluralOf("Bus")).toBe("Buses");
    expect(pluralOf("Lechon stall bench")).toBe("Lechon stall benches");
    expect(pluralOf("Pharmacy")).toBe("Pharmacies");
    expect(pluralOf("Hallway")).toBe("Hallways");
  });

  it("uses the kind's key as a slug, falling back when there are no letters", () => {
    expect(uniqueSlug("Photo booth", new Set(["food"]), "kind")).toBe("photo-booth");
    expect(uniqueSlug("★", new Set(), "kind")).toBe("kind");
  });
});

// A notice has a headline and details; the older one-box text still works.
describe("notice headline", () => {
  it("takes a headline with details, or the older text", () => {
    expect(update.safeParse({ type: "notice", category: "promo", title: "2-for-1 piaya", body: "At the Plaza stall, until Sunday." }).success).toBe(true);
    expect(update.safeParse({ type: "notice", category: "promo", text: "2-for-1 piaya" }).success).toBe(true);
  });

  it("refuses a notice with neither", () => {
    expect(update.safeParse({ type: "notice", category: "promo", body: "Details only" }).success).toBe(false);
  });
});

describe("winners", () => {
  const winners = { type: "winners" as const, contest: "Mask-making" };

  it("takes a stage, a prize, a contest id and a tier", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(update.safeParse({ ...winners, places: [{ name: "Ana", prize: "₱30k" }], stage: "revised", contestId: id }).success).toBe(true);
    expect(update.safeParse({ ...winners, places: ["Ana"], stage: "pending" }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: ["Ana"], contestId: "nope" }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: [{ name: "Ana", prize: "x".repeat(61) }] }).success).toBe(false);
  });

  it("needs an end for a pinned or banner winners post", () => {
    expect(update.safeParse({ ...winners, places: ["Ana"], tier: 1 }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: ["Ana"], tier: 1, endsAt: "2026-10-18T10:00:00.000Z" }).success).toBe(true);
    expect(update.safeParse({ ...winners, places: ["Ana"], tier: 0 }).success).toBe(true);
  });

  it("accepts names, a custom label, and a pending time with no places", () => {
    expect(update.safeParse({ ...winners, places: ["Brgy 16"] }).success).toBe(true);
    expect(update.safeParse({ ...winners, places: [{ name: "Brgy 16" }, { label: "Best Costume", name: "Brgy Mandalagan" }] }).success).toBe(true);
    expect(update.safeParse({ ...winners, places: [{ label: "", name: "#1234" }] }).success).toBe(true);
    expect(update.safeParse({ ...winners, places: [], pendingUntil: "2026-10-18T02:00:00.000Z" }).success).toBe(true);
  });

  it("refuses no winner and no pending time", () => {
    expect(update.safeParse({ ...winners, places: [] }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: [""] }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: [{ name: "" }] }).success).toBe(false);
  });

  it("refuses a label over 40 characters, a name over 120, or a time that isn't a date", () => {
    expect(update.safeParse({ ...winners, places: [{ label: "x".repeat(41), name: "Ana" }] }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: [{ name: "x".repeat(121) }] }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: ["x".repeat(121)] }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: [], pendingUntil: "tomorrow" }).success).toBe(false);
    expect(update.safeParse({ ...winners, places: Array.from({ length: 11 }, () => "Ana") }).success).toBe(false);
  });
});

// A notice can say when it happens and until when; the feed drops it after the end.
describe("notice times", () => {
  const notice = { type: "notice", category: "promo", text: "2-for-1 piaya at the Plaza" };

  it("keeps both times optional", () => {
    expect(update.safeParse(notice).success).toBe(true);
    expect(update.safeParse({ ...notice, endsAt: "2026-10-18T09:00:00.000Z" }).success).toBe(true);
    expect(update.safeParse({ ...notice, startsAt: "2026-10-18T08:00:00.000Z", endsAt: "2026-10-18T09:00:00.000Z" }).success).toBe(true);
  });

  it("refuses an end at or before the start", () => {
    expect(update.safeParse({ ...notice, startsAt: "2026-10-18T09:00:00.000Z", endsAt: "2026-10-18T09:00:00.000Z" }).success).toBe(false);
    expect(update.safeParse({ ...notice, startsAt: "2026-10-18T09:00:00.000Z", endsAt: "2026-10-18T08:00:00.000Z" }).success).toBe(false);
  });

  it("refuses a time that isn't a date", () => {
    expect(update.safeParse({ ...notice, endsAt: "tonight" }).success).toBe(false);
  });
});

// A notice can go out pinned or as the hero banner; either needs an end so it can't stay loud after it's over.
describe("notice tiers", () => {
  const notice = { type: "notice", category: "crime_safety", text: "Crush forming near the Lacson stage, avoid now" };
  const endsAt = "2026-10-18T09:00:00.000Z";

  it("keeps the feed tier needing no end", () => {
    expect(update.safeParse(notice).success).toBe(true);
    expect(update.safeParse({ ...notice, tier: 0 }).success).toBe(true);
  });

  it("refuses a pin or banner with no end", () => {
    expect(update.safeParse({ ...notice, tier: 1 }).success).toBe(false);
    expect(update.safeParse({ ...notice, tier: 2 }).success).toBe(false);
    expect(update.safeParse({ ...notice, tier: 1, endsAt }).success).toBe(true);
    expect(update.safeParse({ ...notice, tier: 2, endsAt }).success).toBe(true);
  });

  it("refuses a tier that doesn't exist", () => {
    expect(update.safeParse({ ...notice, tier: 3, endsAt }).success).toBe(false);
  });
});

describe("hero banner", () => {
  it("is refused to team members before anything is saved", async () => {
    const res = await app.request(
      "/api/team/updates",
      {
        method: "POST",
        headers: { authorization: "Bearer team-token", "content-type": "application/json" },
        body: JSON.stringify({ type: "notice", category: "crime_safety", text: "Lost child near the Plaza", tier: 2, endsAt: "2026-10-18T09:00:00.000Z" }),
      },
      // postgres-js connects lazily, and the refusal comes before any query.
      { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" },
    );
    expect(res.status).toBe(403);
  });
});

describe("lowering a post's tier", () => {
  const patch = (body: unknown) =>
    app.request(
      "/api/team/items/00000000-0000-4000-8000-000000000000",
      { method: "PATCH", headers: { authorization: "Bearer team-token", "content-type": "application/json" }, body: JSON.stringify(body) },
      { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" },
    );

  it("is staff only", async () => {
    expect((await patch({ tier: 0 })).status).toBe(403);
  });

  it("can't raise a post to the banner", async () => {
    expect((await patch({ tier: 2 })).status).toBe(400);
  });
});

describe("itemPatch", () => {
  it("accepts a desk edit with title, body and area", () => {
    expect(itemPatch.safeParse({ title: "Headline", body: "Details", area: "Lacson St" }).success).toBe(true);
    expect(itemPatch.safeParse({ title: "Headline", body: "", area: null }).success).toBe(true);
  });

  it("refuses an empty headline", () => {
    expect(itemPatch.safeParse({ title: "", body: "", area: null }).success).toBe(false);
  });
});

describe("hero banner on the other desk posts", () => {
  const endsAt = "2026-10-18T09:00:00.000Z";
  const post = (body: unknown) =>
    app.request(
      "/api/team/updates",
      { method: "POST", headers: { authorization: "Bearer team-token", "content-type": "application/json" }, body: JSON.stringify(body) },
      { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" },
    );

  it("is refused to team members for an advisory, a closure and an event change", async () => {
    const eventId = "00000000-0000-4000-8000-000000000000";
    for (const body of [
      { type: "advisory", areas: ["Lacson St"], tier: 2, endsAt },
      { type: "traffic", areas: ["Lacson St"], level: "closed", tier: 2, endsAt },
      { type: "event", eventId, change: "cancel", tier: 2 },
    ]) {
      expect((await post(body)).status).toBe(403);
    }
  });

  it("is refused with no end before anything is saved", async () => {
    expect((await post({ type: "advisory", areas: ["Lacson St"], tier: 1 })).status).toBe(400);
  });
});

describe("closure daily hours", () => {
  const base = { type: "traffic", areas: ["Lacson St"], level: "closed", startsAt: "2026-10-19T07:00:00Z", endsAt: "2026-10-25T19:00:00Z" };
  const ok = (extra: object) => update.safeParse({ ...base, ...extra }).success;
  it("takes both hours on a closure across days, or neither", () => {
    expect(ok({ dailyFrom: 900, dailyTo: 180 })).toBe(true);
    expect(ok({ dailyFrom: 900 })).toBe(false);
    expect(ok({ dailyFrom: 900, dailyTo: 900 })).toBe(false);
    expect(ok({ dailyFrom: 900, dailyTo: 180, extent: "partial", lanes: "one side open" })).toBe(true);
  });
  it("needs a start and an end on a later day, and a closure", () => {
    expect(ok({ dailyFrom: 900, dailyTo: 180, startsAt: undefined })).toBe(false);
    expect(ok({ dailyFrom: 900, dailyTo: 180, endsAt: "2026-10-19T10:00:00Z" })).toBe(false);
    expect(ok({ dailyFrom: 900, dailyTo: 180, level: "heavy" })).toBe(false);
  });
});

// What each event change does to the schedule row and how it reads in the feed.
describe("notice daily hours", () => {
  const base = { type: "notice", category: "announcement", title: "Plaza food fest", startsAt: "2026-10-01T09:00:00Z", endsAt: "2026-10-31T18:00:00Z" };
  const ok = (extra: object) => update.safeParse({ ...base, ...extra }).success;
  it("takes both hours on a range across days, or neither", () => {
    expect(ok({})).toBe(true);
    expect(ok({ dailyFrom: 1020, dailyTo: 120 })).toBe(true);
    expect(ok({ dailyFrom: 1020 })).toBe(false);
    expect(ok({ dailyTo: 120 })).toBe(false);
  });
  it("refuses hours that are out of range or the same", () => {
    expect(ok({ dailyFrom: 1440, dailyTo: 120 })).toBe(false);
    expect(ok({ dailyFrom: -1, dailyTo: 120 })).toBe(false);
    expect(ok({ dailyFrom: 600, dailyTo: 600 })).toBe(false);
    expect(ok({ dailyFrom: 600.5, dailyTo: 700 })).toBe(false);
  });
  it("needs a start and an end on a later day", () => {
    expect(ok({ dailyFrom: 1020, dailyTo: 120, startsAt: undefined })).toBe(false);
    expect(ok({ dailyFrom: 1020, dailyTo: 120, endsAt: undefined })).toBe(false);
    expect(ok({ dailyFrom: 1020, dailyTo: 120, endsAt: "2026-10-01T10:00:00Z" })).toBe(false);
  });
});

describe("planEventChange", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 18, h, m));
  const ev = (over: Partial<EventRow> = {}): EventRow => ({
    id: "e1", title: "Grand Parade", description: null, venue: "Plaza", areaId: "a1",
    plannedStart: at(6), plannedEnd: at(8), originalStart: null, actualStart: null, actualEnd: null,
    status: "scheduled", kind: "parade", note: null, url: null, official: true,
    createdAt: at(0), updatedAt: at(0), createdByCollectorId: null, createdByStaffId: null, updatedByCollectorId: null, updatedByStaffId: null,
    ...over,
  } as EventRow);
  const areas = [{ id: "a1", name: "Lacson St" }, { id: "a2", name: "Capitol Lagoon" }];
  const plan = (e: EventRow, u: Parameters<typeof planEventChange>[1]) => {
    const p = planEventChange(e, u, at(7), areas);
    if ("error" in p) throw new Error(p.error);
    return p;
  };

  it("calls a later time delayed and an earlier one just a new time", () => {
    const later = plan(ev(), { change: "delay", newStart: at(7, 30).toISOString() });
    expect(later.set.status).toBe("delayed");
    expect(later.title).toMatch(/delayed to/);
    expect(later.set.plannedEnd).toEqual(at(9, 30));
    const earlier = plan(ev(), { change: "delay", newStart: at(5, 30).toISOString() });
    expect(earlier.set.status).toBe("scheduled");
    expect(earlier.title).toMatch(/starts earlier, /);
    expect(earlier.title).not.toMatch(/delayed/i);
    expect(earlier.set.note).toMatch(/^Moved from/);
    const typed = plan(ev(), { change: "delay", newStart: at(7).toISOString(), note: "Waiting on the band" });
    expect(typed.set.note).toMatch(/^Moved from .*\. Waiting on the band$/);
  });

  it("saves the original start once and keeps it", () => {
    const tba = plan(ev(), { change: "tba" });
    expect(tba.set).toMatchObject({ status: "tba", originalStart: at(6), note: "Time to follow" });
    expect(tba.set.plannedStart).toBeUndefined();
    expect(tba.title).toBe("Grand Parade delayed, time to follow");
    const again = plan(ev({ originalStart: at(6), plannedStart: at(7) }), { change: "delay", newStart: at(8).toISOString() });
    expect(again.set.originalStart).toEqual(at(6));
  });

  it("restores the original start and end when back on schedule", () => {
    const moved = ev({ status: "delayed", originalStart: at(6), plannedStart: at(7, 30), plannedEnd: at(9, 30), note: "Moved from 2:00 PM" });
    const back = plan(moved, { change: "on_time" });
    expect(back.set).toMatchObject({ status: "scheduled", plannedStart: at(6), plannedEnd: at(8), originalStart: null, note: null });
    expect(back.title).toMatch(/back on schedule at/);
    expect(plan(ev(), { change: "on_time" }).title).toBe("Grand Parade is back on schedule");
  });

  it("writes actual times for started and ended and posts nothing", () => {
    const started = plan(ev(), { change: "started" });
    expect(started).toMatchObject({ publish: false, set: { status: "ongoing", actualStart: at(7) } });
    const ended = plan(ev(), { change: "ended", at: at(6, 45).toISOString() });
    expect(ended).toMatchObject({ publish: false, set: { status: "done", actualEnd: at(6, 45) } });
  });

  it("judges late from the first start, so a smaller second delay is still a delay", () => {
    const moved = ev({ status: "delayed", originalStart: at(6), plannedStart: at(7), plannedEnd: at(9) });
    const smaller = plan(moved, { change: "delay", newStart: at(6, 30).toISOString() });
    expect(smaller.set).toMatchObject({ status: "delayed", originalStart: at(6), plannedEnd: at(8, 30) });
    expect(smaller.title).toMatch(/delayed to/);
    // Moving it to before the first start is earlier, not delayed.
    expect(plan(moved, { change: "delay", newStart: at(5, 30).toISOString() }).set.status).toBe("scheduled");
  });

  it("treats a new time equal to the first start as back on schedule", () => {
    const back = plan(ev({ status: "delayed", originalStart: at(6), plannedStart: at(7), plannedEnd: at(9) }), { change: "delay", newStart: at(6).toISOString() });
    expect(back).toMatchObject({ category: "schedule_change", set: { status: "scheduled", originalStart: null, note: null, plannedEnd: at(8) } });
    expect(back.title).toMatch(/back on schedule at/);
  });

  it("drops started and ended marks when the event gets a new time or goes back on schedule", () => {
    const ran = ev({ status: "done", actualStart: at(6), actualEnd: at(7) });
    for (const u of [{ change: "delay", newStart: at(8).toISOString() }, { change: "tba" }, { change: "on_time" }] as const) {
      expect(plan(ran, u).set).toMatchObject({ actualStart: null, actualEnd: null });
    }
    expect(plan(ran, { change: "cancel" }).set.actualEnd).toBeUndefined();
  });

  it("refuses started or ended times in the future, and an end before the start", () => {
    const check = (e: EventRow, u: Parameters<typeof planEventChange>[1]) => planEventChange(e, u, at(7), areas);
    expect(check(ev(), { change: "started", at: at(8).toISOString() })).toHaveProperty("error");
    expect(check(ev(), { change: "ended", at: at(8).toISOString() })).toHaveProperty("error");
    expect(check(ev(), { change: "ended", at: at(5).toISOString() })).toHaveProperty("error");
    expect(check(ev({ actualStart: at(5) }), { change: "ended", at: at(5, 30).toISOString() })).not.toHaveProperty("error");
    // A desk clock a minute or two fast still counts as now.
    expect(check(ev(), { change: "started", at: at(7, 2).toISOString() })).not.toHaveProperty("error");
  });

  it("extends or ends early by moving the planned end, keeping an earlier Moved from line", () => {
    const ext = plan(ev(), { change: "extend", newEnd: at(10).toISOString() });
    expect(ext).toMatchObject({ publish: true, category: "schedule_change", set: { plannedEnd: at(10) } });
    expect(ext.set.plannedStart).toBeUndefined();
    expect(ext.title).toMatch(/^Grand Parade extended until /);
    expect(ext.set.note).toMatch(/^Extended until /);
    const kept = plan(ev({ note: "Moved from 1:00 PM" }), { change: "extend", newEnd: at(10).toISOString(), note: "Crowd is big" });
    expect(kept.set.note).toMatch(/^Moved from 1:00 PM\. Extended until .*\. Crowd is big$/);
    const early = plan(ev(), { change: "early", newEnd: at(7).toISOString() });
    expect(early.set).toMatchObject({ plannedEnd: at(7), note: "Now ends at 3:00 PM" });
    expect(early.title).toBe("Grand Parade now ends at 3:00 PM");
  });

  it("retime: a day and a time in one change is one move", () => {
    const next = new Date(at(7).getTime() + 86_400_000);
    const nextEnd = new Date(at(9).getTime() + 86_400_000);
    const moved = plan(ev(), { change: "retime", newStart: next.toISOString() });
    expect(moved.set).toMatchObject({ status: "delayed", originalStart: at(6), plannedStart: next, plannedEnd: nextEnd });
    expect(moved.title).toMatch(/^Grand Parade moved to .*, 3:00 PM$/);
    expect(moved.set.note).toMatch(/^Moved to .*, 3:00 PM$/);
    expect(moved).toMatchObject({ publish: true, category: "schedule_change" });
    const given = plan(ev(), { change: "retime", newStart: next.toISOString(), newEnd: new Date(next.getTime() + 3 * 3_600_000).toISOString() });
    expect(given.set.plannedEnd).toEqual(new Date(next.getTime() + 3 * 3_600_000));
  });

  it("retime on the same day is a delay, or earlier", () => {
    const late = plan(ev(), { change: "retime", newStart: at(7).toISOString() });
    expect(late.set).toMatchObject({ status: "delayed", plannedStart: at(7), plannedEnd: at(9) });
    expect(late.category).toBe("delay");
    expect(plan(ev(), { change: "retime", newStart: at(5).toISOString(), newEnd: at(6, 30).toISOString() }).set).toMatchObject({ status: "scheduled", plannedEnd: at(6, 30) });
  });

  it("retime with only an end reads Extended until or Now ends at, never Ended early", () => {
    const longer = plan(ev(), { change: "retime", newEnd: at(10).toISOString() });
    expect(longer.set.note).toMatch(/^Extended until /);
    const shorter = plan(ev(), { change: "retime", newEnd: at(7).toISOString() });
    expect(shorter.set).toMatchObject({ plannedEnd: at(7), note: "Now ends at 3:00 PM" });
    expect(shorter.title).toBe("Grand Parade now ends at 3:00 PM");
    expect(shorter.set.plannedStart).toBeUndefined();
  });

  it("retime with nothing different says so", () => {
    const check = (u: Parameters<typeof planEventChange>[1]) => planEventChange(ev(), u, at(7), areas);
    expect(check({ change: "retime" })).toMatchObject({ error: "Nothing changed yet." });
    expect(check({ change: "retime", newStart: at(6).toISOString(), newEnd: at(8).toISOString() })).toMatchObject({ error: "Nothing changed yet." });
    expect(check({ change: "retime", newStart: at(7).toISOString(), newEnd: at(6, 30).toISOString() })).toHaveProperty("error");
  });

  it("back to the original after a retime restores it", () => {
    const next = new Date(at(7).getTime() + 86_400_000);
    const moved = ev({ status: "delayed", originalStart: at(6), plannedStart: next, plannedEnd: new Date(at(9).getTime() + 86_400_000) });
    const back = plan(moved, { change: "on_time" });
    expect(back.set).toMatchObject({ status: "scheduled", plannedStart: at(6), originalStart: null, plannedEnd: at(8) });
  });

  it("Ended says early, in the past tense, only when well before the planned end", () => {
    const early = plan(ev(), { change: "ended", at: at(7).toISOString() });
    expect(early.set.note).toBe("Ended early, at 3:00 PM");
    expect(early.title).toBe("Grand Parade ended early");
    expect(plan(ev({ plannedEnd: at(7) }), { change: "ended", at: at(6, 55).toISOString() }).set.note).toBeUndefined();
    expect(plan(ev({ plannedEnd: null }), { change: "ended", at: at(7).toISOString() }).title).toBe("Grand Parade ended");
  });

  it("moves to another day keeping the clock, and back again", () => {
    const next = new Date(at(6).getTime() + 86_400_000);
    const nextEnd = new Date(at(8).getTime() + 86_400_000);
    const moved = plan(ev(), { change: "move", newStart: next.toISOString() });
    expect(moved.set).toMatchObject({ status: "delayed", originalStart: at(6), plannedStart: next, plannedEnd: nextEnd });
    expect(moved.set.note).toMatch(/^Moved to /);
    expect(moved.title).toMatch(/^Grand Parade moved to /);
    const back = plan(ev({ status: "delayed", originalStart: at(6), plannedStart: next, plannedEnd: nextEnd }), { change: "move", newStart: at(9).toISOString() });
    expect(back.set).toMatchObject({ status: "scheduled", originalStart: null, plannedStart: at(6), plannedEnd: at(8), note: null });
    expect(back.title).toMatch(/is back on schedule at/);
    // An earlier day is not delayed.
    const before = new Date(at(6).getTime() - 86_400_000);
    expect(plan(ev(), { change: "move", newStart: before.toISOString() }).set.status).toBe("scheduled");
  });

  it("gives a date-only event a clock on a delay, and moves one by day", () => {
    const day = ev({ allDay: true, plannedStart: at(16), plannedEnd: null });
    const timed = plan(day, { change: "delay", newStart: at(2).toISOString() });
    expect(timed.set).toMatchObject({ allDay: false, timeKnown: true, status: "scheduled", originalStart: null, plannedStart: at(2) });
    expect(timed.title).toMatch(/^Grand Parade starts at /);
    const next = new Date(at(16).getTime() + 86_400_000);
    expect(plan(day, { change: "move", newStart: next.toISOString() }).set).toMatchObject({ status: "scheduled", plannedStart: next });
  });

  it("keeps the old day of a date-only event given a time on another day, and restores it on Back", () => {
    const next = new Date(at(16).getTime() + 86_400_000);
    for (const [flags, kind, tba] of [[{ allDay: true }, "all_day", false], [{ timeKnown: false }, "time_tba", true]] as const) {
      const day = ev({ ...flags, plannedStart: at(16), plannedEnd: null, status: tba ? "tba" : "scheduled" });
      const timed = plan(day, { change: "retime", newStart: next.toISOString() });
      expect(timed.set).toMatchObject({ allDay: false, timeKnown: true, status: "scheduled", originalStart: at(16), originalKind: kind, plannedStart: next });
      // What readers see: the old day only, never midnight.
      const row = ev({ ...timed.set, plannedStart: next, originalStart: at(16), originalKind: kind } as Partial<EventRow>);
      expect(formerWhen({ startsAt: next.toISOString(), originalStart: at(16).toISOString(), wasDateOnly: true })).toBe("Mon 19 Oct");
      const back = plan(row, { change: "on_time" });
      expect(back.set).toMatchObject({ allDay: kind === "all_day", timeKnown: kind !== "time_tba", status: tba ? "tba" : "scheduled", originalStart: null, originalKind: null, plannedStart: at(16), plannedEnd: null });
      const viaMove = plan(row, { change: "retime", newStart: at(16).toISOString() });
      expect(viaMove.set).toMatchObject({ allDay: kind === "all_day", timeKnown: kind !== "time_tba", originalStart: null, originalKind: null });
    }
    // A time on the same day is just a start time: no former, no kind.
    const same = plan(ev({ allDay: true, plannedStart: at(16), plannedEnd: null }), { change: "retime", newStart: at(18).toISOString() });
    expect(same.set).toMatchObject({ allDay: false, originalStart: null, originalKind: null });
    expect(same.title).toMatch(/starts at /);
  });

  it("moves a date-only event by day on a retime with keepDateOnly", () => {
    const next = new Date(at(16).getTime() + 86_400_000);
    const day = ev({ allDay: true, plannedStart: at(16), plannedEnd: null });
    const moved = plan(day, { change: "retime", newStart: next.toISOString(), keepDateOnly: true });
    expect(moved.set).toMatchObject({ plannedStart: next, originalStart: at(16), originalKind: "all_day", status: "scheduled" });
    expect(moved.set).not.toHaveProperty("allDay");
    // A timed event ignores the flag.
    expect(plan(ev(), { change: "retime", newStart: at(7).toISOString(), keepDateOnly: true }).set).toMatchObject({ status: "delayed" });
  });

  it("refuses extend, early and move with nothing sensible to change", () => {
    const check = (e: EventRow, u: Parameters<typeof planEventChange>[1]) => planEventChange(e, u, at(7), areas);
    expect(check(ev(), { change: "extend" })).toHaveProperty("error");
    expect(check(ev(), { change: "extend", newEnd: at(7).toISOString() })).toHaveProperty("error");
    expect(check(ev(), { change: "early", newEnd: at(9).toISOString() })).toHaveProperty("error");
    expect(check(ev(), { change: "early", newEnd: at(5).toISOString() })).toHaveProperty("error");
    expect(check(ev({ plannedEnd: null }), { change: "extend", newEnd: at(9).toISOString() })).toHaveProperty("error");
    expect(check(ev({ allDay: true }), { change: "extend", newEnd: at(9).toISOString() })).toHaveProperty("error");
    expect(check(ev(), { change: "move" })).toHaveProperty("error");
    expect(check(ev(), { change: "move", newStart: at(9).toISOString() })).toHaveProperty("error");
  });

  it("moves the event and its feed item to the new area on a venue change", () => {
    const byName = plan(ev(), { change: "venue", venue: "Lagoon stage", area: "Capitol Lagoon" });
    expect(byName.set).toMatchObject({ venue: "Lagoon stage", areaId: "a2" });
    expect(byName.area).toBe("Capitol Lagoon");
    expect(plan(ev(), { change: "venue", venue: "Lagoon stage", areaId: "a2" }).set.areaId).toBe("a2");
    // Without a new area the event stays put, and other changes post at the event's area.
    expect(plan(ev(), { change: "venue", venue: "Side stage" })).toMatchObject({ area: "Lacson St" });
    expect(plan(ev(), { change: "venue", venue: "Side stage" }).set.areaId).toBeUndefined();
    expect(plan(ev(), { change: "cancel" }).area).toBe("Lacson St");
  });

  it("refuses an area it doesn't know", () => {
    expect(planEventChange(ev(), { change: "venue", venue: "Lagoon stage", area: "Nowhere" }, at(7), areas)).toEqual({ error: "unknown area" });
  });
});

// "Who's putting it on?": a sponsor needs a name, someone else needs an organiser, the festival needs neither.
describe("eventBody", () => {
  const base = { title: "Plaza night", kind: "nightlife", startsAt: "2026-10-17T13:00:00Z", topics: ["music"] };
  const ok = (extra: object) => eventBody.safeParse({ ...base, ...extra }).success;

  it("lets the festival's own events carry no credit, or a sponsor", () => {
    expect(ok({ official: true })).toBe(true);
    expect(ok({ official: true, presentedBy: "Coca-Cola" })).toBe(true);
    expect(ok({})).toBe(true);
  });

  it("asks a non-official event who is behind it", () => {
    expect(ok({ official: false })).toBe(false);
    expect(ok({ official: false, presentedBy: "  " })).toBe(false);
    expect(ok({ official: false, presentedBy: "Coca-Cola" })).toBe(true);
    expect(ok({ official: false, organiser: "Club Zero" })).toBe(true);
  });

  it("takes the new kinds", () => {
    for (const kind of ["nightlife", "bazaar", "sports"]) expect(ok({ kind })).toBe(true);
  });

  it("refuses an event that is both all day and time to follow", () => {
    expect(ok({ allDay: true })).toBe(true);
    expect(ok({ timeKnown: false })).toBe(true);
    expect(ok({ allDay: true, timeKnown: false })).toBe(false);
  });

  it("takes a last day after the first, at most 62 days on, or null for a single event", () => {
    // 13:00 UTC on the 17th is 9 PM that day in Manila.
    expect(ok({ repeatUntil: "2026-10-18" })).toBe(true);
    expect(ok({ repeatUntil: null })).toBe(true);
    expect(ok({ repeatUntil: "2026-10-17" })).toBe(false);
    expect(ok({ repeatUntil: "2026-10-16" })).toBe(false);
    expect(ok({ repeatUntil: "2026-12-18" })).toBe(true);
    expect(ok({ repeatUntil: "2026-12-19" })).toBe(false);
    expect(ok({ repeatUntil: "17 Oct" })).toBe(false);
  });

  it("measures the first day in Manila, not UTC", () => {
    // 9 PM UTC on the 16th is 5 AM on the 17th in Manila, so the 17th is the first day.
    expect(eventBody.safeParse({ ...base, startsAt: "2026-10-16T21:00:00Z", repeatUntil: "2026-10-17" }).success).toBe(false);
    expect(eventBody.safeParse({ ...base, startsAt: "2026-10-16T21:00:00Z", repeatUntil: "2026-10-18" }).success).toBe(true);
  });

  it("takes called-off days as dates", () => {
    expect(ok({ repeatUntil: "2026-10-20", skipDates: ["2026-10-18"] })).toBe(true);
    expect(ok({ repeatUntil: "2026-10-20", skipDates: ["tomorrow"] })).toBe(false);
  });

  it("takes a team-only source note of up to 500 characters, trimmed", () => {
    expect(ok({ sourceNote: "Poster 4:00 PM. Digicast 6:00 PM discarded" })).toBe(true);
    expect(ok({ sourceNote: "x".repeat(500) })).toBe(true);
    expect(ok({ sourceNote: "x".repeat(501) })).toBe(false);
    expect(eventBody.parse({ ...base, sourceNote: "  Phoned the venue  " }).sourceNote).toBe("Phoned the venue");
  });
});

describe("placeBody closed until and archived", () => {
  const base = { kind: "restroom", title: "Capitol CR", place: "Capitol", topics: ["services"] };
  it("takes a time with an offset, null to reopen, or nothing to keep it", () => {
    expect(placeBody.safeParse({ ...base, closedUntil: "2026-10-18T18:00:00+08:00" }).success).toBe(true);
    expect(placeBody.safeParse({ ...base, closedUntil: null }).success).toBe(true);
    expect(placeBody.safeParse(base).success).toBe(true);
    expect(placeBody.safeParse({ ...base, closedUntil: "tonight" }).success).toBe(false);
  });
  it("archives and restores with a boolean", () => {
    expect(placeBody.safeParse({ ...base, archived: true }).success).toBe(true);
    expect(placeBody.safeParse({ ...base, archived: "yes" }).success).toBe(false);
  });
});

describe("place kind edits", () => {
  const edit = { name: "Restroom", plural: "Restrooms", icon: "restroom", aliases: ["CR"], services: true };
  it("takes an icon from the place icon list", () => {
    expect(placeKindEdit.safeParse(edit).success).toBe(true);
    expect(placeKindEdit.safeParse({ ...edit, icon: "rocket" }).success).toBe(false);
  });
  it("needs a name and plural, and caps the aliases", () => {
    expect(placeKindEdit.safeParse({ ...edit, name: "R" }).success).toBe(false);
    expect(placeKindEdit.safeParse({ ...edit, plural: "" }).success).toBe(false);
    expect(placeKindEdit.safeParse({ ...edit, aliases: Array(31).fill("x") }).success).toBe(false);
  });
  it("finds the other kind a name or alias clashes with, in any case", () => {
    const others = [{ key: "atm", name: "ATM", aliases: ["cash machine"] }];
    expect(kindClash("atm", others)?.name).toBe("ATM");
    expect(kindClash("Cash Machine", others)?.name).toBe("ATM");
    expect(kindClash("Restroom", others)).toBeUndefined();
  });
  it("tidies aliases: no repeats, no blanks, not the kind's own name", () => {
    expect(tidyAliases(["CR", "cr", " ", "Comfort  room", "restroom"], "Restroom")).toEqual(["CR", "Comfort room"]);
  });
});

describe("mergeProblem", () => {
  const known = new Set(["promo", "food", "kiosk"]);
  it("allows merging one known kind into another", () => {
    expect(mergeProblem("kiosk", "food", known)).toBeNull();
  });
  it("refuses the promo kind, a kind into itself and an unknown target", () => {
    expect(mergeProblem("promo", "food", known)).toMatch(/Promo/);
    expect(mergeProblem("food", "promo", known)).toMatch(/Promo/);
    expect(mergeProblem("food", "food", known)).toMatch(/different/);
    expect(mergeProblem("food", "ghost", known)).toMatch(/unknown kind/);
    expect(mergeProblem("ghost", "food", known)).toBe("not found");
  });
});

describe("traffic update extent and lanes", () => {
  const closed = { type: "traffic", areas: ["Lacson St"], level: "closed" };
  it("takes a whole or partial closure, with a lanes note up to 120", () => {
    expect(update.safeParse(closed).success).toBe(true);
    expect(update.safeParse({ ...closed, extent: "full" }).success).toBe(true);
    expect(update.safeParse({ ...closed, extent: "partial", lanes: "northbound lanes" }).success).toBe(true);
    expect(update.safeParse({ ...closed, extent: "partial", lanes: "x".repeat(120) }).success).toBe(true);
    expect(update.safeParse({ ...closed, extent: "partial", lanes: "x".repeat(121) }).success).toBe(false);
    expect(update.parse({ ...closed, extent: "partial", lanes: "  one lane open " })).toMatchObject({ lanes: "one lane open" });
  });
  it("refuses an unknown extent, lanes on a whole road, and either on a level that isn't a closure", () => {
    expect(update.safeParse({ ...closed, extent: "half" }).success).toBe(false);
    expect(update.safeParse({ ...closed, lanes: "one lane open" }).success).toBe(false);
    expect(update.safeParse({ ...closed, extent: "full", lanes: "one lane open" }).success).toBe(false);
    expect(update.safeParse({ ...closed, level: "heavy", extent: "partial" }).success).toBe(false);
    expect(update.safeParse({ ...closed, level: "clear", lanes: "x" }).success).toBe(false);
  });
  it("doesn't take partial as a traffic level, since it isn't a reading", () => {
    expect(update.safeParse({ ...closed, level: "partial" }).success).toBe(false);
  });
});

describe("crowd update", () => {
  const crowd = { type: "crowd", areas: ["Public Plaza"], level: "packed" };

  it("takes one to ten areas, a level and a short note", () => {
    expect(update.safeParse(crowd).success).toBe(true);
    expect(update.safeParse({ ...crowd, note: "Long line at the entrance" }).success).toBe(true);
    expect(update.safeParse({ ...crowd, areas: [] }).success).toBe(false);
    expect(update.safeParse({ ...crowd, areas: Array.from({ length: 11 }, (_, i) => `Area ${i}`) }).success).toBe(false);
  });

  it("refuses a level it does not know and a note past 200 characters", () => {
    expect(update.safeParse({ ...crowd, level: "jammed" }).success).toBe(false);
    expect(update.safeParse({ ...crowd, note: "x".repeat(201) }).success).toBe(false);
  });
});

describe("extra venues on an event", () => {
  const base = { title: "Streetdance", kind: "parade", startsAt: "2026-10-17T13:00:00Z", topics: ["music"] };
  const ok = (venues: unknown) => eventBody.safeParse({ ...base, venues }).success;
  it("takes up to six venues with a known role", () => {
    expect(ok([{ venue: "Lacson St", area: "Lacson St", role: "route" }, { venue: "Paglaum Stadium", role: "finish" }])).toBe(true);
    expect(ok([])).toBe(true);
    expect(ok(Array.from({ length: 6 }, () => ({ venue: "A", role: "other" })))).toBe(true);
    expect(ok(Array.from({ length: 7 }, () => ({ venue: "A", role: "other" })))).toBe(false);
  });
  it("refuses a blank or long venue and an unknown role", () => {
    expect(ok([{ venue: "  ", role: "route" }])).toBe(false);
    expect(ok([{ venue: "x".repeat(121), role: "route" }])).toBe(false);
    expect(ok([{ venue: "Plaza", role: "parking" }])).toBe(false);
  });
  it("may be left out, which keeps what the event has", () => {
    expect(eventBody.safeParse(base).success).toBe(true);
  });
});

describe("a moved start against the stored last day", () => {
  it("accepts a start the run still fits", () => {
    expect(storedRepeatProblem("2026-10-17T13:00:00Z", "2026-10-25")).toBeNull();
    expect(storedRepeatProblem("2026-10-17T13:00:00Z", null)).toBeNull();
  });
  it("says what to fix when the start reaches the last day or leaves it too far", () => {
    expect(storedRepeatProblem("2026-10-25T13:00:00Z", "2026-10-25")).toMatch(/after the first day.*ends on Sun 25 Oct.*new last day/);
    expect(storedRepeatProblem("2026-08-01T13:00:00Z", "2026-10-25")).toMatch(/at most 62 days/);
  });
});
