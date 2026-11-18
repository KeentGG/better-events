import {
  AudioLines,
  Baby,
  Bike,
  Crown,
  Disc3,
  Drum,
  FerrisWheel,
  Flag,
  Footprints,
  Gamepad2,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Medal,
  Mic,
  MicVocal,
  Music,
  Palette,
  PawPrint,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Star,
  Store,
  Tag,
  Ticket,
  Timer,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import type { TopicNode } from "./types";

/**
 * What a visitor said they are into, kept on this device as `sm-interests`. Picking a parent topic
 * follows its whole subtree, children added later included, since matching walks up from each entity's keys.
 */
const KEY = "sm-interests";
const listeners = new Set<() => void>();
let cached: { raw: string | null; topics: string[] } = { raw: null, topics: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private mode: nothing remembered.
  }
  if (raw === cached.raw) return cached.topics;
  let topics: string[] = [];
  try {
    const v = raw ? (JSON.parse(raw) as { topics?: unknown }) : null;
    if (Array.isArray(v?.topics)) topics = v.topics.filter((t): t is string => typeof t === "string");
  } catch {
    // A broken value counts as no interests.
  }
  cached = { raw, topics };
  return topics;
}

// Kept in memory too, so choices still work for this visit when storage is blocked.
let memory: string[] | null = null;

function write(topics: string[]) {
  memory = topics;
  try {
    localStorage.setItem(KEY, JSON.stringify({ topics }));
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot() {
  const stored = read();
  return cached.raw === null && memory ? memory : stored;
}

/** The visitor's chosen topic keys, plus toggling one. Stays in sync across tabs. */
export function usePreferences() {
  const topics = useSyncExternalStore(subscribe, snapshot, () => [] as string[]);
  const toggle = (key: string) => {
    const now = snapshot();
    // Picking a parent covers its children, so drop any child picks it now includes.
    write(now.includes(key) ? now.filter((k) => k !== key) : [...now.filter((k) => !k.startsWith(`${key}.`)), key]);
  };
  const remove = (key: string) => write(snapshot().filter((k) => k !== key));
  /** Drops a child of a followed parent: the parent goes, and its other children stay followed one by one. */
  const dropChild = (parent: string, child: string, siblings: readonly string[]) =>
    write([...snapshot().filter((k) => k !== parent), ...siblings.filter((k) => k !== child)]);
  return { topics, toggle, remove, dropChild };
}

/** `sports.chess` → `["sports", "sports.chess"]`. */
export function ancestorsOrSelf(key: string): string[] {
  const parts = key.split(".");
  return parts.map((_, i) => parts.slice(0, i + 1).join("."));
}

/**
 * The most specific of the entity's topics that the visitor follows, or null. A followed parent matches
 * any of its children; the result names the entity's own topic (Chess), not the parent picked (Sports).
 */
export function matchTopic(prefs: readonly string[], topics: readonly string[] | undefined): string | null {
  if (!prefs.length || !topics?.length) return null;
  const set = new Set(prefs);
  let best: string | null = null;
  for (const t of topics) if (ancestorsOrSelf(t).some((a) => set.has(a)) && (!best || t.split(".").length > best.split(".").length)) best = t;
  return best;
}

// The topic tree, shared by every badge and the dock, loaded once and refreshed while someone is looking.
let tree: TopicNode[] | undefined;
let loadedAt = 0;
const treeListeners = new Set<() => void>();
function loadTree() {
  if (Date.now() - loadedAt < 5 * 60_000) return;
  loadedAt = Date.now();
  fetch("/api/topics", { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? (r.json() as Promise<TopicNode[]>) : Promise.reject(new Error(String(r.status)))))
    .then((t) => ((tree = t), treeListeners.forEach((l) => l())))
    .catch(() => (loadedAt = 0));
}
function subscribeTree(l: () => void) {
  treeListeners.add(l);
  loadTree();
  const id = setInterval(loadTree, 60_000);
  return () => (treeListeners.delete(l), clearInterval(id));
}

/**
 * For showcases outside the app (the portfolio, via src/kit): follow these topics for this visit only,
 * and use this tree instead of loading /api/topics, which a showcase doesn't have.
 */
export function showcaseInterests(topics: string[], topicTree: TopicNode[] = []) {
  memory = topics;
  tree = topicTree;
  loadedAt = Infinity;
  listeners.forEach((l) => l());
  treeListeners.forEach((l) => l());
}

/** The topics visitors can follow, with live counts. Undefined until loaded (or while the API is down). */
export function useTopicTree() {
  return useSyncExternalStore(subscribeTree, () => tree, () => undefined);
}

/** Every node of the tree by key. */
export function topicIndex(tree: readonly TopicNode[] | undefined) {
  const m = new Map<string, TopicNode>();
  const walk = (ns: readonly TopicNode[]) => ns.forEach((n) => (m.set(n.key, n), walk(n.children)));
  walk(tree ?? []);
  return m;
}

/** The icons topics can name. Others fall back to a tag. */
const ICONS: Record<string, LucideIcon> = {
  "audio-lines": AudioLines,
  baby: Baby,
  bike: Bike,
  crown: Crown,
  "disc-3": Disc3,
  drum: Drum,
  footprints: Footprints,
  "graduation-cap": GraduationCap,
  "heart-handshake": HeartHandshake,
  mic: Mic,
  "mic-vocal": MicVocal,
  "paw-print": PawPrint,
  "shopping-basket": ShoppingBasket,
  sparkles: Sparkles,
  star: Star,
  store: Store,
  timer: Timer,
  users: Users,
  "ferris-wheel": FerrisWheel,
  flag: Flag,
  "gamepad-2": Gamepad2,
  landmark: Landmark,
  medal: Medal,
  music: Music,
  palette: Palette,
  shirt: Shirt,
  tag: Tag,
  ticket: Ticket,
  trophy: Trophy,
  utensils: Utensils,
};
export const topicIcon = (name: string | null | undefined): LucideIcon => (name && ICONS[name]) || Tag;
