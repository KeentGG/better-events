import { describe, expect, it } from "vitest";
import { inZone, zoneById, zoneFirst } from "./zones";

const zone = (id: string) => zoneById(id)!;

describe("zones", () => {
  it("places the venues the team writes", () => {
    expect(inZone(zone("plaza"), "Bacolod Public Plaza · Downtown hub")).toBe(true);
    expect(inZone(zone("plaza"), "Rizal St")).toBe(true);
    expect(inZone(zone("bcgc"), "BCGC Lobby")).toBe(true);
    expect(inZone(zone("lacson"), "Mezcla Mexican Cocina & Bar, Lacson St")).toBe(true);
    expect(inZone(zone("capitol"), "Ayala Malls Capitol Central")).toBe(true);
    expect(inZone(zone("sm"), "SM City Bacolod")).toBe(true);
  });

  it("keeps Plaza de MassKara at the Upper East, not the Public Plaza", () => {
    const place = "Plaza de MassKara / Megaworld The Upper East";
    expect(inZone(zone("plaza"), place)).toBe(false);
    expect(inZone(zone("bcgc"), place)).toBe(true);
  });

  it("puts the zone's items first and keeps the rest in order", () => {
    const list = ["SM City Bacolod", "Lacson Street", "BCGC", "Lacson St"];
    expect(zoneFirst(list, zone("lacson"), (s) => [s])).toEqual(["Lacson Street", "Lacson St", "SM City Bacolod", "BCGC"]);
    expect(zoneFirst(list, null, (s) => [s])).toBe(list);
  });
});
