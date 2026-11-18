import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { dataGroups } from "../db/schema";
import { findGroup, GROUPS, type GroupConfig, type GroupKey } from "./config";

/** Every group in wall order, with the stale windows staff set from the board. */
export async function loadGroups(db: Db): Promise<GroupConfig<GroupKey>[]> {
  const overrides = new Map((await db.select().from(dataGroups)).map((row) => [row.key, row.staleMinutes]));
  return GROUPS.map((g) => ({ ...g, staleMinutes: overrides.get(g.key) ?? g.staleMinutes }));
}

/**
 * Sets a group's stale window (PATCH /api/control/groups/:key). Choosing the default again removes the
 * override, so a later change to the default in code applies. Null for an unknown group.
 */
export async function setStaleWindow(db: Db, key: string, staleMinutes: number) {
  const group = findGroup(key);
  if (!group) return null;
  if (staleMinutes === group.staleMinutes) await db.delete(dataGroups).where(eq(dataGroups.key, key));
  else await db.insert(dataGroups).values({ key, staleMinutes }).onConflictDoUpdate({ target: dataGroups.key, set: { staleMinutes } });
  return { key, staleMinutes };
}
