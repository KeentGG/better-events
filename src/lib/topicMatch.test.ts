import { describe, expect, it } from "vitest";
import { suggestTopics, topicsProblem } from "./topicMatch";

const t = (key: string, name: string, aliases: string[] = [], parentKey: string | null = null, hidden = false) => ({ key, name, aliases, parentKey, hidden });
const topics = [
  t("sports", "Sports", ["sport", "sports fest"]),
  t("sports.chess", "Chess", ["chess", "ahedres"], "sports"),
  t("food", "Food", ["kaon", "food stall"]),
  t("music", "Music", ["concert", "gig"]),
  t("secret", "Secret", ["hush"], null, true),
];
const keys = (text: string) => suggestTopics(text, topics).map((s) => s.key);

describe("suggestTopics", () => {
  it("finds a child by name and drops its parent", () => {
    expect(keys("Chess tournament")).toEqual(["sports.chess"]);
    expect(keys("Sports fest: chess finals")).toEqual(["sports.chess"]);
  });

  it("matches aliases in any case and accent, as whole words", () => {
    expect(keys("AHEDRES sa plaza")).toEqual(["sports.chess"]);
    expect(keys("Kaon ta!")).toEqual(["food"]);
    expect(keys("Gigantic parade")).toEqual([]);
  });

  it("is sure of one topic and less sure of several", () => {
    expect(suggestTopics("Chess tournament", topics)).toEqual([{ key: "sports.chess", confidence: 0.8 }]);
    expect(suggestTopics("Concert and food stall", topics).map((s) => s.confidence)).toEqual([0.5, 0.5]);
  });

  it("never suggests a hidden topic", () => {
    expect(keys("hush now")).toEqual([]);
  });
});

describe("topicsProblem", () => {
  const known = new Set(topics.map((x) => x.key));
  it("requires a topic for events and places", () => {
    expect(topicsProblem("event", [], known)).toMatch(/at least one topic/);
    expect(topicsProblem("place", [], known)).toMatch(/at least one topic/);
    expect(topicsProblem("event", ["sports.chess"], known)).toBeNull();
  });

  it("lets an item go without one", () => {
    expect(topicsProblem("item", [], known)).toBeNull();
  });

  it("refuses unknown keys", () => {
    expect(topicsProblem("item", ["knitting"], known)).toBe('unknown topic "knitting"');
  });
});
