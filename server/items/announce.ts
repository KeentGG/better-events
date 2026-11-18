import { and, eq, gte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { items } from "../db/schema";

/** How loudly a post is announced: 0 feed, 1 pinned, 2 hero banner (staff only). Stored in `items.severity`. */
export const tierField = z.union([z.literal(0), z.literal(1), z.literal(2)]).optional();

/** A pin or banner can't outlive its post, so it needs an end. Shared by every post that can be announced. */
export const needsEnd = (u: { tier?: number; endsAt?: string }) => !u.tier || Boolean(u.endsAt);
export const needsEndMessage = { message: "a pinned or banner post needs an Until", path: ["endsAt"] };

/** Why a tier can't be used, with the status to answer with; null when it's fine. `endsAt` is what the post will end at. */
export function tierProblem(tier: number | undefined, endsAt: unknown, role: "staff" | "collector"): { status: 400 | 403; error: string } | null {
  if (tier === 2 && role !== "staff") return { status: 403, error: "Only staff can post a hero banner." };
  if (tier && !endsAt) return { status: 400, error: "A pinned or banner post needs an Until." };
  return null;
}

/** Lowers any banner still showing to pinned, so a new one is the only one. Runs in the caller's transaction. */
export async function lowerBanners(tx: Pick<Db, "update">, now: Date) {
  await tx
    .update(items)
    .set({ severity: 1 })
    .where(and(eq(items.severity, 2), eq(items.status, "published"), or(isNull(items.endsAt), gte(items.endsAt, now))));
}

/**
 * Runs `publish` with the handle to write the new posts through. For a banner it first lowers any banner
 * still showing to pinned, in the same transaction, so there is only ever one.
 */
export async function withTier<T>(db: Db, tier: number | undefined, now: Date, publish: (tx: Pick<Db, "insert">) => Promise<T>): Promise<T> {
  if (tier !== 2) return publish(db);
  return db.transaction(async (tx) => {
    await lowerBanners(tx, now);
    return publish(tx);
  });
}

/** The tier for each post of a request that makes several: only the first can be the banner, the rest are pinned. */
export function tierPicker(tier: number | undefined) {
  let bannerUsed = false;
  return () => {
    if (tier !== 2) return tier;
    if (bannerUsed) return 1;
    bannerUsed = true;
    return 2;
  };
}
