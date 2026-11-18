import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { areaPoint, midpointAlong } from "./areaPoint";

const roads: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { area: "Lacson St" }, geometry: { type: "MultiLineString", coordinates: [[[0, 0], [1, 0]], [[10, 0], [10, 2], [10, 4]]] } },
    { type: "Feature", properties: { area: "Public Plaza" }, geometry: { type: "Point", coordinates: [5, 5] } },
  ],
};

describe("areaPoint", () => {
  it("takes the midpoint along a line, not the box centre", () => {
    expect(midpointAlong([[0, 0], [4, 0], [4, 4]])).toEqual([4, 0]);
    expect(midpointAlong([[0, 0], [0, 0]])).toEqual([0, 0]);
    expect(midpointAlong([])).toBeNull();
  });
  it("uses the longest line of the road", () => {
    expect(areaPoint("Lacson St", roads)).toEqual([10, 2]);
  });
  it("follows aliases and saved points", () => {
    expect(areaPoint("Lacson Street", roads)).toEqual([10, 2]);
    expect(areaPoint("Bacolod Public Plaza", roads)).toEqual([5, 5]);
  });
  it("prefers the area's own coordinates", () => {
    expect(areaPoint("Lacson St", roads, { lat: 3, lng: 4 })).toEqual([4, 3]);
  });
  it("is null with neither", () => {
    expect(areaPoint("Nowhere", roads, {})).toBeNull();
  });
});
