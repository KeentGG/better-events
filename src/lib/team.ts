import { useCallback, useEffect, useState } from "react";
import { turnstileToken } from "./turnstile";
import type { ControlMe, ControlRole } from "./types";

/** One token per person on this device, for the team desk, mission control and the curator inbox alike. */
const TOKEN_KEY = "sm.team.token";
/** Where tokens lived when staff and team members signed in separately; read once, then removed. */
const LEGACY_KEYS = ["sm.team.staff", "sm.team.collector"];

function readToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    const legacy = LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (legacy) localStorage.setItem(TOKEN_KEY, legacy);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    return legacy ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string | undefined) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the token lasts for this visit only.
  }
}

export interface TeamSession {
  token: string | undefined;
  /** From /api/control/me; undefined until it answers, and when the API can't be reached. */
  name: string | undefined;
  role: ControlRole | undefined;
  /** Whether /api/control/me has answered (or failed) for this token. */
  checked: boolean;
  /** Keeps a token that was just checked; `me` is what the check returned, if it has it. */
  signIn: (token: string, me?: ControlMe) => void;
  signOut: () => void;
}

/**
 * The signed-in person on this device: their token, name and role. The team pastes a token once,
 * whichever team page they open first. A rejected token signs out.
 */
export function useTeamSession(): TeamSession {
  const [token, setToken] = useState(readToken);
  const [me, setMe] = useState<{ token: string; me: ControlMe | null }>();

  const signIn = useCallback((next: string, known?: ControlMe) => {
    saveToken(next);
    setToken(next);
    if (known) setMe({ token: next, me: known });
  }, []);
  const signOut = useCallback(() => {
    saveToken(undefined);
    setToken(undefined);
    setMe(undefined);
  }, []);

  useEffect(() => {
    if (!token || me?.token === token) return;
    let cancelled = false;
    teamFetch<ControlMe>("/api/control/me", token)
      .then((next) => !cancelled && setMe({ token, me: next }))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof TeamApiError && err.status === 401) signOut();
        else setMe({ token, me: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token, me, signOut]);

  const current = me && me.token === token ? me : undefined;
  return { token, name: current?.me?.name, role: current?.me?.role, checked: Boolean(current), signIn, signOut };
}

export class TeamApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * What the Contribute page hands the desk's forms in place of a token. With it, a form reads the public
 * lists and everything it saves goes to the team as a suggestion instead of onto the site, so visitors
 * fill in the very forms the team uses (server/community.ts).
 */
export const COMMUNITY_TOKEN = "community";
/** Fired on `window` with the suggestion's one-line summary each time one is sent. */
export const SUGGESTION_SENT = "community:sent";

const offline = "Can't reach the server. Check your connection and try again.";

async function communityFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const desk = path.replace(/^\/api\/team/, "");
  const method = init?.method ?? "GET";
  if (method === "GET") {
    const res = await fetch(`/api/community/read${desk}`, { headers: { accept: "application/json" } }).catch(() => undefined);
    if (!res) throw new TeamApiError(0, offline);
    if (!res.ok) throw new TeamApiError(res.status, "Couldn't load this right now. Try again in a moment.");
    return (await res.json()) as T;
  }
  // New areas, kinds and topics would exist before anyone looked, so only the team adds them.
  if (/^\/(areas|place-kinds|topics)/.test(desk)) {
    throw new TeamApiError(403, "Only the team can add a new one. Pick the closest match and say exactly what you mean in the note.");
  }
  let token: string | undefined;
  try {
    token = await turnstileToken();
  } catch {
    throw new TeamApiError(403, "We couldn't confirm you're a person. Reload the page and try again.");
  }
  const res = await fetch("/api/community/submissions", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ method, path: desk, body: init?.body, turnstileToken: token }),
  }).catch(() => undefined);
  if (!res) throw new TeamApiError(0, offline);
  const data = (await res.json().catch(() => null)) as { id?: string; title?: string; error?: unknown } | null;
  if (!res.ok) throw new TeamApiError(res.status, typeof data?.error === "string" ? data.error : "Something in the form isn't right. Check the fields and try again.");
  window.dispatchEvent(new CustomEvent(SUGGESTION_SENT, { detail: data?.title ?? "" }));
  // Shaped like the desk's answers: nothing was published, so no ids.
  return { id: data?.id, ids: [], title: data?.title ?? "" } as T;
}

/** JSON request with a team token. Throws `TeamApiError` with a readable message on failure. */
export async function teamFetch<T>(path: string, token: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (token === COMMUNITY_TOKEN) return communityFetch<T>(path, init);
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init?.body !== undefined && { "content-type": "application/json" }) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new TeamApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json().catch(() => null) : null;
  if (res.ok) return data as T;
  if (res.status === 401) throw new TeamApiError(401, "That token isn't valid. Ask the site owner for a new one.");
  if (res.status === 503 || !data) throw new TeamApiError(res.status, "The server isn't ready (no database). Try again later.");
  const error = (data as { error?: unknown }).error;
  throw new TeamApiError(res.status, typeof error === "string" ? error : "Something in the form isn't right. Check the fields and try again.");
}
