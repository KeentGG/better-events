import { useEffect, useSyncExternalStore } from "react";
import { teamFetch } from "./team";

/*
 * The area names (roads and places) every team form picks from, loaded once per visit and shared, so an
 * area added in one form shows up in all of them straight away.
 */

let names: string[] = [];
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

function set(next: string[]) {
  names = [...new Set(next)].sort(byName);
  for (const l of listeners) l();
}

function load() {
  // The public list is cached for a while; the team needs areas added a moment ago, so always revalidate.
  loading ??= fetch("/api/areas", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((list: string[]) => set([...list, ...names]))
    .catch(() => {
      // Try again next time a form opens.
      loading = undefined;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every area name, sorted, loading them on first use. Empty until they arrive. */
export function useAreas() {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => names);
}

/** Adds an area on the team desk (or finds it, whatever the case) and returns its name as stored. */
export async function addArea(token: string, name: string) {
  const row = await teamFetch<{ name: string }>("/api/team/areas", token, { method: "POST", body: { name } });
  set([...names, row.name]);
  return row.name;
}
