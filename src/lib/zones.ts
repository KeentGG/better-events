import { useSyncExternalStore } from "react";

/**
 * Festival zones for "Where are you?". A zone is a handful of areas people think of as one place; an
 * item, event, road or Around spot is in a zone when its area, venue or place names one of them.
 * No zone means all of Bacolod. Kept in code until zones earn a table of their own.
 */
export interface Zone {
  id: string;
  name: string;
  hint: string;
  match: RegExp;
}

// Matched against the places the team actually writes (venues, areas, Around spots). "Plaza de MassKara"
// is at the Upper East, not the Public Plaza, so the plaza pattern wants "Public Plaza" or a leading "Plaza".
export const zones: Zone[] = [
  {
    id: "plaza",
    name: "Public Plaza",
    hint: "Downtown, Araneta, Rizal, Gatuslao",
    match: /(public plaza|^plaza\b(?! de masskara)|\b(downtown|araneta|burgos|rizal|gonzaga|san juan|gatuslao|luzuriaga|lopez jaena|hernaez|libertad|san sebastian|city hall)\b)/i,
  },
  { id: "lacson", name: "Lacson strip", hint: "Street dance route, bars, Mandalagan", match: /\b(lacson|mandalagan)\b/i },
  {
    id: "bcgc",
    name: "BCGC and Upper East",
    hint: "Government Center, Megaworld, Villamonte",
    match: /\b(bcgc|government center|upper east|megaworld|villamonte|plaza de masskara|circumferential)\b/i,
  },
  { id: "capitol", name: "Capitol Lagoon", hint: "Capitol grounds, Ayala Capitol Central", match: /\b(capitol|lagoon|provincial)\b/i },
  { id: "sm", name: "SM City and Reclamation", hint: "SM grounds, Banago", match: /\b(sm city|reclamation|banago)\b/i },
  { id: "panaad", name: "Panaad Park", hint: "Stadium, arena contests", match: /\bpanaad\b/i },
];

export const zoneById = (id: string | null) => zones.find((z) => z.id === id) ?? null;

/** True when any of the given place names falls in the zone. */
export function inZone(zone: Zone, ...names: Array<string | null | undefined>) {
  return names.some((n) => !!n && zone.match.test(n));
}

/** Items in the zone first, keeping each group's order. With no zone, the list as given. */
export function zoneFirst<T>(list: T[], zone: Zone | null, names: (t: T) => Array<string | null | undefined>) {
  if (!zone) return list;
  const near = list.filter((t) => inZone(zone, ...names(t)));
  return [...near, ...list.filter((t) => !near.includes(t))];
}

// One choice for the whole app, remembered on this device, so the header and the page always agree.
const KEY = "sm-zone";
let current: string | null = (() => {
  try {
    return zoneById(localStorage.getItem(KEY))?.id ?? null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();

function setZone(id: string | null) {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  for (const l of listeners) l();
}

/** The visitor's zone (null for all of Bacolod) and a setter. */
export function useZone() {
  const id = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
  return [zoneById(id), setZone] as const;
}
