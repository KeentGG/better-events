import { dailyLine } from "../lib/dailyWindow";
import { ExternalLink, MapPin, Megaphone, X } from "lucide-react";
import { useState } from "react";
import { categoryMeta } from "../lib/categories";
import { dayTime } from "../lib/time";
import type { FeedItem } from "../lib/types";
import { cn, forYouClass, IconButton, PreferredBadge, usePreferredTopic } from "../ui";
import { FeedBody, isUrgent } from "./FeedCard";

const KEY = "sm-dismissed-banners";

/**
 * The ticket's die-cut edge: small scallops down both sides, intersected with a large notch at the middle
 * of each. The scallops are centred on the notch, so the bites around it match. Layers composite
 * bottom-up: the two scalloped halves add into the whole ticket, then each notch cuts into it.
 */
const ticketEdge = {
  maskImage: [
    "radial-gradient(circle 0.875rem at 100% 50%, #0000 97%, #000)",
    "radial-gradient(circle 0.875rem at 0 50%, #0000 97%, #000)",
    "radial-gradient(circle 0.25rem at right, #0000 97%, #000)",
    "radial-gradient(circle 0.25rem at left, #0000 97%, #000)",
  ].join(", "),
  maskPosition: "0 0, 0 0, right center, left center",
  maskSize: "100% 100%, 100% 100%, 51% 0.75rem, 51% 0.75rem",
  maskRepeat: "no-repeat, no-repeat, repeat-y, repeat-y",
  maskComposite: "intersect, intersect, add, add",
} as const;

/** Banner ids this device closed. Kept short, since only the latest few can still be showing. */
function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Whether this device closed the banner for `id`, so the page can show it in the feed instead. */
export function useDismissedBanner(id: string | undefined) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = () => {
    if (!id) return;
    const next = [id, ...dismissed.filter((d) => d !== id)].slice(0, 20);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private mode: it stays closed for this visit only.
    }
  };
  return [id ? dismissed.includes(id) : false, dismiss] as const;
}

/**
 * The hero banner: one notice staff want everyone to see now, full width above everything else on Now.
 * Drawn as a festival ticket: a gold stub with the notice's icon, torn along a perforation from the
 * notice itself, so it reads as "the thing to know right now" without borrowing the live-event card or
 * looking like an error. Urgent notices turn the stub red and say so. Readers can close it, and it stays
 * closed on their device.
 */
export function HeroBanner({
  item,
  onDismiss,
}: {
  item: FeedItem;
  onDismiss: () => void;
}) {
  const meta = categoryMeta[item.category];
  const Icon = meta?.icon ?? Megaphone;
  const label = meta?.label ?? "Announcement";
  const urgent = isUrgent(item);
  const forYou = usePreferredTopic(item.topics);
  const where = item.place
    ? `${item.place.name}${item.place.where && ` · ${item.place.where}`}`
    : item.area;
  return (
    // The shadow sits on a wrapper, since the mask that cuts the edge would clip it off the ticket itself.
    <div className="drop-shadow-[0_6px_14px_oklch(0.3_0.04_60/0.14)]">
      <section
        role={urgent ? "alert" : "region"}
        aria-label={label}
        style={ticketEdge}
        className={cn(
          "relative flex overflow-hidden rounded-md",
          urgent ? "bg-danger-soft" : "bg-accent-soft",
          forYouClass(forYou),
        )}
      >
        {/* The stub, torn off along a dashed perforation with a notch cut at each end */}
        <div
          aria-hidden
          className={cn(
            "relative flex w-[4.75rem] shrink-0 pl-3 flex-col items-center justify-center gap-1.5 border-r-2 border-dashed sm:w-28",
            urgent
              ? "border-surface bg-danger text-white"
              : "border-surface bg-accent text-[var(--color-gold-900)]",
          )}
        >
          <Icon className="size-7 sm:size-9" strokeWidth={1.75} />
          <span className="hidden text-[0.625rem] font-semibold tracking-[0.18em] uppercase sm:block">
            {urgent ? "Urgent" : "Now"}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 py-4 pr-12 pl-4 sm:py-5 sm:pl-6">
          <p
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
              urgent ? "text-danger-ink" : "text-accent-ink",
            )}
          >
            <span className="font-semibold tracking-[0.14em] uppercase">
              {urgent ? `Urgent · ${label}` : label}
            </span>
            {where && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {where}
              </span>
            )}
          </p>
          <h2 className="font-display text-2xl leading-tight font-semibold text-balance text-ink">
            {item.title}
          </h2>
          <FeedBody item={item} />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {item.endsAt && (
              <span className="font-medium text-ink">
                {item.formerEndsAt && (
                  <>
                    <span className="sr-only">was </span>
                    <s className="font-normal text-ink-muted">Until {dayTime(item.formerEndsAt)}</s>{" "}
                  </>
                )}
                {dailyLine(item) ?? `Until ${dayTime(item.endsAt)}`}
              </span>
            )}
            {item.timeChange && <span className="font-medium text-ink">{item.timeChange}</span>}
            {item.link && (
              <a
                className="-my-1.5 inline-flex items-center gap-1 py-1.5 font-medium text-primary-ink underline-offset-2 hover:underline"
                href={item.link}
                target="_blank"
                rel="noreferrer"
              >
                More info <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <span>{item.source.name}</span>
            <PreferredBadge topic={forYou} />
          </p>
        </div>
        <IconButton
          label="Close this banner"
          size="sm"
          icon={<X className="size-4" aria-hidden />}
          onClick={onDismiss}
          className="absolute top-2 right-2 text-ink-muted"
        />
      </section>
    </div>
  );
}
