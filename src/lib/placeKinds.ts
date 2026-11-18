import { useEffect, useSyncExternalStore } from "react";
import { teamFetch } from "./team";
import type { TeamPlaceKind } from "./types";

/*
 * The place kinds the team's Kind field picks from, loaded once per visit and shared like areas
 * (src/lib/areas.ts), so a kind added in one form shows up in all of them straight away.
 */

let kinds: TeamPlaceKind[] = [];
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: TeamPlaceKind[]) {
  kinds = [...new Map(next.map((k) => [k.key, k])).values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  for (const l of listeners) l();
}

function load(token: string) {
  loading ??= teamFetch<TeamPlaceKind[]>("/api/team/place-kinds", token)
    .then((list) => set([...list, ...kinds]))
    .catch(() => {
      // Try again next time a form opens.
      loading = undefined;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every place kind, by name, loading them on first use. Empty until they arrive. */
export function usePlaceKinds(token: string) {
  useEffect(() => load(token), [token]);
  return useSyncExternalStore(subscribe, () => kinds);
}

/** Adds a kind on the team desk, or finds the one with that name or alias, and returns it as stored. */
export async function addPlaceKind(token: string, name: string) {
  const kind = await teamFetch<TeamPlaceKind>("/api/team/place-kinds", token, { method: "POST", body: { name } });
  set([...kinds, kind]);
  return kind;
}

/** Saves a staff edit to a kind and updates the shared list. */
export async function savePlaceKind(token: string, kind: Pick<TeamPlaceKind, "key" | "name" | "plural" | "icon" | "aliases" | "services">) {
  const { key, ...body } = kind;
  const saved = await teamFetch<TeamPlaceKind>(`/api/team/place-kinds/${encodeURIComponent(key)}`, token, { method: "PUT", body });
  set([...kinds.filter((k) => k.key !== key), saved]);
  return saved;
}

/** Merges a kind into another (its places move, the kind is deleted) and updates the shared list. */
export async function mergePlaceKind(token: string, key: string, into: string) {
  const res = await teamFetch<{ moved: number; into: TeamPlaceKind }>(`/api/team/place-kinds/${encodeURIComponent(key)}/merge`, token, { method: "POST", body: { into } });
  set([...kinds.filter((k) => k.key !== key && k.key !== into), res.into]);
  return res;
}
