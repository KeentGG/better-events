/** Mission control data, live or the sample, or `denied` when the signed-in person may not see it (403). */
export type Loaded<T> = { data: T; live: boolean; denied?: false } | { data: null; live: true; denied: true };

/**
 * Loads a mission control endpoint with a staff or team token. Falls back to `sample` when there is no
 * token (preview) or the API is not running, and calls `onUnauthorized` when the token is rejected. A
 * staff-only route asked for with a team token comes back denied, never as sample data.
 */
export async function loadControl<T>(path: string, token: string | undefined, sample: T, onUnauthorized: () => void): Promise<Loaded<T>> {
  const fallback = { data: sample, live: false };
  if (!token) return fallback;
  try {
    const res = await fetch(path, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (res.status === 401) {
      onUnauthorized();
      return fallback;
    }
    if (res.status === 403) return { data: null, live: true, denied: true };
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return fallback;
    return { data: (await res.json()) as T, live: true };
  } catch {
    return fallback;
  }
}

/** A duration as its largest unit: 47m, 2h, 3d. */
export function span(ms: number) {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / (24 * 60))}d`;
}
