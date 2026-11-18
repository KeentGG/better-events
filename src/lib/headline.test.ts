import { describe, expect, it } from "vitest";
import { fitHeadline, splitNotice } from "./headline";

// A long post must never lose words: what doesn't fit the headline leads the details.
describe("fitHeadline", () => {
  it("leaves a headline that fits alone", () => {
    expect(fitHeadline("  Free water at the Plaza ", " Until 5 PM ")).toEqual({ title: "Free water at the Plaza", body: "Until 5 PM" });
  });

  it("cuts a long one at a sentence end and keeps the rest", () => {
    const text =
      "Mega Puppets Competition on Oct 14, 4:00 PM at Plaza de MassKara. Prizes ₱30k/₱20k/₱10k for the top three barangays, judged on design and movement.";
    const { title, body } = fitHeadline(text, "Register at the tent.", 100);
    expect(title).toBe("Mega Puppets Competition on Oct 14, 4:00 PM at Plaza de MassKara.");
    expect(body).toBe("Prizes ₱30k/₱20k/₱10k for the top three barangays, judged on design and movement.\n\nRegister at the tent.");
  });

  it("cuts mid-sentence at a word, marking both halves, with no dangling bracket", () => {
    const text = "Lacson Tourism Strip MassKara 2026 with six major stages (Mt. Dew, TikTok, Chesterfield, San Miguel Beer, Bredco, Erceflora) and eleven activations";
    const { title, body } = fitHeadline(text, "", 60);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title).not.toMatch(/[(,]…$/);
    expect(body.startsWith("…")).toBe(true);
    // Every word survives across the two.
    expect(`${title.slice(0, -1)} ${body.slice(1)}`.replace(/\s+/g, " ")).toBe(text);
  });
});

describe("splitNotice", () => {
  it("takes the first line as the headline", () => {
    expect(splitNotice("Lost child found\nAt the 18th St tent.")).toEqual({ title: "Lost child found", body: "At the 18th St tent." });
  });

  it("keeps all of a one-line post that runs past 140 characters", () => {
    const text = `${"Long words here ".repeat(12)}and the end.`;
    const { title, body } = splitNotice(text);
    expect(title.length).toBeLessThanOrEqual(141);
    expect(body).toContain("and the end.");
  });
});
