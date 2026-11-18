import { describe, expect, it } from "vitest";
import { classify, mentionedArea } from "./classify";

const category = (text: string) => classify(text).category;

describe("classify", () => {
  it("reads plain closure phrasing, not only 'road closure'", () => {
    expect(category("Lacson St closed from 6th to 21st St for the street dance starting 5PM")).toBe("road_closure");
    expect(category("Araneta Ave will be closed starting 4 PM")).toBe("road_closure");
    expect(category("Road closure on Burgos Ave")).toBe("road_closure");
  });

  it("does not call a reopening a closure", () => {
    expect(category("Lacson St reopened to traffic")).toBe("road_reopening");
  });

  it("finds promos, sponsor games and community events", () => {
    expect(category("Piaya promo: buy 1 take 1 at our kiosk until 9 PM")).toBe("promo");
    expect(category("Festival shirts 20% off this weekend")).toBe("promo");
    expect(category("Spin the wheel at the Smart booth and win prizes")).toBe("sponsor_game");
    expect(category("Night market at the Government Center grounds, Friday to Sunday")).toBe("third_party_event");
    expect(category("Open mic at Kahirup bar after the street dance")).toBe("third_party_event");
  });

  it("keeps the official programme as activity", () => {
    expect(category("Electric MassKara parade tonight")).toBe("activity");
  });
});

// People turn up at a set time for a sponsor's concert or party, so it is an event; a plain game or raffle stays one.
describe("classify sponsor posts", () => {
  it("files a sponsor's concert, show or party as a community event", () => {
    expect(classify("Pepsi presents the Plaza concert, Saturday 8 PM. Play and win prizes at the booth!").category).toBe("third_party_event");
    expect(classify("Raffle draw at the Smirnoff party night, 10 PM").category).toBe("third_party_event");
  });

  it("keeps a game or raffle with no event in it", () => {
    expect(classify("Sponsor game booth at Public Plaza: spin the wheel").category).toBe("sponsor_game");
    expect(classify("Raffle: win a TV, drawn Sunday").category).toBe("raffle");
  });

  it("leaves an official concert on the programme", () => {
    expect(classify("Concert at Panaad Park, gates open 5 PM").category).toBe("activity");
  });
});

describe("mentionedArea", () => {
  const areas = [
    { name: "Lacson St", aliases: [] },
    { name: "Lacson St Extension", aliases: [] },
    { name: "San Juan", aliases: ["Brgy. San Juan"] },
  ];
  const name = (text: string) => mentionedArea(text, areas)?.name;

  it("finds an area the team added, in any case", () => {
    expect(name("baha na sa san juan subong")).toBe("San Juan");
    expect(name("Traffic at BRGY. SAN JUAN")).toBe("San Juan");
  });

  it("prefers the longest name and needs whole words", () => {
    expect(name("closed: lacson st extension")).toBe("Lacson St Extension");
    expect(name("sanjuanico bridge")).toBeUndefined();
  });
});
