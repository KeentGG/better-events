import {
  CalendarDays,
  Compass,
  Construction,
  Info,
  Map,
  MapPinned,
  Search,
  Sparkles,
  Store,
  TicketPercent,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "./route";

/**
 * Why someone opened the app. Search suggests these shortcuts as "Go to" results.
 *
 * browse  Here to see what is on: the schedule, what is happening now, what to know before heading out,
 *         and the rest of the festival (kiosks, rides, promos, thrift).
 * find    Here for one thing: search, the traffic map, one event's details.
 * visit   New to Bacolod: how to get there, what to do, where to eat.
 */
export type Intent = "browse" | "find" | "visit";

export const intents: Array<{ id: Intent; label: string; hint: string }> = [
  { id: "browse", label: "Browsing", hint: "See what is on" },
  { id: "find", label: "Finding", hint: "Look something up" },
  { id: "visit", label: "Visiting", hint: "First time in Bacolod" },
];

export type ShortcutAction = { route: Route } | { search: true };

export interface Shortcut {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  action: ShortcutAction;
}

export const shortcuts: Record<Intent, Shortcut[]> = {
  browse: [
    { id: "today", label: "What's on today", hint: "Parades, contests, concerts", icon: CalendarDays, action: { route: { tab: "schedule" } } },
    { id: "know", label: "Know before you go", hint: "Traffic, weather, tips", icon: Info, action: { route: { tab: "visit", detail: "good-to-know" } } },
    { id: "around", label: "Around the festival", hint: "Kiosks, rides, thrift", icon: Store, action: { route: { tab: "around" } } },
    { id: "promos", label: "Promos", hint: "Deals at kiosks", icon: TicketPercent, action: { route: { tab: "around", detail: "promo" } } },
  ],
  find: [
    { id: "search", label: "Search", hint: "Events, roads, places", icon: Search, action: { search: true } },
    { id: "map", label: "Traffic map", hint: "Closures and heavy roads", icon: Map, action: { route: { tab: "traffic" } } },
    { id: "closures", label: "Road closures", hint: "Official advisories", icon: Construction, action: { route: { tab: "traffic", detail: "advisories" } } },
    { id: "schedule", label: "Full schedule", hint: "Every day, every venue", icon: CalendarDays, action: { route: { tab: "schedule" } } },
  ],
  visit: [
    { id: "getting-there", label: "Getting there", hint: "Air, sea, jeepney", icon: MapPinned, action: { route: { tab: "visit", detail: "getting-there" } } },
    { id: "what-to-do", label: "What to do", hint: "A first-timer's day", icon: Compass, action: { route: { tab: "visit", detail: "what-to-do" } } },
    { id: "eat", label: "Where to eat", hint: "Inasal, piaya, sugar fair", icon: Utensils, action: { route: { tab: "around", detail: "food" } } },
    { id: "highlights", label: "Don't miss", hint: "Street dance, Electric MassKara", icon: Sparkles, action: { route: { tab: "schedule" } } },
  ],
};
