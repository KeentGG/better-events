import { afterEach, describe, expect, it } from "vitest";
import { atOrBefore, pinClock } from "./demoClock";

// A demo freezes the clock at one festival moment: new Date() and Date.now() stop moving, while every
// explicit date keeps working so cards, schedules and parsing still read correctly.
const NativeDate = globalThis.Date;
const pin = "2026-10-17T21:00:00+08:00";

afterEach(() => {
  globalThis.Date = NativeDate;
});

describe("pinClock", () => {
  it("freezes new Date() and Date.now() at the pinned instant", () => {
    pinClock(pin);
    expect(Date.now()).toBe(NativeDate.parse(pin));
    expect(new Date().toISOString()).toBe("2026-10-17T13:00:00.000Z");
    expect(new Date().getTime()).toBe(Date.now());
  });

  it("leaves explicit dates, Date.parse and Date.UTC alone", () => {
    pinClock(pin);
    expect(new Date("2020-01-02T03:04:05Z").toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(new Date(0).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(new Date(2020, 0, 2).getTime()).toBe(new NativeDate(2020, 0, 2).getTime());
    expect(Date.parse("2020-01-02T03:04:05Z")).toBe(NativeDate.parse("2020-01-02T03:04:05Z"));
    expect(Date.UTC(2020, 0, 2)).toBe(NativeDate.UTC(2020, 0, 2));
  });

  it("rejects an invalid instant without touching the clock", () => {
    expect(() => pinClock("not a date")).toThrow(RangeError);
    expect(globalThis.Date).toBe(NativeDate);
  });
});

describe("atOrBefore", () => {
  it("keeps a post published at the pin and drops one published after it", () => {
    expect(atOrBefore("2026-10-17T21:00:00+08:00", pin)).toBe(true);
    expect(atOrBefore("2026-10-17T21:00:00.001+08:00", pin)).toBe(false);
  });

  it("compares instants, not clock text", () => {
    expect(atOrBefore("2026-10-17T13:00:00Z", pin)).toBe(true);
    expect(atOrBefore("2026-10-16T12:00:00-05:00", pin)).toBe(true);
    expect(atOrBefore("2026-10-18T00:00:00+08:00", pin)).toBe(false);
  });
});
