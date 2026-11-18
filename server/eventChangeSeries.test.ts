import { describe, expect, it } from "vitest";
import { planEventChange, type EventRow } from "./eventChange";

const t = (iso: string) => new Date(iso);
// Nightly 5 PM to 2 AM, Manila, Oct 5 to Oct 9.
const run = (over: Partial<EventRow> = {}): EventRow =>
  ({
    id: "e1", title: "Night Market", description: null, venue: "Plaza", areaId: null,
    plannedStart: t("2026-10-05T17:00:00+08:00"), plannedEnd: t("2026-10-06T02:00:00+08:00"),
    originalStart: null, originalKind: null, actualStart: null, actualEnd: null,
    status: "scheduled", kind: "food", note: null, url: null, official: true, allDay: false, timeKnown: true,
    repeatUntil: "2026-10-09", skipDates: [],
    ...over,
  }) as EventRow;
const NOW = t("2026-10-07T12:00:00+08:00");
const plan = (e: EventRow, u: Parameters<typeof planEventChange>[1], now = NOW) => planEventChange(e, u, now, []);
const ok = (e: EventRow, u: Parameters<typeof planEventChange>[1], now = NOW) => {
  const p = plan(e, u, now);
  if ("error" in p) throw new Error(p.error);
  return p;
};

describe("cancelling one day of a repeating event", () => {
  it("adds the day to skip_dates and says so", () => {
    const p = ok(run(), { change: "cancel", day: "2026-10-08" });
    expect(p.set).toEqual({ skipDates: ["2026-10-08"] });
    expect(p.set.status).toBeUndefined();
    expect(p).toMatchObject({ title: "No Night Market on Thu 8 Oct", category: "cancellation", publish: true });
  });
  it("keeps the called-off days in order", () => {
    expect(ok(run({ skipDates: ["2026-10-09"] }), { change: "cancel", day: "2026-10-08" }).set.skipDates).toEqual(["2026-10-08", "2026-10-09"]);
  });
  it("refuses a day that is over, outside the run or already called off", () => {
    expect(plan(run(), { change: "cancel", day: "2026-10-06" })).toEqual({ error: "Pick one of the days still to come." });
    expect(plan(run(), { change: "cancel", day: "2026-10-12" })).toEqual({ error: "Pick one of the days still to come." });
    expect(plan(run({ skipDates: ["2026-10-08"] }), { change: "cancel", day: "2026-10-08" })).toEqual({ error: "Pick one of the days still to come." });
  });
  it("lets tonight be called off while it hasn't ended", () => {
    expect(ok(run(), { change: "cancel", day: "2026-10-07" }).set.skipDates).toEqual(["2026-10-07"]);
  });
  it("sends the last day left to the rest-of-the-run cancel", () => {
    const e = run({ repeatUntil: "2026-10-07" });
    expect(plan(e, { change: "cancel", day: "2026-10-07" })).toEqual({ error: "That is the last day left. Cancel the rest of the run instead." });
    expect(ok(e, { change: "cancel" }).set.status).toBe("cancelled");
  });
  it("cancels the rest of the run without a day", () => {
    expect(ok(run(), { change: "cancel" })).toMatchObject({ set: { status: "cancelled" }, title: "Cancelled: Night Market" });
  });
  it("is only for a repeating event", () => {
    expect(plan(run({ repeatUntil: null }), { change: "cancel", day: "2026-10-08" })).toEqual({ error: "Only a repeating event can have one day called off." });
  });
});

