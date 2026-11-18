import { useEffect, useSyncExternalStore } from "react";
import { teamFetch } from "./team";
import type { TeamTopic } from "./types";

/*
 * Every topic, hidden ones included, as the desk's TopicPicker and the topics editor use them. Loaded
 * once per visit and shared like place kinds (src/lib/placeKinds.ts), so a topic added in one form shows
 * up in all of them straight away.
 */

let list: TeamTopic[] = [];
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: TeamTopic[]) {
  list = [...new Map(next.map((t) => [t.key, t])).values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  for (const l of listeners) l();
}

function load(token: string) {
  loading ??= teamFetch<TeamTopic[]>("/api/team/topics", token)
    .then((rows) => set([...list, ...rows]))
    .catch(() => {
      // Try again next time a form opens.
      loading = undefined;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every topic in order, loading them on first use. Empty until they arrive. */
export function useTopics(token: string) {
  useEffect(() => load(token), [token]);
  return useSyncExternalStore(subscribe, () => list);
}

/** Adds a topic (under `parentKey`, or as a main topic), or finds the one with that name or alias. */
export async function addTopic(token: string, name: string, parentKey: string | null) {
  const topic = await teamFetch<TeamTopic>("/api/team/topics", token, { method: "POST", body: { name, parentKey } });
  set([...list, topic]);
  return topic;
}

/** Saves a staff edit to a topic. */
export async function saveTopic(token: string, topic: TeamTopic) {
  const { key, ...body } = topic;
  const saved = await teamFetch<TeamTopic>(`/api/team/topics/${encodeURIComponent(key)}`, token, { method: "PUT", body });
  set([...list.filter((t) => t.key !== key), saved]);
  return saved;
}

/** "Sports › Chess", or "Food" for a main topic. */
export function topicLabel(topic: TeamTopic, all: readonly TeamTopic[]) {
  const parent = topic.parentKey ? all.find((t) => t.key === topic.parentKey) : undefined;
  return parent ? `${parent.name} › ${topic.name}` : topic.name;
}
