import { describe, expect, it } from "vitest";
import { ancestorsOrSelf, matchTopic } from "./interests";

describe("matchTopic", () => {
  it("lists a key's ancestors", () => {
    expect(ancestorsOrSelf("sports.chess")).toEqual(["sports", "sports.chess"]);
  });
  it("matches a child when the parent is followed", () => {
    expect(matchTopic(["sports"], ["sports.chess"])).toBe("sports.chess");
  });
  it("matches the exact topic", () => {
    expect(matchTopic(["sports.chess"], ["food", "sports.chess"])).toBe("sports.chess");
  });
  it("does not match a parent when only the child is followed", () => {
    expect(matchTopic(["sports.chess"], ["sports"])).toBeNull();
  });
  it("does not match on a shared prefix that is not a parent", () => {
    expect(matchTopic(["sport"], ["sports.chess"])).toBeNull();
  });
  it("is null with no prefs or no topics", () => {
    expect(matchTopic([], ["sports"])).toBeNull();
    expect(matchTopic(["sports"], undefined)).toBeNull();
  });
  it("prefers the most specific match", () => {
    expect(matchTopic(["sports", "food"], ["food", "sports.chess"])).toBe("sports.chess");
  });
});
