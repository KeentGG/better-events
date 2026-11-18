import { describe, expect, it } from "vitest";
import { availableActions, moveActions, rowActionRequest, teamEditRequest, undoActions } from "./inbox";

describe("moveActions", () => {
  it("publishing from review verifies the item", () => {
    expect(moveActions("needs_review", "published")).toEqual([{ action: "verify" }]);
  });

  it("publishing a hidden item puts it back up and verifies it", () => {
    expect(moveActions("hidden", "published")).toEqual([{ action: "unhide" }, { action: "verify" }]);
  });

  it("hides from anywhere and sends back to review", () => {
    expect(moveActions("needs_review", "hidden")).toEqual([{ action: "hide" }]);
    expect(moveActions("hidden", "needs_review")).toEqual([{ action: "return_to_review" }]);
  });

  it("sends nothing when the status does not change", () => {
    expect(moveActions("published", "published")).toEqual([]);
  });
});

describe("undoActions", () => {
  it("undoing a publish sends the item back to review, which withdraws the verification", () => {
    expect(undoActions("published", "needs_review")).toEqual([{ action: "return_to_review" }]);
  });

  it("undoing a hide on a published item only unhides it", () => {
    expect(undoActions("hidden", "published")).toEqual([{ action: "unhide" }]);
  });

  it("undoing a reject returns the item to review", () => {
    expect(undoActions("hidden", "needs_review")).toEqual([{ action: "return_to_review" }]);
  });
});

describe("availableActions", () => {
  const staff = { moderator: true };
  const team = { moderator: false };
  const item = (over: Partial<{ status: "published" | "needs_review" | "hidden"; flag: "conflict" | null; verifiedAt: string | null }> = {}) => ({
    status: "published" as const,
    flag: null,
    verifiedAt: null,
    ...over,
  });

  it("lets staff verify an unverified item and hide it", () => {
    expect(availableActions({ item: item(), mine: false }, staff)).toEqual(["verify", "hide"]);
  });

  it("offers staff verify again only while flagged or waiting for review", () => {
    expect(availableActions({ item: item({ verifiedAt: "2026-10-20T12:00:00Z" }), mine: false }, staff)).toEqual(["hide"]);
    expect(availableActions({ item: item({ verifiedAt: "2026-10-20T12:00:00Z", flag: "conflict" }), mine: false }, staff)).toEqual(["verify", "hide"]);
  });

  it("only lets staff unhide a hidden item", () => {
    expect(availableActions({ item: item({ status: "hidden" }), mine: false }, staff)).toEqual(["unhide"]);
  });

  it("lets team members hide and unhide their own desk entries, and nothing else", () => {
    expect(availableActions({ item: item(), mine: true }, team)).toEqual(["hide"]);
    expect(availableActions({ item: item({ status: "hidden" }), mine: true }, team)).toEqual(["unhide"]);
    expect(availableActions({ item: item(), mine: false }, team)).toEqual([]);
  });

  it("offers nothing on a post that has no item", () => {
    expect(availableActions({ item: null, mine: false }, staff)).toEqual([]);
  });
});

describe("rowActionRequest", () => {
  it("sends staff actions to the item actions route and team hides to the desk", () => {
    expect(rowActionRequest("i1", "verify", { moderator: true })).toEqual({ path: "/api/control/items/i1/actions", method: "POST", body: { actions: [{ action: "verify" }] } });
    expect(rowActionRequest("i1", "hide", { moderator: false })).toEqual({ path: "/api/team/items/i1", method: "PATCH", body: { status: "hidden" } });
    expect(rowActionRequest("i1", "unhide", { moderator: false })).toEqual({ path: "/api/team/items/i1", method: "PATCH", body: { status: "published" } });
  });
});

describe("teamEditRequest", () => {
  it("patches the team desk route with title, body and area", () => {
    expect(teamEditRequest("i1", { title: "Fixed", body: "Details", area: "Lacson St" })).toEqual({
      path: "/api/team/items/i1",
      method: "PATCH",
      body: { title: "Fixed", body: "Details", area: "Lacson St" },
    });
  });
});
