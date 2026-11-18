import { describe, expect, it } from "vitest";
import app from "./app";
import { planSubmission, staleCrowd } from "./community";

const id = "00000000-0000-4000-8000-000000000000";
const closure = { type: "traffic", areas: ["Lacson St"], level: "closed", note: "Parade" };

// The Contribute page sends desk writes for the team to approve. This gate decides which ones.
describe("planSubmission", () => {
  it("takes the desk writes a visitor may suggest", () => {
    expect(planSubmission("POST", "/updates", closure)).toMatchObject({ summary: "Road closed: Lacson St" });
    expect(planSubmission("POST", "/updates", { type: "notice", category: "promo", title: "Two for one piaya" })).toMatchObject({ summary: "promo: Two for one piaya" });
    expect(planSubmission("DELETE", `/events/${id}`, undefined)).toEqual({ body: {}, summary: "Remove an event" });
  });

  it("refuses everything else the desk can do", () => {
    for (const [method, path] of [
      ["POST", "/areas"],
      ["POST", "/topics"],
      ["POST", "/place-kinds"],
      ["PUT", "/topics/food"],
      ["POST", "/guide/sections"],
      ["POST", "/guide/move"],
      ["PATCH", `/items/${id}`],
      ["PUT", `/items/${id}/topics`],
      ["POST", "/lanes/traffic/checked"],
      ["DELETE", `/places/${id}`],
      ["POST", "/updates/../topics"],
      ["POST", "/updates?x=1"],
      ["POST", `/events/${id}/../../topics`],
    ]) {
      expect(planSubmission(method, path, { name: "x" }), `${method} ${path}`).toMatchObject({ status: 403 });
    }
  });

  it("checks the body against the desk's own schema", () => {
    expect(planSubmission("POST", "/updates", { type: "notice", category: "announcement" })).toMatchObject({ status: 400 });
    expect(planSubmission("POST", "/updates", { type: "traffic", areas: [], level: "closed" })).toMatchObject({ status: 400 });
    expect(planSubmission("POST", "/updates", null)).toMatchObject({ status: 400 });
  });

  it("never carries a pin, a banner or a field the desk doesn't know", () => {
    const plan = planSubmission("POST", "/updates", { ...closure, tier: 2, endsAt: "2026-10-18T10:00:00+08:00", staffId: "someone" });
    expect(plan).toMatchObject({ body: closure });
    expect("body" in plan && plan.body).not.toHaveProperty("tier");
    expect("body" in plan && plan.body).not.toHaveProperty("staffId");
  });
});

describe("crowd suggestions", () => {
  const crowd = { type: "crowd", areas: ["Public Plaza"], level: "packed" };
  const sent = new Date("2026-10-14T19:00:00+08:00");
  const after = (min: number) => new Date(sent.getTime() + min * 60_000);

  it("reads as one line for the review list", () => {
    expect(planSubmission("POST", "/updates", crowd)).toMatchObject({ summary: "Crowd: Public Plaza packed" });
    expect(planSubmission("POST", "/updates", { ...crowd, areas: ["A", "B"], level: "quiet", note: "thinning out" })).toMatchObject({ summary: "Crowd: A, B quiet" });
  });

  it("refuses an unknown level or a note past 200 characters", () => {
    expect(planSubmission("POST", "/updates", { ...crowd, level: "jammed" })).toMatchObject({ status: 400 });
    expect(planSubmission("POST", "/updates", { ...crowd, note: "x".repeat(201) })).toMatchObject({ status: 400 });
  });

  it("can be approved for 45 minutes, and not after", () => {
    expect(staleCrowd("POST", "/updates", crowd, sent, after(45))).toBeNull();
    expect(staleCrowd("POST", "/updates", crowd, sent, after(46))).toMatch(/too old to post/);
  });

  it("leaves every other suggestion alone however old", () => {
    expect(staleCrowd("POST", "/updates", closure, sent, after(600))).toBeNull();
    expect(staleCrowd("DELETE", `/events/${id}`, {}, sent, after(600))).toBeNull();
  });
});

describe("community routes", () => {
  it("keeps the review queue to signed-in team members, and out of caches", async () => {
    const env = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" };
    for (const [method, path] of [
      ["GET", "/api/community/review"],
      ["POST", `/api/community/review/${id}/approve`],
      ["POST", `/api/community/review/${id}/reject`],
    ]) {
      const res = await app.request(path, { method }, env);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});
