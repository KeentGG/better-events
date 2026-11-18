import type { AroundPlace, PlaceKind, Tip, VisitSection } from "../lib/types";

// Placeholder content for the Around and Visit pages, shown when the API is not running.
// General guidance only: check routes, fares and times against official sources before relying on them.

// The kinds seeded in server/db/migrations/0015_place_kinds.sql, for the sample places.
const kind = {
  promo: { key: "promo", name: "Promo", plural: "Promos", icon: "promo", services: false },
  ride: { key: "ride", name: "Ride", plural: "Carnival rides", icon: "ride", services: false },
  thrift: { key: "thrift", name: "Thrift", plural: "Thrift and bazaars", icon: "thrift", services: false },
  food: { key: "food", name: "Food", plural: "Food", icon: "food", services: false },
  kiosk: { key: "kiosk", name: "Kiosk", plural: "Kiosks", icon: "kiosk", services: false },
  restroom: { key: "restroom", name: "Restroom", plural: "Restrooms", icon: "restroom", services: true },
  first_aid: { key: "first_aid", name: "First aid", plural: "First aid stations", icon: "first_aid", services: true },
} satisfies Record<string, PlaceKind>;

export const sampleAround: AroundPlace[] = [
  { id: "a1", kind: kind.promo, title: "Piaya and coffee, two for one", place: "Sample kiosk, Lacson St", hours: "Until 9 PM", note: "Show the festival wristband at the counter.", topics: ["promos"] },
  { id: "a2", kind: kind.ride, title: "Ferris wheel and carousel", place: "Carnival grounds, Reclamation Area", hours: "4 PM – midnight", note: "Rides close early if it rains.", topics: ["rides"] },
  { id: "a3", kind: kind.thrift, title: "Ukay-ukay night market", place: "Sample row behind the Public Plaza", hours: "6 PM – 1 AM", note: "Cash is easier; few stalls take e-wallets.", topics: ["thrift"] },
  { id: "a4", kind: kind.food, title: "Chicken inasal row", place: "Manokan Country", hours: "All day", note: "Busiest after the parades end.", topics: ["food"] },
  { id: "a5", kind: kind.kiosk, title: "Mask painting booth", place: "Public Plaza", hours: "10 AM – 6 PM", note: "Paint your own papier-mâché mask. Kids welcome.", topics: [] },
  { id: "a6", kind: kind.promo, title: "Festival shirt, 20% off", place: "Sample souvenir kiosk, Government Center", hours: "Until stocks last", note: null, topics: ["promos"] },
  { id: "a7", kind: kind.ride, title: "Bump cars and mini coaster", place: "Carnival grounds, Reclamation Area", hours: "4 PM – midnight", note: null, topics: ["rides"] },
  { id: "a8", kind: kind.food, title: "Sugar fair: muscovado, piaya, napoleones", place: "Bacolod Government Center", hours: "9 AM – 9 PM", note: "Pasalubong to bring home.", topics: ["food"] },
  { id: "a10", kind: kind.first_aid, title: "Red Cross first aid tent", place: "Sample corner, Lacson and 18th St", hours: "Parade days, 8 AM – midnight", note: "Water refills and heat help too.", topics: [] },
  { id: "a11", kind: kind.restroom, title: "Portable toilets", place: "Sample lot beside the Public Plaza", hours: "24 hours during the festival", note: "₱10 per use. Bring tissue.", topics: [] },
  { id: "a9", kind: kind.thrift, title: "Vintage and local makers bazaar", place: "Sample mall atrium, Lacson St", hours: "10 AM – 9 PM", note: null, topics: ["thrift"] },
];

export const sampleTips: Tip[] = [
  { id: "t1", icon: "water", title: "Bring water and a hat", body: "Parades run through the midday heat. Refill stations sit near the Plaza.", section: "tips-and-tricks" },
  { id: "t2", icon: "cash", title: "Carry small bills", body: "Kiosks and jeepneys rarely have change for 1,000 pesos.", section: "tips-and-tricks" },
  { id: "t3", icon: "rain", title: "Pack a light poncho", body: "October showers come fast. Umbrellas block the view in crowds.", section: "tips-and-tricks" },
  { id: "t4", icon: "meet", title: "Pick a meeting spot", body: "Signal drops near the parade route. Agree on a landmark first.", section: "tips-and-tricks" },
];

// The same content the tips migration (0013) seeds, for when the API isn't running.
export const sampleVisit: VisitSection[] = [
  {
    id: "getting-there",
    title: "Getting there",
    icon: "map",
    items: [
      { id: "v1", title: "By air", body: "Fly into Bacolod–Silay Airport, then take a shuttle or taxi into the city. Allow about 45 minutes.", icon: null },
      { id: "v2", title: "By sea from Iloilo", body: "Fast craft ferries cross the Guimaras Strait to Bacolod in about an hour.", icon: null },
      { id: "v3", title: "Around the city", body: "Jeepneys follow Lacson and Araneta St. Roads near the parade route close on dance days, so walk the last stretch.", icon: null },
    ],
  },
  {
    id: "what-to-do",
    title: "What to do",
    icon: "compass",
    items: [
      { id: "v4", title: "Watch the street dance", body: "Get to Lacson St early for a spot in the shade. The main groups pass mid-afternoon.", icon: null },
      { id: "v5", title: "Make a mask", body: "Workshops at the Public Plaza let you paint your own, like the first MassKara in 1980.", icon: null },
      { id: "v6", title: "Eat like a local", body: "Chicken inasal at Manokan Country, then piaya and napoleones for pasalubong.", icon: null },
      { id: "v7", title: "Stay for Electric MassKara", body: "The night parade lights up Lacson St with LED costumes.", icon: null },
    ],
  },
  {
    id: "good-to-know",
    title: "Good to know",
    icon: "help",
    items: [
      { id: "v8", title: "First aid", body: "Medical tents stand along the parade route and at the Public Plaza.", icon: null },
      { id: "v9", title: "Lost and found", body: "Ask at the festival information booth near the Government Center.", icon: null },
      { id: "v10", title: "Emergency", body: "Dial 911 for police, fire or ambulance anywhere in the Philippines.", icon: null },
    ],
  },
  {
    id: "tips-and-tricks",
    title: "Tips and tricks",
    icon: "sun",
    items: sampleTips.map(({ id, title, body, icon }) => ({ id, title, body, icon })),
  },
];
