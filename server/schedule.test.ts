import { describe, expect, it } from "vitest";
import { phaseOf as phase } from "../src/lib/eventPhase";
import type { TeamEvent } from "../src/lib/types";
import { ownerOf, readerStatus, scheduleRows, type ScheduleRow } from "./schedule";

const LOOK_BACK = 36 * 3_600_000;
const at = (iso: string) => Date.parse(iso);
const phaseOf = (r: ScheduleRow, now: number) => phase({ ...r, status: readerStatus[r.status] }, now);

const base: TeamEvent = {
  id: "e1",
  repeatUntil: null,
  skipDates: [],
  title: "Night Market",
  kind: "food",
  venue: "Plaza",
  area: null,
  startsAt: "2026-10-05T17:00:00+08:00",
  endsAt: "2026-10-06T02:00:00+08:00",
  originalStart: null,
  wasDateOnly: false,
  actualStart: null,
  actualEnd: null,
  status: "scheduled",
  note: null,
  description: null,
  url: null,
  official: true,
  organiser: null,
  presentedBy: null,
  allDay: false,
  timeKnown: true,
  topics: [],
};
const run = (extra: Partial<TeamEvent> = {}): TeamEvent => ({ ...base, repeatUntil: "2026-10-09", ...extra });

describe("scheduleRows", () => {
  it("keeps a single event as it is, with its plain id", () => {
    const rows = scheduleRows([base], at("2026-10-05T12:00:00+08:00"), LOOK_BACK);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "e1", startsAt: base.startsAt, carries: true });
    expect(rows[0].seriesId).toBeUndefined();
    expect(rows[0].series).toBeUndefined();
  });

  it("gives a daily event a card per night with unique ids and the run", () => {
    const rows = scheduleRows([run()], at("2026-10-05T12:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.id)).toEqual(["e1@2026-10-05", "e1@2026-10-06", "e1@2026-10-07", "e1@2026-10-08", "e1@2026-10-09"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    expect(rows.every((r) => r.seriesId === "e1" && r.series?.from === "2026-10-05" && r.series.until === "2026-10-09")).toBe(true);
    expect(rows[4].endsAt).toBe("2026-10-09T18:00:00.000Z");
    expect(ownerOf(rows[2])).toBe("e1");
  });

  it("lists from the look-back through the next 7 days", () => {
    const long = run({ repeatUntil: "2026-12-01" });
    const now = at("2026-10-20T12:00:00+08:00");
    const days = scheduleRows([long], now, LOOK_BACK).map((r) => r.id.slice(-10));
    // The night of the 18th is still on at 2 AM on the 19th, inside the look-back.
    expect(days[0]).toBe("2026-10-18");
    expect(days[days.length - 1]).toBe("2026-10-26");
  });

  it("shows the first night of a run further off than a week", () => {
    const rows = scheduleRows([run({ startsAt: "2026-11-05T17:00:00+08:00", endsAt: "2026-11-06T02:00:00+08:00", repeatUntil: "2026-11-09" })], at("2026-10-05T12:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.id)).toEqual(["e1@2026-11-05"]);
  });

  it("leaves called-off nights out", () => {
    const rows = scheduleRows([run({ skipDates: ["2026-10-07"] })], at("2026-10-05T12:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.id.slice(-10))).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]);
  });

  it("carries results and notices on the night that is on now or next only", () => {
    const rows = scheduleRows([run()], at("2026-10-07T01:00:00+08:00"), LOOK_BACK);
    expect(rows.filter((r) => r.carries).map((r) => r.id)).toEqual(["e1@2026-10-06"]);
    const later = scheduleRows([run()], at("2026-10-07T10:00:00+08:00"), LOOK_BACK);
    expect(later.filter((r) => r.carries).map((r) => r.id)).toEqual(["e1@2026-10-07"]);
  });

  it("pins started and ended marks to their own night", () => {
    const rows = scheduleRows([run({ actualStart: "2026-10-06T09:10:00.000Z", actualEnd: "2026-10-06T17:30:00.000Z" })], at("2026-10-07T10:00:00+08:00"), LOOK_BACK);
    const by = Object.fromEntries(rows.map((r) => [r.id.slice(-10), r]));
    expect(by["2026-10-06"].actualEnd).toBe("2026-10-06T17:30:00.000Z");
    expect(by["2026-10-07"].actualStart).toBeNull();
    expect(by["2026-10-07"].actualEnd).toBeNull();
    const now = at("2026-10-07T10:00:00+08:00");
    expect(phaseOf(by["2026-10-06"], now)).toBe("done");
    // The finished night does not finish the run.
    expect(phaseOf(by["2026-10-07"], now)).toBe("next");
    expect(phaseOf(by["2026-10-08"], now)).toBe("next");
  });

  it("shows a started night live past midnight and tomorrow's as next", () => {
    const now = at("2026-10-06T00:30:00+08:00");
    const rows = scheduleRows([run({ actualStart: "2026-10-05T09:00:00.000Z" })], now, LOOK_BACK);
    expect(rows.map((r) => phaseOf(r, now))).toEqual(["live", "next", "next", "next", "next"]);
  });

  it("is next at 10 AM and live only in its hours", () => {
    const month = run({ repeatUntil: "2026-10-31" });
    const live = (iso: string) => scheduleRows([month], at(iso), LOOK_BACK).filter((r) => phaseOf(r, at(iso)) === "live").length;
    expect(live("2026-10-15T10:00:00+08:00")).toBe(0);
    expect(live("2026-10-15T20:00:00+08:00")).toBe(1);
    expect(live("2026-10-16T01:00:00+08:00")).toBe(1);
  });

  it("shows a called-off run as one card", () => {
    const rows = scheduleRows([run({ status: "cancelled" })], at("2026-10-07T10:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.id)).toEqual(["e1@2026-10-07"]);
  });

  it("keeps a finished run on its last night when it has recent results", () => {
    const now = at("2026-11-20T10:00:00+08:00");
    expect(scheduleRows([run()], now, LOOK_BACK)).toHaveLength(0);
    expect(scheduleRows([run()], now, LOOK_BACK, new Set(["e1"])).map((r) => r.id)).toEqual(["e1@2026-10-09"]);
  });

  it("repeats date-only events as date-only days", () => {
    const rows = scheduleRows([run({ startsAt: "2026-10-05T00:00:00+08:00", endsAt: null, allDay: true })], at("2026-10-06T12:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.startsAt)).toEqual(["2026-10-04T16:00:00.000Z", "2026-10-05T16:00:00.000Z", "2026-10-06T16:00:00.000Z", "2026-10-07T16:00:00.000Z", "2026-10-08T16:00:00.000Z"]);
    expect(rows.every((r) => r.endsAt === null && r.allDay)).toBe(true);
  });

  it("sorts singles and nights together", () => {
    const solo = { ...base, id: "solo", startsAt: "2026-10-06T12:00:00+08:00", endsAt: null };
    const rows = scheduleRows([run(), solo], at("2026-10-05T12:00:00+08:00"), LOOK_BACK);
    expect(rows.map((r) => r.id).slice(0, 3)).toEqual(["e1@2026-10-05", "solo", "e1@2026-10-06"]);
  });
});
