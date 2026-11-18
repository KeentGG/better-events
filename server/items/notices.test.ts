import { describe, expect, it } from "vitest";
import { TITLE_MAX } from "../../src/lib/headline";
import { update } from "../team";
import { isResolvable, resolvableCategories, resolveBody, resolveProblem, resolveTitle } from "./notices";

const uuid = "00000000-0000-4000-8000-000000000000";
const notice = { type: "notice", category: "crime_safety", title: "Lost child" };

describe("notice links", () => {
  it("takes an optional place and event on every notice category", () => {
    for (const category of ["raffle", "sponsor_game", "crime_safety", "promo", "weather"]) {
      expect(update.safeParse({ ...notice, category, placeId: uuid, eventId: uuid }).success).toBe(true);
      expect(update.safeParse({ ...notice, category }).success).toBe(true);
    }
    expect(update.safeParse({ ...notice, eventId: "street-dance" }).success).toBe(false);
  });
});

describe("resolveBody", () => {
  it("needs text for 'other' only, and caps it at 140", () => {
    expect(resolveBody.safeParse({ outcome: "found" }).success).toBe(true);
    expect(resolveBody.safeParse({ outcome: "all_clear", url: "https://example.com/x" }).success).toBe(true);
    expect(resolveBody.safeParse({ outcome: "other" }).success).toBe(false);
    expect(resolveBody.safeParse({ outcome: "other", text: "  " }).success).toBe(false);
    expect(resolveBody.safeParse({ outcome: "other", text: "Moved to the clinic" }).success).toBe(true);
    expect(resolveBody.safeParse({ outcome: "other", text: "x".repeat(141) }).success).toBe(false);
    expect(resolveBody.safeParse({ outcome: "lost" }).success).toBe(false);
  });
});

describe("resolveTitle", () => {
  it("prefixes the original, or uses the given text", () => {
    expect(resolveTitle("found", "Lost child near the Plaza").title).toBe("Found: Lost child near the Plaza");
    expect(resolveTitle("all_clear", "Flooding on Lacson").title).toBe("All clear: Flooding on Lacson");
    expect(resolveTitle("other", "ignored", "Family reunited").title).toBe("Family reunited");
  });

  it("fits a long original to the headline cap without losing words", () => {
    const { title, body } = resolveTitle("found", "Lost child ".repeat(20).trim());
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(body).not.toBe("");
  });
});

describe("resolve rules", () => {
  const item = { category: "crime_safety" as const, status: "published", collectorId: "juan" };
  it("takes the resolvable categories from the Safety tile", () => {
    expect(resolvableCategories()).toEqual(["crime_safety"]);
    expect(isResolvable("promo")).toBe(false);
  });
  it("allows the owner and any staff", () => {
    expect(resolveProblem(item, false, { kind: "collector", id: "juan" })).toBeNull();
    expect(resolveProblem(item, false, { kind: "staff", id: "s" })).toBeNull();
  });
  it("refuses another team member's entry, other categories, hidden posts", () => {
    expect(resolveProblem(item, false, { kind: "collector", id: "ana" })?.status).toBe(403);
    expect(resolveProblem({ ...item, category: "promo" }, false, { kind: "staff", id: "s" })?.status).toBe(400);
    expect(resolveProblem({ ...item, status: "hidden" }, false, { kind: "staff", id: "s" })?.status).toBe(409);
  });
  it("answers 409 the second time", () => {
    expect(resolveProblem(item, true, { kind: "collector", id: "juan" })?.status).toBe(409);
  });
});
