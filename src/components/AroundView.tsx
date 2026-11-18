import { Banknote, Clock, DoorClosed, ExternalLink, FerrisWheel, HeartPulse, MapPin, ShieldUser, Shirt, Store, TicketPercent, Toilet, Utensils, type LucideIcon } from "lucide-react";
import { closedLabel, isClosedNow } from "../lib/places";
import { categoryMeta } from "../lib/categories";
import { href } from "../lib/route";
import { PROMO_KIND, type AroundPlace, type PlaceIcon, type PlaceKind } from "../lib/types";
import { Badge, type BadgeTone, CardSkeleton, Chip, cn, EmptyState, forYouClass, PreferredBadge, usePreferredTopic } from "../ui";

/** How each place kind icon is drawn (PLACE_ICONS). */
export const placeIcons: Record<PlaceIcon, { icon: LucideIcon; label: string }> = {
  promo: { icon: TicketPercent, label: "Promo" },
  ride: { icon: FerrisWheel, label: "Ride" },
  thrift: { icon: Shirt, label: "Clothes" },
  food: { icon: Utensils, label: "Food" },
  kiosk: { icon: Store, label: "Stall" },
  restroom: { icon: Toilet, label: "Restroom" },
  first_aid: { icon: HeartPulse, label: "First aid" },
  police: { icon: ShieldUser, label: "Police" },
  atm: { icon: Banknote, label: "Cash" },
  pin: { icon: MapPin, label: "Pin" },
};

const kindTone = (k: PlaceKind): BadgeTone => (k.key === PROMO_KIND ? "gold" : k.services ? "info" : "neutral");

/** The kinds that have places, festival spots first and services after, each group by name. */
function kindsOf(places: AroundPlace[]) {
  const kinds = new Map(places.map((p) => [p.kind.key, p.kind]));
  return [...kinds.values()].sort((a, b) => Number(a.services) - Number(b.services) || a.name.localeCompare(b.name));
}

export function PlaceCard({ p }: { p: AroundPlace }) {
  const k = p.kind;
  const forYou = usePreferredTopic(p.topics);
  const Icon = placeIcons[k.icon].icon;
  const closed = isClosedNow(p.closedUntil);
  return (
    <article className={cn("flex h-full flex-col gap-2 rounded-card border border-line bg-surface-raised p-4 shadow-card", forYouClass(forYou), closed && "border-dashed")}>
      <div className="flex items-center justify-between gap-2">
        <Badge topic tone={kindTone(k)} icon={<Icon aria-hidden />}>
          {k.name}
        </Badge>
        <PreferredBadge topic={forYou} />
      </div>
      <h3 className="text-[1.0625rem] leading-snug font-semibold text-balance">{p.title}</h3>
      {closed && (
        <p className="inline-flex items-center gap-1.5 self-start rounded-control bg-warn-soft px-2 py-1 text-sm font-medium text-warn-ink">
          <DoorClosed className="size-4" aria-hidden /> {closedLabel(p.closedUntil!)}
        </p>
      )}
      {p.note && <p className="text-sm text-ink-muted">{p.note}</p>}
      {!!p.notices?.length && (
        <ul className="space-y-0.5 text-sm" aria-label={`Notices at ${p.title}`}>
          {p.notices.map((n) => (
            <li key={n.id}>
              <a className="text-ink-muted underline-offset-2 hover:text-primary-ink hover:underline" href={href({ tab: "now" })}>
                <span className="font-medium">{categoryMeta[n.category].label}:</span> {n.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs text-ink-muted">
        {p.pin ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${p.pin.lat},${p.pin.lng}`}
            target="_blank"
            rel="noreferrer"
            className="-my-1.5 inline-flex items-center gap-1 py-1.5 font-medium text-primary-ink underline-offset-2 hover:underline"
          >
            <MapPin className="size-3.5" aria-hidden /> {p.place}
            <span className="sr-only">, open in Google Maps</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {p.place}
          </span>
        )}
        {p.hours && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {p.hours}
          </span>
        )}
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="-my-1.5 inline-flex items-center gap-1 py-1.5 font-medium text-primary-ink underline-offset-2 hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> More info
          </a>
        )}
      </div>
    </article>
  );
}

function PlaceGrid({ places }: { places: AroundPlace[] }) {
  return (
    <ul className="auto-grid items-stretch [--min:17rem]">
      {places.map((p) => (
        <li key={p.id} className="h-full">
          <PlaceCard p={p} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything that isn't on the official schedule: promos, rides, thrift, food and kiosks, then the
 * services people look for (restrooms, first aid, police, ATMs). `kind` is a kind key from the route.
 */
export function AroundView({ places, kind, onKind }: { places: AroundPlace[] | undefined; kind: string | undefined; onKind: (k: string | undefined) => void }) {
  const kinds = kindsOf(places ?? []);
  const active = kinds.find((k) => k.key === kind);
  const shown = (places ?? []).filter((p) => !active || p.kind.key === active.key);
  const spots = shown.filter((p) => !p.kind.services);
  const services = shown.filter((p) => p.kind.services);

  return (
    <div className="space-y-5">
      <header className="max-w-2xl">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">Beyond the schedule</p>
        <h1 className="text-hero mt-2 font-display text-balance">Around the festival</h1>
        <p className="mt-1.5 text-ink-muted">Kiosk promos, carnival rides, thrift markets and food all over the city this week, plus restrooms, first aid and ATMs near the route.</p>
      </header>

      <div className="bleed-scroll flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Filter places">
        <Chip active={!active} onClick={() => onKind(undefined)}>
          All
        </Chip>
        {kinds.map((k) => {
          const Icon = placeIcons[k.icon].icon;
          return (
            <Chip key={k.key} active={active?.key === k.key} onClick={() => onKind(k.key)} icon={<Icon aria-hidden />} count={places?.filter((p) => p.kind.key === k.key).length}>
              {k.plural}
            </Chip>
          );
        })}
      </div>

      {!places ? (
        <CardSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState icon={Store} title="Nothing listed yet">
          New spots show up here as organisers and vendors post them.
        </EmptyState>
      ) : (
        <>
          {spots.length > 0 && <PlaceGrid places={spots} />}
          {services.length > 0 && (
            <section aria-labelledby={active ? undefined : "services-title"} className="space-y-3">
              {/* Under a filter the chip already says what this is; on All, services get their own heading. */}
              {!active && (
                <h2 id="services-title" className="font-display text-title">
                  Services
                </h2>
              )}
              <PlaceGrid places={services} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
