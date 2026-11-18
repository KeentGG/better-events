import type { Category } from "../../src/lib/types";

/**
 * Stage 1 classifier: keyword rules in English, Tagalog and Hiligaynon.
 * These lists are a starting point and need tuning with real posts and local speakers.
 * Low-confidence results go to the curator queue (or an LLM, when enabled).
 */
const rules: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: "road_closure",
    patterns: [
      /\b(road|street|st\.?)\s+closure\b/i,
      /\bclosed to (traffic|vehicles|motorists)\b/i,
      // "Lacson St closed from 6th to 21st St", "will be closed starting 5 PM"
      /\b(st|street|road|rd|ave|avenue)\.?\s+(is |are |will be )?closed\b/i,
      /\b(will be|is|are) closed (from|between|starting|until)\b/i,
      /\bsarado\b/i,
      /\breroute|rerouting\b/i,
    ],
  },
  { category: "road_reopening", patterns: [/\b(re-?opened|now open to traffic|passable)\b/i, /\bbukas na\b/i] },
  { category: "traffic_advisory", patterns: [/\btraffic advisory\b/i, /\bBTAO\b/, /\bno parking\b/i] },
  { category: "traffic_sentiment", patterns: [/\b(heavy|terrible|bad) traffic\b/i, /\btrapik\b/i, /\bstuck\b/i, /\bgridlock\b/i, /\bslow[- ]moving\b/i] },
  { category: "cancellation", patterns: [/\b(cancel+ed|postponed|suspended)\b/i, /\bkanselado\b/i] },
  { category: "delay", patterns: [/\b(delayed|moved to|pushed back|resched)/i, /\bnaatrasar|na-delay\b/i] },
  { category: "winner", patterns: [/\b(winners?|champion|1st place|first place|grand prize|nagdaog)\b/i] },
  // A sponsor's concert, show or party is somewhere people turn up at a set time, so it is an event, not a game; checked before the game and raffle rules.
  {
    category: "third_party_event",
    patterns: [
      /^(?=[\s\S]*\b(sponsor(ed)?|presented by|presents|powered by|raffle|giveaway|play (and|&|to) win|win (prizes|freebies))\b)(?=[\s\S]*\b(concert|gig|show|party|night)\b)/i,
    ],
  },
  { category: "sponsor_game", patterns: [/\bsponsor(ed)? games?\b/i, /\bgame booth\b/i, /\bspin the wheel\b/i, /\bplay (and|&|to) win\b/i, /\bwin (prizes|freebies)\b/i] },
  { category: "raffle", patterns: [/\braffle\b/i, /\bgiveaway\b/i, /\bpa-?premyo\b/i] },
  { category: "promo", patterns: [/\bpromo\b/i, /\b\d{1,2}% off\b/i, /\bdiscount\b/i, /\bbuy (1|one) take (1|one)\b/i, /\bb1t1\b/i, /\bsale\b/i] },
  { category: "kiosk", patterns: [/\b(kiosk|booth|stall|food park)s?\b/i] },
  { category: "crime_safety", patterns: [/\b(arrested|snatch|theft|stolen|missing child|lost child|police|BCPO)\b/i] },
  { category: "weather", patterns: [/\b(PAGASA|rainfall|thunderstorm|typhoon|bagyo|signal no\.?)\b/i] },
  { category: "schedule_change", patterns: [/\b(new schedule|updated schedule|change of venue|venue change)\b/i] },
  // Non-official happenings; checked before `activity`, which is the official programme.
  { category: "third_party_event", patterns: [/\b(bazaar|night market|fun run|pop-?up|open mic|gig|side event|after-?party)\b/i, /\btickets? (are )?(available|on sale)\b/i] },
  { category: "activity", patterns: [/\b(street dance|arena|electric masskara|concert|parade|mask making)\b/i] },
];

/** Place names seen in Bacolod posts. Mirrors the `areas` table seed. */
export const gazetteer: Array<{ name: string; aliases: RegExp }> = [
  { name: "Lacson St", aliases: /\blacson\b/i },
  { name: "Araneta St", aliases: /\baraneta (st|street|ave)/i },
  { name: "Burgos Ave", aliases: /\bburgos\b/i },
  { name: "Libertad", aliases: /\blibertad\b/i },
  { name: "Public Plaza", aliases: /\b(public )?plaza\b/i },
  { name: "Capitol Lagoon", aliases: /\b(capitol|lagoon)\b/i },
  { name: "Panaad Park", aliases: /\bpanaad\b/i },
  { name: "Bacolod Government Center", aliases: /\b(government center|BGC)\b/i },
  { name: "Mandalagan", aliases: /\bmandalagan\b/i },
  { name: "Banago", aliases: /\bbanago\b/i },
  { name: "Circumferential Road", aliases: /\bcircumferential\b/i },
];

export interface Classification {
  category: Category;
  area: string | null;
  confidence: number;
}

export function classify(text: string): Classification {
  const hits = rules.filter((r) => r.patterns.some((p) => p.test(text)));
  const area = gazetteer.find((g) => g.aliases.test(text))?.name ?? null;

  if (hits.length === 0) return { category: "other", area, confidence: 0.2 };
  // Rules are ordered by priority, so the first hit wins; several hits lower confidence.
  return { category: hits[0].category, area, confidence: hits.length === 1 ? 0.8 : 0.6 };
}

/**
 * An area from the `areas` table that a post names, for areas the team added on the desk that the
 * gazetteer above doesn't know. Whole words, any case; the longest name wins, so "Lacson St Extension"
 * beats "Lacson St".
 */
export function mentionedArea<T extends { name: string; aliases: string[] }>(text: string, areas: T[]): T | undefined {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = areas.flatMap((a) => [a.name, ...a.aliases].filter((n) => n.trim().length >= 3).map((n) => ({ area: a, n })));
  return names
    .sort((x, y) => y.n.length - x.n.length)
    .find(({ n }) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}($|[^\\p{L}\\p{N}])`, "iu").test(text))?.area;
}

/** Traffic sentiment weights, see docs/ARCHITECTURE.md §4. */
export function trafficWeight(text: string, category: Category): number {
  if (category === "road_closure") return 3;
  if (/\b(heavy|gridlock|stuck|terrible)\b/i.test(text)) return 2;
  if (/\b(slow|moderate)\b/i.test(text)) return 1;
  if (/\b(clear|moving|smooth|passable)\b/i.test(text)) return -1;
  return 0;
}
