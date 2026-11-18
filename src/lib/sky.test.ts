import { describe, expect, it } from "vitest";
import { skyHour, skyLook } from "./sky";

const lightness = (c: string) => [1, 3, 5].reduce((n, i) => n + parseInt(c.slice(i, i + 2), 16), 0);
const twoPm = "2026-10-10T06:00:00Z";

describe("skyLook", () => {
  it("keeps a light drizzle under broken cloud brighter than a storm", () => {
    const drizzle = skyLook({ scene: "drizzle", isDay: true, cloudCover: 55, rainMm: 0.2, at: twoPm });
    const storm = skyLook({ scene: "storm", isDay: true, cloudCover: 100, rainMm: 8, at: twoPm });
    expect(lightness(drizzle.top)).toBeGreaterThan(lightness(storm.top) + 150);
    expect(drizzle.light).toBeGreaterThan(0.2);
    expect(storm.light).toBe(0);
    expect(drizzle.clouds).toBeLessThan(storm.clouds);
    expect(drizzle.rain).toBeLessThan(storm.rain);
  });

  it("darkens with more cloud and more rain", () => {
    const thin = skyLook({ scene: "rain", isDay: true, cloudCover: 60, rainMm: 0.5 });
    const thick = skyLook({ scene: "rain", isDay: true, cloudCover: 100, rainMm: 4 });
    expect(lightness(thin.bottom)).toBeGreaterThan(lightness(thick.bottom));
    expect(thick.shade).toBeGreaterThan(thin.shade);
  });

  it("draws no clouds or rain on a clear hour, and falls back to the scene without cover", () => {
    const clear = skyLook({ scene: "clear", isDay: true, cloudCover: 2 });
    expect(clear).toMatchObject({ clouds: 0, rain: 0 });
    expect(skyLook({ scene: "cloudy", isDay: true }).clouds).toBeGreaterThan(7);
  });

  it("warms a fairly clear sky at sunset only", () => {
    const sunset = skyLook({ scene: "clear", isDay: true, cloudCover: 10, at: "2026-10-10T09:45:00Z" }); // 5:45 PM
    const noon = skyLook({ scene: "clear", isDay: true, cloudCover: 10, at: "2026-10-10T04:00:00Z" });
    const red = (c: string) => parseInt(c.slice(5, 7), 16) - parseInt(c.slice(1, 3), 16); // blue minus red
    expect(red(sunset.bottom)).toBeLessThan(red(noon.bottom));
  });

  it("keeps a sunset's colour under rain, only darker", () => {
    const fivePm = "2026-10-10T09:00:00Z";
    const clear = skyLook({ scene: "clear", isDay: true, cloudCover: 5, at: fivePm });
    const rainy = skyLook({ scene: "rain", isDay: true, cloudCover: 95, rainMm: 3, at: fivePm });
    const warm = (c: string) => parseInt(c.slice(1, 3), 16) - parseInt(c.slice(5, 7), 16); // red minus blue
    expect(rainy.hour).toBe("sunset");
    expect(warm(rainy.bottom)).toBeGreaterThan(0);
    expect(lightness(rainy.bottom)).toBeLessThan(lightness(clear.bottom));
  });
});

describe("skyHour", () => {
  it.each([
    ["2026-10-10T08:59:00Z", "day"], // 4:59 PM
    ["2026-10-10T09:00:00Z", "sunset"], // 5 PM
    ["2026-10-10T10:30:00Z", "twilight"], // 6:30 PM
    ["2026-10-10T11:00:00Z", "night"], // 7 PM
    ["2026-10-10T17:00:00Z", "night"], // 1 AM
    ["2026-10-10T21:30:00Z", "twilight"], // 5:30 AM
    ["2026-10-10T22:00:00Z", "day"], // 6 AM
  ])("puts %s in the %s", (iso, hour) => expect(skyHour(iso)).toBe(hour));
});
