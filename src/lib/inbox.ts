import type { Category, ItemActionInput, ItemFlag, ItemStatus } from "./types";

/**
 * What the inbox's Publish, Hide and Back to review buttons send (docs/MISSION_CONTROL.md §4.2).
 * Publishing is a curator vouching for the item, so it verifies it.
 */
export function moveActions(from: ItemStatus, to: ItemStatus): ItemActionInput[] {
  if (from === to) return [];
  if (to === "hidden") return [{ action: "hide" }];
  if (to === "needs_review") return [{ action: "return_to_review" }];
  return from === "hidden" ? [{ action: "unhide" }, { action: "verify" }] : [{ action: "verify" }];
}

/** What Undo sends to put an item back where it was. Unlike Publish, it vouches for nothing new. */
export function undoActions(now: ItemStatus, back: ItemStatus): ItemActionInput[] {
  if (now === back) return [];
  if (back === "published") return [{ action: now === "hidden" ? "unhide" : "verify" }];
  return moveActions(now, back);
}

/** The inbox's edit form. The server skips whatever did not change. */
export function editActions(draft: { title: string; body: string; category: Category; area: string | null }): ItemActionInput[] {
  return [
    { action: "edit", title: draft.title, body: draft.body, area: draft.area },
    { action: "recategorize", category: draft.category },
  ];
}

/** What a row on mission control can offer: the intake table and the group slide-over. */
export type RowAction = "verify" | "hide" | "unhide";

/**
 * The row actions the signed-in person may take on an item. Staff verify what isn't verified yet (or is
 * flagged, or waiting for review) and hide or unhide anything. Team members may only hide and unhide
 * their own desk entries (`mine`).
 */
export function availableActions(
  row: { item: { status: ItemStatus; flag?: ItemFlag | null; verifiedAt: string | null } | null; mine: boolean },
  viewer: { moderator: boolean },
): RowAction[] {
  const item = row.item;
  if (!item || (!viewer.moderator && !row.mine)) return [];
  const verify = viewer.moderator && item.status !== "hidden" && (!item.verifiedAt || Boolean(item.flag) || item.status === "needs_review");
  return [...(verify ? (["verify"] as const) : []), item.status === "hidden" ? "unhide" : "hide"];
}

/**
 * Where a row action goes. Staff use the item actions route; team members hide and unhide their desk
 * entries through the team desk's own route, which is the one they may use.
 */
export function rowActionRequest(itemId: string, action: RowAction, viewer: { moderator: boolean }) {
  if (viewer.moderator) return { path: `/api/control/items/${itemId}/actions`, method: "POST", body: { actions: [{ action }] } };
  return { path: `/api/team/items/${itemId}`, method: "PATCH", body: { status: action === "unhide" ? "published" : "hidden" } };
}

/** A team member's in-place correction on their own desk entry (title, body and area unchanged unless edited). */
export function teamEditRequest(itemId: string, draft: { title: string; body: string; area: string | null }) {
  return { path: `/api/team/items/${itemId}`, method: "PATCH" as const, body: { title: draft.title, body: draft.body, area: draft.area } };
}
