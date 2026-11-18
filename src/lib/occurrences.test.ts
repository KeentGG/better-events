import { describe, expect, it } from "vitest";
import { phaseOf } from "./eventPhase";
import { addDays, allOccurrences, dailyUntil, dayRange, focusOccurrence, hasOccurrenceLeft, manilaDay, occurrenceId, occurrenceNear, occurrencesIn, onePerSeries, parseOccurrenceId, repeatProblem, resolveEventId, runLabel, runOf, type Series } from "./occurrences";

// 5 PM to 2 AM the next morning, Manila, Oct 5 to Oct 9.
const nightly: Series = { startsAt: "2026-10-05T17:00:00+08:00", endsAt: "2026-10-06T02:00:00+08:00", repeatUntil: "2026-10-09" };
const at = (iso: string) => Date.parse(iso);

describe("manilaDay", () => {
  it("is the calendar day in Manila", () => {
    expect(manilaDay("2026-10-05T16:30:00Z")).toBe("2026-10-06");
    expect(manilaDay("2026-10-05T15:59:00Z")).toBe("2026-10-05");
  });
  it("adds days across a month end", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("allOccurrences", () => {
  it("is the one event when it does not repeat", () => {
    const one = allOccurrences({ startsAt: "2026-10-05T17:00:00+08:00", endsAt: null });
    expect(one).toEqual([{ day: "2026-10-05", startsAt: "2026-10-05T09:00:00.000Z", endsAt: null }]);
  });
  it("repeats the hours daily through the last day, an end past midnight staying past midnight", () => {
    const days = allOccurrences(nightly);
    expect(days.map((o) => o.day)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(days[4]).toEqual({ day: "2026-10-09", startsAt: "2026-10-09T09:00:00.000Z", endsAt: "2026-10-09T18:00:00.000Z" });
    expect(manilaDay(days[4].endsAt!)).toBe("2026-10-10");
  });
  it("leaves called-off days out, even the first", () => {
    expect(allOccurrences({ ...nightly, skipDates: ["2026-10-07", "2026-10-05"] }).map((o) => o.day)).toEqual(["2026-10-06", "2026-10-08", "2026-10-09"]);
  });
  it("crosses a month boundary", () => {
    const days = allOccurrences({ startsAt: "2026-10-30T17:00:00+08:00", endsAt: "2026-10-31T02:00:00+08:00", repeatUntil: "2026-11-02" });
    expect(days.map((o) => o.day)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(days[2].endsAt).toBe("2026-11-01T18:00:00.000Z");
  });
  it("keeps date-only days at midnight", () => {
    const days = allOccurrences({ startsAt: "2026-10-05T00:00:00+08:00", endsAt: null, allDay: true, repeatUntil: "2026-10-07" });
    expect(days.map((o) => o.startsAt)).toEqual(["2026-10-04T16:00:00.000Z", "2026-10-05T16:00:00.000Z", "2026-10-06T16:00:00.000Z"]);
    expect(days.every((o) => o.endsAt === null)).toBe(true);
  });
});

describe("occurrencesIn", () => {
  it("takes the nights on or starting inside the window", () => {
    // Oct 7, 1 AM: the night of the 6th is still on, the 7th starts later that day.
    const now = at("2026-10-07T01:00:00+08:00");
    const days = occurrencesIn(nightly, now - 36 * 3_600_000, now + 7 * 86_400_000).map((o) => o.day);
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(occurrencesIn(nightly, now, now + 3_600_000).map((o) => o.day)).toEqual(["2026-10-06"]);
    expect(occurrencesIn(nightly, now, now + 20 * 3_600_000).map((o) => o.day)).toEqual(["2026-10-06", "2026-10-07"]);
  });
  it("counts a date-only day until its end", () => {
    const e: Series = { startsAt: "2026-10-05T00:00:00+08:00", endsAt: null, allDay: true, repeatUntil: "2026-10-07" };
    expect(occurrencesIn(e, at("2026-10-06T23:00:00+08:00"), at("2026-10-06T23:30:00+08:00")).map((o) => o.day)).toEqual(["2026-10-06"]);
  });
});

describe("focusOccurrence and hasOccurrenceLeft", () => {
  it("is the night on now, else the next, else the last", () => {
    expect(focusOccurrence(nightly, at("2026-10-07T01:00:00+08:00"))!.day).toBe("2026-10-06");
    expect(focusOccurrence(nightly, at("2026-10-07T10:00:00+08:00"))!.day).toBe("2026-10-07");
    expect(focusOccurrence(nightly, at("2026-10-20T10:00:00+08:00"))!.day).toBe("2026-10-09");
    expect(focusOccurrence({ ...nightly, skipDates: ["2026-10-07"] }, at("2026-10-07T10:00:00+08:00"))!.day).toBe("2026-10-08");
  });
  it("has one left until the last night is over", () => {
    expect(hasOccurrenceLeft(nightly, at("2026-10-10T01:59:00+08:00"))).toBe(true);
    expect(hasOccurrenceLeft(nightly, at("2026-10-10T02:00:00+08:00"))).toBe(false);
    expect(hasOccurrenceLeft({ ...nightly, skipDates: ["2026-10-09"] }, at("2026-10-09T10:00:00+08:00"))).toBe(false);
  });
});

describe("occurrenceNear", () => {
  it("pins a mark to the night it was made on, past midnight too", () => {
    expect(occurrenceNear(nightly, at("2026-10-07T17:05:00+08:00")).day).toBe("2026-10-07");
    expect(occurrenceNear(nightly, at("2026-10-08T01:30:00+08:00")).day).toBe("2026-10-07");
  });
});

describe("a month-long event reads live only during its hours", () => {
  const month: Series = { startsAt: "2026-10-01T17:00:00+08:00", endsAt: "2026-10-02T02:00:00+08:00", repeatUntil: "2026-10-31" };
  const status = (o: { startsAt: string; endsAt: string | null }, now: string) => phaseOf({ status: "on_time", startsAt: o.startsAt, endsAt: o.endsAt, allDay: false, timeKnown: true }, at(now));
  it("is next at 10 AM and live at 8 PM, on each night's own card", () => {
    const now = at("2026-10-15T10:00:00+08:00");
    const nights = occurrencesIn(month, now - 36 * 3_600_000, now + 7 * 86_400_000);
    expect(nights.map((o) => status(o, "2026-10-15T10:00:00+08:00")).filter((p) => p === "live")).toEqual([]);
    expect(nights.map((o) => status(o, "2026-10-15T20:00:00+08:00")).filter((p) => p === "live")).toHaveLength(1);
    expect(nights.map((o) => status(o, "2026-10-16T01:00:00+08:00")).filter((p) => p === "live")).toHaveLength(1);
  });
});

describe("ids", () => {
  it("builds and parses an occurrence id", () => {
    const id = occurrenceId("0b8b4c3e-1111-4222-8333-444455556666", "2026-10-05");
    expect(id).toBe("0b8b4c3e-1111-4222-8333-444455556666@2026-10-05");
    expect(parseOccurrenceId(id)).toEqual({ eventId: "0b8b4c3e-1111-4222-8333-444455556666", day: "2026-10-05" });
    expect(parseOccurrenceId("abc")).toEqual({ eventId: "abc", day: null });
  });
  const cards = allOccurrences(nightly).map((o) => ({ id: occurrenceId("s1", o.day), seriesId: "s1", startsAt: o.startsAt, endsAt: o.endsAt }));
  const single = { id: "solo", startsAt: "2026-10-07T10:00:00+08:00", endsAt: null };
  it("resolves a series id to the night on now or next", () => {
    expect(resolveEventId([...cards, single], "s1", at("2026-10-07T01:00:00+08:00"))).toBe("s1@2026-10-06");
    expect(resolveEventId(cards, "s1", at("2026-10-07T10:00:00+08:00"))).toBe("s1@2026-10-07");
    expect(resolveEventId(cards, "s1", at("2026-11-01T10:00:00+08:00"))).toBe("s1@2026-10-09");
  });
  it("leaves a card's own id and a single event's id alone", () => {
    expect(resolveEventId([...cards, single], "s1@2026-10-08", 0)).toBe("s1@2026-10-08");
    expect(resolveEventId([...cards, single], "solo", 0)).toBe("solo");
    expect(resolveEventId(cards, "unknown", 0)).toBe("unknown");
  });
  it("keeps one card per daily event for lists of events", () => {
    const list = onePerSeries([...cards, single], at("2026-10-07T10:00:00+08:00"));
    expect(list.map((c) => c.id)).toEqual(["s1@2026-10-07", "solo"]);
  });
});

describe("repeatProblem", () => {
  it("needs a later day, at most 62 days on", () => {
    expect(repeatProblem(nightly.startsAt, null)).toBeNull();
    expect(repeatProblem(nightly.startsAt, "2026-10-05")).toMatch(/after/);
    expect(repeatProblem(nightly.startsAt, "2026-10-04")).toMatch(/after/);
    expect(repeatProblem(nightly.startsAt, "2026-10-06")).toBeNull();
    expect(repeatProblem(nightly.startsAt, "2026-12-06")).toBeNull();
    expect(repeatProblem(nightly.startsAt, "2026-12-07")).toMatch(/62/);
  });
  it("goes by the Manila day of the start", () => {
    // 1 AM Manila on the 5th is still the 4th in UTC.
    expect(repeatProblem("2026-10-05T01:00:00+08:00", "2026-10-05")).toMatch(/after/);
    expect(repeatProblem("2026-10-05T01:00:00+08:00", "2026-10-06")).toBeNull();
  });
});

describe("wording", () => {
  it("words the range for the team lists", () => {
    expect(runLabel(nightly)).toBe("Daily, 5–9 Oct, 5:00 PM–2:00 AM");
    expect(runLabel({ startsAt: "2026-10-30T00:00:00+08:00", endsAt: null, allDay: true, repeatUntil: "2026-11-02" })).toBe("Daily, 30 Oct–2 Nov, all day");
    expect(runLabel({ startsAt: "2026-10-05T17:00:00+08:00", endsAt: null })).toBe("5:00 PM");
  });
  it("words one night's card", () => {
    expect(dailyUntil(runOf(nightly))).toBe("Daily until Fri 9 Oct");
    expect(dayRange("2026-10-05", "2026-10-05")).toBe("5 Oct");
  });
});
