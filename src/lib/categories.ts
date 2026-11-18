import {
  AlertTriangle,
  CalendarClock,
  Car,
  CircleSlash,
  Clock,
  CloudSun,
  Construction,
  Crown,
  Drama,
  Gift,
  Megaphone,
  Music,
  Palette,
  PartyPopper,
  Route,
  Shield,
  Martini,
  Medal,
  Store,
  Trophy,
  Utensils,
  Newspaper,
  Dices,
  TicketPercent,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { BadgeTone } from "../ui";
import type { Category, EventKind } from "./types";

export const categoryMeta: Record<Category, { label: string; icon: LucideIcon; tone: BadgeTone }> = {
  announcement: { label: "Announcement", icon: Megaphone, tone: "brand" },
  schedule_change: { label: "Schedule change", icon: CalendarClock, tone: "warn" },
  delay: { label: "Delay", icon: Clock, tone: "warn" },
  cancellation: { label: "Cancelled", icon: CircleSlash, tone: "danger" },
  winner: { label: "Winners", icon: Trophy, tone: "gold" },
  traffic_advisory: { label: "Traffic advisory", icon: Car, tone: "info" },
  road_closure: { label: "Road closure", icon: Construction, tone: "danger" },
  road_reopening: { label: "Road reopened", icon: Route, tone: "ok" },
  traffic_sentiment: { label: "Traffic", icon: Car, tone: "warn" },
  weather: { label: "Weather", icon: CloudSun, tone: "info" },
  crime_safety: { label: "Safety", icon: Shield, tone: "danger" },
  kiosk: { label: "Kiosk", icon: Store, tone: "neutral" },
  raffle: { label: "Raffle", icon: Gift, tone: "gold" },
  activity: { label: "Activity", icon: PartyPopper, tone: "brand" },
  third_party_event: { label: "Community event", icon: Ticket, tone: "info" },
  sponsor_game: { label: "Sponsor game", icon: Dices, tone: "gold" },
  promo: { label: "Promo", icon: TicketPercent, tone: "gold" },
  other: { label: "News", icon: Newspaper, tone: "neutral" },
};

/** Chips shown above the feed; each groups one or more categories. */
export const feedFilters: Array<{ id: string; label: string; categories: Category[] | null }> = [
  { id: "all", label: "All", categories: null },
  { id: "events", label: "Events", categories: ["announcement", "schedule_change", "delay", "cancellation", "activity", "third_party_event"] },
  { id: "traffic", label: "Traffic", categories: ["traffic_advisory", "road_closure", "road_reopening", "traffic_sentiment"] },
  { id: "winners", label: "Winners", categories: ["winner"] },
  { id: "kiosks", label: "Promos & games", categories: ["kiosk", "raffle", "sponsor_game", "promo"] },
  { id: "safety", label: "Safety", categories: ["crime_safety", "weather"] },
];

export const alertIcon = AlertTriangle;

export const eventKindMeta: Record<EventKind, { label: string; icon: LucideIcon }> = {
  parade: { label: "Parade", icon: Drama },
  competition: { label: "Competition", icon: Trophy },
  concert: { label: "Concert", icon: Music },
  nightlife: { label: "Nightlife", icon: Martini },
  bazaar: { label: "Bazaar", icon: Store },
  sports: { label: "Sports", icon: Medal },
  food: { label: "Food", icon: Utensils },
  workshop: { label: "Workshop", icon: Palette },
  ceremony: { label: "Ceremony", icon: Crown },
};
