import { BadgeCheck, ExternalLink, MapPin, ShieldCheck, Users } from "lucide-react";
import { categoryMeta } from "../lib/categories";
import { href } from "../lib/route";
import { rangeLine } from "../lib/dailyWindow";
import { dayTime, timeAgo } from "../lib/time";
import type { FeedItem } from "../lib/types";
import { ResultsList, StageTag } from "./ResultsList";
import { Badge, Card, cn, forYouClass, PreferredBadge, usePreferredTopic } from "../ui";

const urgentCategories = new Set<FeedItem["category"]>(["road_closure", "cancellation", "crime_safety"]);

/**
 * Closures, cancellations and safety notices stand out when they come from an official page or the team
 * desk (shown as staff), not from unverified crowd reports.
 */
export const isUrgent = (item: FeedItem) => urgentCategories.has(item.category) && item.trust !== "crowd";

/** The times readers first saw, struck through before the current ones, after a team member changed them. */
export function FormerTimes({ item }: { item: FeedItem }) {
  const former = [item.formerStartsAt && `From ${dayTime(item.formerStartsAt)}`, item.formerEndsAt && `${item.formerStartsAt ? "until" : "Until"} ${dayTime(item.formerEndsAt)}`].filter(Boolean).join(" ");
  if (!former) return null;
  return (
    <>
      <span className="sr-only">was </span>
      <s>{former}</s>{" "}
    </>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  const meta = categoryMeta[item.category];
  const Icon = meta.icon;
  const urgent = isUrgent(item);
  const forYou = usePreferredTopic(item.topics);

  return (
    <Card variant={urgent ? "highlight" : "raised"} className={cn("space-y-2.5", forYouClass(forYou))}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge topic tone={meta.tone} icon={<Icon aria-hidden />}>
          {meta.label}
        </Badge>
        <TrustBadge trust={item.trust} />
        <PreferredBadge topic={forYou} />
        {item.resolved && <Badge tone="ok">Resolved</Badge>}
        <p className="ml-auto shrink-0 text-xs text-ink-subtle">
          <time dateTime={item.publishedAt}>{timeAgo(item.publishedAt)}</time>
          {item.correctedAt && (
            <>
              {" · "}
              <time dateTime={item.correctedAt}>Corrected {dayTime(item.correctedAt)}</time>
            </>
          )}
        </p>
      </div>

      <div className="space-y-1">
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-balance">{item.title}</h3>
        <FeedBody item={item} />
        {item.followsUp && <p className="text-xs text-ink-subtle">Follow-up to: {item.followsUp.title}</p>}
        {item.event && (
          <p className="text-xs text-ink-subtle">
            During:{" "}
            <a className="font-medium text-primary-ink underline-offset-2 hover:underline" href={href({ tab: "schedule", detail: item.event.id })}>
              {item.event.title}
            </a>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs text-ink-muted">
        {item.place ? (
          <a
            href={item.place.pin ? `https://www.google.com/maps/search/?api=1&query=${item.place.pin.lat},${item.place.pin.lng}` : undefined}
            target="_blank"
            rel="noreferrer"
            className={cn("-my-1.5 inline-flex items-center gap-1 py-1.5", item.place.pin && "font-medium text-primary-ink underline-offset-2 hover:underline")}
          >
            <MapPin className="size-3.5" aria-hidden /> {item.place.name}
            {item.place.where && ` · ${item.place.where}`}
            {item.place.pin && <span className="sr-only">, open in Google Maps</span>}
          </a>
        ) : (
          item.area && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {item.area}
            </span>
          )
        )}
        {(item.startsAt || item.endsAt) && (
          <span>
            <FormerTimes item={item} />
            {rangeLine(item)}
          </span>
        )}
        {item.timeChange && <Badge tone="warn">{item.timeChange}</Badge>}
        {item.link && (
          <a className="-my-1.5 inline-flex items-center gap-1 py-1.5 font-medium text-primary-ink hover:underline" href={item.link} target="_blank" rel="noreferrer">
            More info <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {/* The source links to its own page, not to the link the team saved, which is labelled as one above. */}
        {item.source.url && item.source.url !== item.link ? (
          <a className="-my-1.5 ml-auto inline-flex items-center gap-1 py-1.5 font-medium text-primary-ink hover:underline" href={item.source.url} target="_blank" rel="noreferrer">
            {item.source.name} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : (
          <span className="ml-auto">{item.source.name}</span>
        )}
      </div>
    </Card>
  );
}

/** A winners post lists its results, with the desk's note beneath; anything else shows its body text. */
export function FeedBody({ item }: { item: FeedItem }) {
  const r = item.results;
  if (!r || (!r.rows.length && r.stage !== "pending")) return item.body ? <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{item.body}</p> : null;
  return (
    <div className="space-y-2 pt-0.5">
      <StageTag stage={r.stage} expectedAt={r.expectedAt} />
      <ResultsList rows={r.rows} />
      {r.note && <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{r.note}</p>}
    </div>
  );
}

/** Official > Verified by staff > Crowd-sourced (docs/MISSION_CONTROL.md §4.3). Only official is loud. */
function TrustBadge({ trust }: { trust: FeedItem["trust"] }) {
  if (trust === "official")
    return (
      <Badge tone="brand" variant="solid" icon={<BadgeCheck aria-hidden />}>
        Official
      </Badge>
    );
  if (trust === "staff")
    return (
      <Badge tone="ok" icon={<ShieldCheck aria-hidden />}>
        Verified by staff
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={<Users aria-hidden />}>
      Crowd-sourced
    </Badge>
  );
}
