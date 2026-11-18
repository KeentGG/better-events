import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Car,
  CircleSlash,
  Clock,
  CloudSun,
  Dices,
  Lightbulb,
  ListOrdered,
  MapPin,
  MapPinPlus,
  Megaphone,
  PartyPopper,
  RefreshCw,
  Shield,
  Ticket,
  TicketPercent,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { teamFetch } from "../../lib/team";
import { PROMO_KIND, type TeamEvent, type UpdateKey } from "../../lib/types";
import { GuideEditor, NewTip } from "../team/GuideEditor";
import { EventEditor, PlaceEditor, PlacesEditor } from "../team/ListEditors";
import { CrowdForm, EventChangeForm, NoticeForm, TrafficForm, WinnersForm, type EventChange, type NoticeCategory } from "../team/UpdateForms";

/** What a form update gets from the slide-over it opens in. */
export interface UpdateContext {
  token: string;
  /** The whole schedule, or undefined while it loads. */
  events: TeamEvent[] | undefined;
  /** Called with the published headline or the saved event or place's name. */
  onDone: (title: string) => void;
  onCancel: () => void;
  /** Opens the form that adds events, for a change to an event when there are none yet. */
  onAddEvents: () => void;
  /** Signed in as staff, who may post a hero banner. */
  staff: boolean;
}

/**
 * A desk form opened in a slide-over with its option picked; a staff action run from the tile, which
 * resolves to a line to show; or a link to a full editor.
 */
export type UpdateSpec = { label: string; icon: LucideIcon } & (
  /** The slide-over's title when the form can switch to other options than the button's. */
  | { kind: "form"; render: (ctx: UpdateContext) => ReactNode; title?: string }
  | { kind: "action"; run: (token: string) => Promise<string> }
  | { kind: "link"; href: string }
);

const notice = (category: NoticeCategory) => (c: UpdateContext) => (
  <NoticeForm bare token={c.token} onDone={c.onDone} fixedCategory={category} staff={c.staff} onAddEvent={c.onAddEvents} />
);
const eventChange = (change: EventChange) => (c: UpdateContext) => (
  <EventChangeForm bare token={c.token} events={c.events} onDone={c.onDone} onAddEvents={c.onAddEvents} initialChange={change} staff={c.staff} />
);
const newEvent = (c: UpdateContext) => <EventEditor bare token={c.token} onDone={c.onDone} onCancel={c.onCancel} />;
/** A new place, of `kind` (a kind key) when the button already says what it adds. */
const newPlace = (kind?: string) => (c: UpdateContext) => (
  <PlaceEditor bare token={c.token} onDone={c.onDone} onCancel={c.onCancel} initialKind={kind} />
);

/** Every update Update mode can offer (UPDATES in src/lib/types.ts), as the wall shows and opens it. */
export const UPDATE_SPECS: Record<UpdateKey, UpdateSpec> = {
  weather_notice: { label: "Post weather notice", icon: CloudSun, kind: "form", render: notice("weather") },
  "refresh:open-meteo": {
    label: "Refresh now",
    icon: RefreshCw,
    kind: "action",
    run: async (token) => {
      const { ok } = await teamFetch<{ ok: boolean }>("/api/control/fetchers/open-meteo/retry", token, { method: "POST" });
      if (!ok) throw new Error("Open-Meteo failed again. The error is on the Weather tile.");
      return "Open-Meteo refreshed";
    },
  },
  delay: { label: "Delay", icon: Clock, kind: "form", render: eventChange("retime"), title: "Change an event" },
  cancellation: { label: "Cancel event", icon: CircleSlash, kind: "form", render: eventChange("cancel"), title: "Change an event" },
  venue_change: { label: "Change venue", icon: MapPin, kind: "form", render: eventChange("venue"), title: "Change an event" },
  back_on_schedule: { label: "Back on schedule", icon: CalendarCheck, kind: "form", render: eventChange("retime"), title: "Change an event" },
  schedule_add: { label: "Add event", icon: CalendarPlus, kind: "form", render: newEvent },
  schedule_manage: { label: "Open the schedule editor", icon: CalendarDays, kind: "link", href: "#/team/schedule" },
  traffic_level: { label: "Update traffic", icon: Car, kind: "form", render: (c) => <TrafficForm bare token={c.token} onDone={c.onDone} staff={c.staff} /> },
  crowd_level: { label: "Crowd level", icon: Users, kind: "form", render: (c) => <CrowdForm bare token={c.token} onDone={c.onDone} /> },
  safety_notice: { label: "Post safety notice", icon: Shield, kind: "form", render: notice("crime_safety") },
  announcement: { label: "Post announcement", icon: Megaphone, kind: "form", render: notice("announcement") },
  activity: { label: "Post activity", icon: PartyPopper, kind: "form", render: notice("activity") },
  place_add: { label: "Add a place", icon: MapPinPlus, kind: "form", render: newPlace() },
  // Opened on the wall, so "booth moved" or "fix this tip" doesn't take the volunteer off it.
  places_manage: { label: "Manage places", icon: ListOrdered, kind: "form", render: (c) => <PlacesEditor token={c.token} /> },
  raffle: { label: "Post raffle", icon: Ticket, kind: "form", render: notice("raffle") },
  sponsor_game: { label: "Post sponsor game", icon: Dices, kind: "form", render: notice("sponsor_game") },
  winners_post: {
    label: "Post winners",
    icon: Trophy,
    kind: "form",
    render: (c) => <WinnersForm bare token={c.token} events={c.events ?? []} onDone={c.onDone} staff={c.staff} />,
  },
  promo: { label: "Announce a promo", icon: TicketPercent, kind: "form", render: notice("promo") },
  place_promo: { label: "Add promo spot", icon: MapPinPlus, kind: "form", render: newPlace(PROMO_KIND) },
  tip_add: { label: "Add tip", icon: Lightbulb, kind: "form", render: (c) => <NewTip bare token={c.token} onDone={c.onDone} onCancel={c.onCancel} /> },
  tips_manage: { label: "Manage tips", icon: ListOrdered, kind: "form", render: (c) => <GuideEditor token={c.token} /> },
};

/** Whether `#/control/<key>` names a form to open in a slide-over. */
export const isUpdateForm = (key: UpdateKey) => UPDATE_SPECS[key].kind === "form";
