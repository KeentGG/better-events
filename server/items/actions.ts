import { eq } from "drizzle-orm";
import type { Category, ItemAction, ItemActionInput, ItemFlag, ItemStatus } from "../../src/lib/types";
import type { Db } from "../db/client";
import { areas, itemActions, items } from "../db/schema";

/** Who changed an item. Admin is ADMIN_TOKEN, which has no staff row. */
export type Actor = { kind: "staff"; id: string; name: string } | { kind: "admin"; name: string } | { kind: "collector"; id: string; name: string };

/** The item fields actions read and change. `area` is the area's name, as people see it. */
export interface ItemState {
  status: ItemStatus;
  flag: ItemFlag | null;
  category: Category;
  title: string;
  body: string;
  area: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  endsAt: Date | null;
}

export class ItemActionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409,
  ) {
    super(message);
  }
}

/** Team members may only take their own desk entries down, put them back up, end them, or edit them. */
const COLLECTOR_ACTIONS: ReadonlySet<ItemAction> = new Set(["hide", "unhide", "end", "edit"]);

const changedMeanwhile = () => new ItemActionError("This item changed since you loaded it. Reload and try again.", 409);

/**
 * What one action changes (docs/MISSION_CONTROL.md §4.2), or null when it would change nothing.
 * Verifying, hiding and recategorizing resolve an open flag; verifying also publishes an item waiting
 * for review, and returning it to review withdraws the verification. An action on an item that is not
 * in the state it expects (say, verifying one somebody hid a moment ago) means the person acting saw
 * an old copy, so it is refused rather than guessed at.
 */
export function planAction(item: ItemState, input: ItemActionInput, actor: Actor, now: Date): Partial<ItemState> | null {
  if (actor.kind === "collector" && !COLLECTOR_ACTIONS.has(input.action)) {
    throw new ItemActionError("Team members can only hide, unhide, end and edit their own entries.", 403);
  }
  let changes: Partial<ItemState>;
  switch (input.action) {
    case "verify":
      if (item.status === "hidden") throw changedMeanwhile();
      changes = { verifiedBy: actor.kind === "staff" ? actor.id : null, verifiedAt: now, flag: null, status: "published" };
      break;
    case "hide":
      if (item.status === "hidden") throw changedMeanwhile();
      changes = { status: "hidden", flag: null };
      break;
    case "unhide":
      if (item.status !== "hidden") throw changedMeanwhile();
      changes = { status: "published" };
      break;
    case "return_to_review":
      if (item.status === "needs_review") throw changedMeanwhile();
      changes = { status: "needs_review", verifiedBy: null, verifiedAt: null };
      break;
    case "recategorize":
      changes = { category: input.category, flag: null };
      break;
    case "edit":
      changes = { title: input.title, body: input.body, area: input.area };
      break;
    // Ending keeps the post on record but takes it off the feed, which drops anything past its end.
    case "end":
      if (item.status === "hidden" || (item.endsAt && item.endsAt <= now)) throw changedMeanwhile();
      changes = { endsAt: now };
      break;
  }
  return onlyChanged(item, changes);
}

/** The changes that differ from the item; undefined means "leave as is". Null when nothing is left. */
function onlyChanged(item: ItemState, changes: Partial<ItemState>): Partial<ItemState> | null {
  const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
  const entries = Object.entries(changes).filter(([key, value]) => value !== undefined && !same(value, item[key as keyof ItemState]));
  return entries.length ? (Object.fromEntries(entries) as Partial<ItemState>) : null;
}

/**
 * Applies actions to one item in order, in one transaction, and logs each in `item_actions`, so an
 * "edit and publish" from the inbox happens entirely or not at all. Actions that change nothing are
 * skipped. Returns null when the item does not exist; throws ItemActionError when an action is refused.
 */
export async function applyItemActions(db: Db, itemId: string, inputs: ItemActionInput[], actor: Actor) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ item: items, area: areas.name })
      .from(items)
      .leftJoin(areas, eq(items.areaId, areas.id))
      .where(eq(items.id, itemId))
      .for("update", { of: items })
      .limit(1);
    if (!row) return null;

    const { status, flag, category, title, body, verifiedBy, verifiedAt, endsAt } = row.item;
    let state: ItemState = { status, flag, category, title, body, area: row.area, verifiedBy, verifiedAt, endsAt };
    const now = new Date();

    for (const input of inputs) {
      const changes = planAction(state, input, actor, now);
      if (!changes) continue;

      const { area, ...columns } = changes;
      let areaId: string | null | undefined;
      if (area !== undefined) {
        areaId = area === null ? null : (await tx.select({ id: areas.id }).from(areas).where(eq(areas.name, area)).limit(1))[0]?.id;
        if (areaId === undefined) throw new ItemActionError(`Unknown area "${area}".`, 400);
      }
      await tx
        .update(items)
        .set({ ...columns, ...(areaId !== undefined && { areaId }) })
        .where(eq(items.id, itemId));

      const before = Object.fromEntries(Object.keys(changes).map((key) => [key, state[key as keyof ItemState]]));
      await tx.insert(itemActions).values({
        itemId,
        staffId: actor.kind === "staff" ? actor.id : null,
        collectorId: actor.kind === "collector" ? actor.id : null,
        byName: actor.name,
        action: input.action,
        before,
        after: changes,
      });
      state = { ...state, ...changes };
    }

    return { id: itemId, status: state.status, category: state.category, flag: state.flag, verifiedAt: state.verifiedAt?.toISOString() ?? null };
  });
}
