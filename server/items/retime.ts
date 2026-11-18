import { dailyProblem } from "../../src/lib/dailyWindow";
import { fitHeadline } from "../../src/lib/headline";
import { advisoryTitle, closureTitle } from "../../src/lib/retime";
import type { Category, ClosureExtent } from "../../src/lib/types";

// The planner is shared with the desk's live line, so what a volunteer sees is what the API decides.
export * from "../../src/lib/retime";

/** The daily hours a post keeps after a retime: they only make sense on a range that still spans days, so a retime to a single day drops them (null). */
export function dailyAfterRetime(dailyFrom: number | null, dailyTo: number | null, startsAt: Date | null, endsAt: Date | null) {
  if (dailyFrom == null || dailyTo == null) return null;
  return dailyProblem(startsAt?.toISOString(), endsAt?.toISOString(), dailyFrom, dailyTo) ? null : { from: dailyFrom, to: dailyTo };
}

/** The post's headline after a retime: advisories and closures are rebuilt from the road, notices keep their free text. */
export function retitled(category: Category, title: string, road: string | null | undefined, startsAt: Date | null, endsAt: Date | null, extent?: ClosureExtent | null, daily?: { from: number; to: number } | null) {
  if (!road) return title;
  if (category === "traffic_advisory") return advisoryTitle(road, startsAt, endsAt);
  if (category === "road_closure") return closureTitle(road, startsAt, endsAt, extent, daily);
  return title;
}

/** What the follow-up is about: "Traffic advisory, Lacson St", "Closed, Lacson St" ("Partly closed, …"), or a notice's own headline. */
export function followUpSubject(category: Category, title: string, road: string | null | undefined, extent?: ClosureExtent | null, daily?: boolean) {
  if (!road) return title;
  if (category === "traffic_advisory") return `Traffic advisory, ${road}`;
  if (category === "road_closure") return `${extent === "partial" ? "Partly closed" : "Closed"}${daily ? " daily" : ""}, ${road}`;
  return title;
}

/** The follow-up's headline: "Extended until 9:00 PM: Traffic advisory, Lacson St", fit to the cap with any overflow and the note as body. */
export function followUpTitle(line: string, subject: string, note?: string) {
  return fitHeadline(`${line}: ${subject}`, note);
}
