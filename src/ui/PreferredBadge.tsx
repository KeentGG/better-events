import { useMemo } from "react";
import { matchTopic, topicIndex, usePreferences, useTopicTree } from "../lib/interests";

/** Name of the followed topic this content matches ("Chess"), or null. */
export function usePreferredTopic(topics: readonly string[] | undefined): string | null {
  const { topics: prefs } = usePreferences();
  const tree = useTopicTree();
  const names = useMemo(() => topicIndex(tree), [tree]);
  const hit = matchTopic(prefs, topics);
  return hit ? (names.get(hit)?.name ?? hit) : null;
}

/** Card class for content the visitor follows: the blue corner pattern (see .for-you in index.css). */
export function forYouClass(topic: string | null) {
  return topic ? "for-you" : undefined;
}

/** Screen-reader text for the corner pattern, which is purely visual. */
export function PreferredBadge({ topic }: { topic: string | null }) {
  if (!topic) return null;
  return <span className="sr-only">For you: {topic}</span>;
}
