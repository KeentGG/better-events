import type { TeamTopic } from "./types";

/*
 * Topic suggestions and the topic rule for desk entries, shared by the desk's TopicPicker, the team
 * API and the classifier, so all three agree on what a title is about.
 */

/** Classifier topics below this confidence put the item under To verify in the intake table. */
export const TOPIC_SURE = 0.7;

export interface TopicSuggestion {
  key: string;
  confidence: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Topics whose name or alias appears in `text` as whole words, any case or accent ("Chess tournament" →
 * sports.chess). A child stands for its parent, so the parent is dropped when both match. One topic is a
 * sure match; several at once are each less sure. Hidden topics are never suggested.
 */
export function suggestTopics(text: string, topics: readonly Pick<TeamTopic, "key" | "parentKey" | "name" | "aliases" | "hidden">[]): TopicSuggestion[] {
  const folded = fold(text);
  const hit = topics.filter(
    (t) => !t.hidden && [t.name, ...t.aliases].some((n) => n.trim().length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(fold(n.trim()))}($|[^\\p{L}\\p{N}])`, "u").test(folded)),
  );
  const keys = hit.filter((t) => !hit.some((c) => c.parentKey === t.key)).map((t) => t.key);
  const confidence = keys.length === 1 ? 0.8 : 0.5;
  return keys.map((key) => ({ key, confidence }));
}

/**
 * Why a desk entry's topics can't be saved, or null. Events and places need at least one; an item may
 * have none. Every key must be a known topic.
 */
export function topicsProblem(entity: "event" | "place" | "item", keys: readonly string[], known: ReadonlySet<string>): string | null {
  const unknown = keys.find((k) => !known.has(k));
  if (unknown) return `unknown topic "${unknown}"`;
  if (entity !== "item" && keys.length === 0) return `Pick at least one topic for the ${entity}.`;
  return null;
}