describe("retiming a repeating event", () => {
  it("changes the daily hours from the next night and says so", () => {
    const p = ok(run(), { change: "retime", newStart: "2026-10-07T18:00:00+08:00" });
    // The first day's clock moves, the end keeps its nine-hour distance.
    expect(p.set).toMatchObject({ status: "scheduled", plannedStart: t("2026-10-05T18:00:00+08:00"), plannedEnd: t("2026-10-06T03:00:00+08:00") });
    expect(p.set.note).toBe("From tonight: 6:00 PM");
    expect(p.title).toBe("Night Market from tonight: 6:00 PM");
    expect(p.set.originalStart).toBeUndefined();
  });
  it("takes a new end and words it", () => {
    const p = ok(run(), { change: "retime", newStart: "2026-10-07T18:00:00+08:00", newEnd: "2026-10-08T01:00:00+08:00" });
    expect(p.set.plannedEnd).toEqual(t("2026-10-06T01:00:00+08:00"));
    expect(p.set.note).toBe("From tonight: 6:00 PM–1:00 AM");
  });
  it("words when it starts: tonight, or the day", () => {
    expect(ok(run(), { change: "retime", newStart: "2026-10-07T18:00:00+08:00" }, t("2026-10-07T03:00:00+08:00")).set.note).toBe("From tonight: 6:00 PM");
    expect(ok(run(), { change: "retime", newStart: "2026-10-07T18:00:00+08:00" }, t("2026-10-08T03:00:00+08:00")).set.note).toBe("From tonight: 6:00 PM");
    expect(ok(run(), { change: "retime", newStart: "2026-10-07T18:00:00+08:00" }, t("2026-10-03T03:00:00+08:00")).set.note).toBe("From Mon 5 Oct: 6:00 PM");
  });
  it("keeps tonight's started mark", () => {
    const p = ok(run({ actualStart: t("2026-10-07T17:05:00+08:00") }), { change: "retime", newStart: "2026-10-07T18:00:00+08:00" });
    expect(p.set).not.toHaveProperty("actualStart");
  });
  it("is refused for a move to another day", () => {
    const refusal = { error: "This event repeats every day. To change the days it runs, change the range in the schedule editor." };
    expect(plan(run(), { change: "move", newStart: "2026-10-08T17:00:00+08:00" })).toEqual(refusal);
    expect(plan(run(), { change: "retime", newStart: "2026-10-12T18:00:00+08:00" })).toEqual(refusal);
    expect(plan(run({ allDay: true, plannedEnd: null }), { change: "retime", keepDateOnly: true, newStart: "2026-10-08T00:00:00+08:00" })).toEqual(refusal);
  });
  it("says nothing changed when the hours are the same", () => {
    expect(plan(run(), { change: "retime", newStart: "2026-10-07T17:00:00+08:00" })).toEqual({ error: "Nothing changed yet." });
  });
  it("turns an all-day run into timed days when it gets a clock", () => {
    const p = ok(run({ allDay: true, plannedStart: t("2026-10-05T00:00:00+08:00"), plannedEnd: null }), { change: "retime", newStart: "2026-10-07T19:00:00+08:00" });
    expect(p.set).toMatchObject({ allDay: false, timeKnown: true, plannedStart: t("2026-10-05T19:00:00+08:00"), plannedEnd: null });
  });
  it("refuses the changes that only make sense for one event", () => {
    for (const change of ["tba", "extend", "early"] as const) expect(plan(run(), { change, newEnd: "2026-10-07T23:00:00+08:00" })).toHaveProperty("error");
  });
});

describe("started and ended on a repeating event", () => {
  it("marks tonight without making the run ongoing", () => {
    const p = ok(run(), { change: "started" }, t("2026-10-07T17:10:00+08:00"));
    expect(p.set).toEqual({ actualStart: t("2026-10-07T17:10:00+08:00"), actualEnd: null });
    expect(p.publish).toBe(false);
  });
  it("ends tonight without marking the run done", () => {
    const e = run({ actualStart: t("2026-10-07T17:10:00+08:00") });
    const p = ok(e, { change: "ended" }, t("2026-10-08T01:55:00+08:00"));
    expect(p.set).toEqual({ actualStart: t("2026-10-07T17:10:00+08:00"), actualEnd: t("2026-10-08T01:55:00+08:00") });
    expect(p.set.status).toBeUndefined();
    expect(p.title).toBe("Night Market ended");
  });
  it("leaves the run's note alone, even for an early end", () => {
    const p = ok(run(), { change: "ended" }, t("2026-10-07T22:00:00+08:00"));
    expect(p.set).not.toHaveProperty("note");
  });
  it("drops an earlier night's start when ending another night", () => {
    const p = ok(run({ actualStart: t("2026-10-06T17:10:00+08:00") }), { change: "ended" }, t("2026-10-08T01:55:00+08:00"));
    expect(p.set.actualStart).toBeNull();
  });
  it("goes back on time by clearing tonight's marks", () => {
    const p = ok(run({ actualStart: t("2026-10-07T17:10:00+08:00"), actualEnd: t("2026-10-08T01:55:00+08:00") }), { change: "on_time" });
    expect(p.set).toMatchObject({ actualStart: null, actualEnd: null, status: "scheduled" });
  });
});
