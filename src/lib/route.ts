import { useCallback, useEffect, useState } from "react";

export type Tab = "now" | "foryou" | "schedule" | "traffic" | "around" | "visit" | "report" | "team" | "inbox" | "control" | "audit";
// `foryou` is reached from the interest dock. `team`, `inbox`, `control` and `audit` are team pages: reachable by link, not listed in the nav.
const TABS: Tab[] = ["now", "foryou", "schedule", "traffic", "around", "visit", "report", "team", "inbox", "control", "audit"];

/** A page plus an optional detail, like a filter or a section to scroll to: `#/around/food`. */
export interface Route {
  tab: Tab;
  detail?: string;
}

function parse(hash: string): Route {
  const [tab, detail] = hash.replace(/^#\/?/, "").split("/");
  return TABS.includes(tab as Tab) ? { tab: tab as Tab, detail: detail || undefined } : { tab: "now" };
}

export function href({ tab, detail }: Route) {
  return `#/${tab}${detail ? `/${detail}` : ""}`;
}

/**
 * Keeps the current page in the URL hash, so desktop users get working back buttons,
 * new tabs and shareable links without a router.
 */
export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next: Route) => {
    location.hash = href(next);
    window.scrollTo({ top: 0 });
  }, []);

  return [route, go] as const;
}
