import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { FeedItem, Tier } from "../../lib/types";
import { Alert, SegmentedControl } from "../../ui";

export type Announce = "feed" | "pinned" | "hero";
const announceTier: Record<Announce, Tier> = { feed: 0, pinned: 1, hero: 2 };
const announceHint: Record<Announce, string> = {
  feed: "A card in the feed, newest first.",
  pinned: "Stays at the top of Now until it ends. The newest three pins show; older ones fall back to the feed.",
  hero: "A full-width banner at the top of Now, one at a time. It replaces any banner up now, which becomes pinned.",
};

/**
 * The Announce as choice every desk form shares: Feed, Pinned or (for staff) Banner. Picking Banner looks up the
 * banner up now, and posting waits until the person confirms replacing it. `check(until)` validates the end a
 * pin or banner needs; `field` is the control to render, and `tier` is what to send. A `visitor` (the
 * Contribute page) gets no choice: whoever approves the suggestion decides how loud it is.
 */
export function useAnnounce(staff?: boolean, suggested: Announce = "feed", visitor = false) {
  if (visitor) suggested = "feed";
  const [announce, setAnnounce] = useState<Announce>(suggested);
  const [touched, setTouched] = useState(false);
  // undefined while it loads. Without the live API there is nothing to replace.
  const [current, setCurrent] = useState<FeedItem | null>();
  const [replace, setReplace] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const loud = announce !== "feed";

  // A bigger change suggests Pinned until the person picks for themselves.
  useEffect(() => {
    if (!touched) setAnnounce(suggested);
  }, [suggested, touched]);

  useEffect(() => {
    if (announce !== "hero") return;
    let stale = false;
    setCurrent(undefined);
    setReplace(false);
    void api.feedTop().then((r) => !stale && setCurrent(r.live ? r.data.hero : null));
    return () => {
      stale = true;
    };
  }, [announce]);

  const replacing = announce === "hero" && Boolean(current);

  /** The error for the Until field, and whether the form must stop (a banner still to be confirmed). */
  function check(until: string) {
    const blocked = announce === "hero" && (current === undefined || (Boolean(current) && !replace));
    setUnconfirmed(blocked);
    return {
      until: loud && !until ? `Pick when it ends, so the ${announce === "hero" ? "banner" : "pin"} comes down on its own.` : undefined,
      blocked,
    };
  }

  const field = visitor ? null : (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink" aria-hidden>
        Announce as
      </p>
      <SegmentedControl
        label="Announce as"
        value={announce}
        onChange={(value) => {
          setTouched(true);
          setAnnounce(value);
        }}
        options={[
          { value: "feed", label: "Feed" },
          { value: "pinned", label: "Pinned" },
          ...(staff ? [{ value: "hero" as const, label: "Banner" }] : []),
        ]}
      />
      <p className="text-sm text-ink-muted">{announceHint[announce]}</p>
      {replacing && current && (
        <Alert tone="warn" title="This replaces the banner up now">
          <p>
            "{current.title}" is the banner now. It drops to pinned.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="size-4" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace it
          </label>
          {unconfirmed && !replace && <p className="mt-1 text-sm text-danger-ink">Tick this to post the new banner.</p>}
        </Alert>
      )}
      {announce === "hero" && current === undefined && unconfirmed && <p className="text-sm text-danger-ink">Still checking the current banner. Try again in a moment.</p>}
    </div>
  );

  return { announce, tier: announceTier[announce], loud, check, field };
}
