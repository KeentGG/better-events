import { describe, expect, it } from "vitest";
import { ItemActionError, planAction, type Actor, type ItemState } from "./actions";

const NOW = new Date("2026-10-20T12:00:00Z");
const maria: Actor = { kind: "staff", id: "staff-maria", name: "Maria" };
const admin: Actor = { kind: "admin", name: "Admin" };
const juan: Actor = { kind: "collector", id: "collector-juan", name: "Juan" };

const item = (over: Partial<ItemState> = {}): ItemState => ({
  status: "published",
  flag: null,
  category: "road_reopening",
  title: "Lacson open na",
  body: "",
  area: "Lacson St",
  verifiedBy: null,
  verifiedAt: null,
  endsAt: null,
  ...over,
});

const refused = (fn: () => unknown, status: number) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ItemActionError);
    expect((err as ItemActionError).status).toBe(status);
    return;
  }
  throw new Error("expected the action to be refused");
};

describe("planAction", () => {
  it("ending sets the end to now; a team member may end their own entry", () => {
    expect(planAction(item(), { action: "end" }, juan, NOW)).toEqual({ endsAt: NOW });
    expect(planAction(item({ endsAt: new Date("2026-10-20T20:00:00Z") }), { action: "end" }, maria, NOW)).toEqual({ endsAt: NOW });
  });

  it("ending something hidden or already over is refused as stale", () => {
    refused(() => planAction(item({ status: "hidden" }), { action: "end" }, maria, NOW), 409);
    refused(() => planAction(item({ endsAt: new Date("2026-10-20T11:00:00Z") }), { action: "end" }, maria, NOW), 409);
  });

  it("verifying resolves the flag and records who", () => {
    expect(planAction(item({ flag: "conflict" }), { action: "verify" }, maria, NOW)).toEqual({ verifiedBy: "staff-maria", verifiedAt: NOW, flag: null });
  });

  it("verifying an item waiting for review publishes it; ADMIN_TOKEN verifies without a staff row", () => {
    expect(planAction(item({ status: "needs_review" }), { action: "verify" }, admin, NOW)).toEqual({ verifiedAt: NOW, status: "published" });
  });

  it("refuses to verify a hidden item, since whoever clicked saw an old copy", () => {
    refused(() => planAction(item({ status: "hidden" }), { action: "verify" }, maria, NOW), 409);
  });

  it("hiding resolves the flag; hiding twice is refused", () => {
    expect(planAction(item({ flag: "low_confidence" }), { action: "hide" }, maria, NOW)).toEqual({ status: "hidden", flag: null });
    refused(() => planAction(item({ status: "hidden" }), { action: "hide" }, maria, NOW), 409);
  });

  it("unhides only a hidden item", () => {
    expect(planAction(item({ status: "hidden" }), { action: "unhide" }, maria, NOW)).toEqual({ status: "published" });
    refused(() => planAction(item(), { action: "unhide" }, maria, NOW), 409);
  });

  it("sending back to review withdraws the verification but keeps the flag", () => {
    const verified = item({ verifiedBy: "staff-maria", verifiedAt: NOW, flag: "conflict" });
    expect(planAction(verified, { action: "return_to_review" }, maria, NOW)).toEqual({ status: "needs_review", verifiedBy: null, verifiedAt: null });
    refused(() => planAction(item({ status: "needs_review" }), { action: "return_to_review" }, maria, NOW), 409);
  });

  it("recategorizing resolves the flag, and changes nothing when the category is the same", () => {
    expect(planAction(item({ flag: "conflict" }), { action: "recategorize", category: "road_closure" }, maria, NOW)).toEqual({
      category: "road_closure",
      flag: null,
    });
    expect(planAction(item(), { action: "recategorize", category: "road_reopening" }, maria, NOW)).toBeNull();
  });

  it("edits only the fields that change, keeps the flag, and treats null as clearing the area", () => {
    const flagged = item({ flag: "conflict" });
    expect(planAction(flagged, { action: "edit", title: "Lacson St reopened", body: "", area: null }, maria, NOW)).toEqual({ title: "Lacson St reopened", area: null });
    expect(planAction(flagged, { action: "edit", title: "Lacson open na" }, maria, NOW)).toBeNull();
  });

  it("lets team members hide, unhide and edit, but not verify or recategorize", () => {
    expect(planAction(item(), { action: "hide" }, juan, NOW)).toEqual({ status: "hidden" });
    expect(planAction(item(), { action: "edit", title: "Updated headline", body: "", area: null }, juan, NOW)).toEqual({
      title: "Updated headline",
      area: null,
    });
    refused(() => planAction(item(), { action: "verify" }, juan, NOW), 403);
    refused(() => planAction(item(), { action: "recategorize", category: "road_closure" }, juan, NOW), 403);
  });
});
