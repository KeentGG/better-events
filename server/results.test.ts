import { describe, expect, it } from "vitest";
import { planResults } from "./results";

const now = new Date("2026-10-18T01:00:00.000Z");
const contestId = "11111111-1111-4111-8111-111111111111";

describe("planResults", () => {
  it("numbers plain places and keeps a written label", () => {
    expect(
      planResults(
        null,
        {
          contest: "Mask-making",
          places: ["Brgy 16", "Brgy Taculing", "Brgy Mandalagan", { label: "Best Costume", name: "Brgy 16" }],
          note: "Crowd cheered",
        },
        now,
      ),
    ).toEqual({
      stage: "final",
      rows: [
        { label: "1st", name: "Brgy 16" },
        { label: "2nd", name: "Brgy Taculing" },
        { label: "3rd", name: "Brgy Mandalagan" },
        { label: "Best Costume", name: "Brgy 16" },
      ],
      title: "Winners: Mask-making",
      body: "1st: Brgy 16\n2nd: Brgy Taculing\n3rd: Brgy Mandalagan\nBest Costume: Brgy 16\n\nCrowd cheered",
      markDone: true,
      contestId: null,
    });
  });

  it("fills an empty label with the ordinal", () => {
    expect(
      planResults(null, { contest: "Raffle", places: [{ label: "  ", name: "#1234" }, { name: "#0088" }] }, now),
    ).toEqual({
      stage: "final",
      rows: [
        { label: "1st", name: "#1234" },
        { label: "2nd", name: "#0088" },
      ],
      title: "Winners: Raffle",
      body: "1st: #1234\n2nd: #0088",
      markDone: true,
      contestId: null,
    });
  });

  it("posts a placeholder when results aren't out", () => {
    expect(
      planResults(null, { contest: "Street dance", places: ["  "], pendingUntil: "2026-10-18T02:00:00.000Z" }, now),
    ).toEqual({
      stage: "pending",
      rows: [],
      title: "Results pending: Street dance",
      body: "Results expected 10:00 AM",
      markDone: false,
      contestId: null,
    });
  });

  it("keeps the contest id when replacing an earlier version", () => {
    expect(planResults({ contestId, stage: "pending", rows: [] }, { contest: "Street dance", places: ["Brgy Taculing"] }, now)).toEqual({
      stage: "final",
      rows: [{ label: "1st", name: "Brgy Taculing" }],
      title: "Results are in: Street dance",
      body: "1st: Brgy Taculing",
      markDone: true,
      contestId,
    });
  });

  it("treats places as final when a pending time is also sent", () => {
    expect(
      planResults(null, { contest: "Street dance", places: ["Brgy 16"], pendingUntil: "2026-10-18T02:00:00.000Z" }, now),
    ).toEqual({
      stage: "final",
      rows: [{ label: "1st", name: "Brgy 16" }],
      title: "Winners: Street dance",
      body: "1st: Brgy 16",
      markDone: true,
      contestId: null,
    });
  });

  it("refuses a post with no winner and no time", () => {
    expect(planResults(null, { contest: "Street dance", places: [] }, now)).toEqual({
      error: "needs at least one winner or a pending time",
    });
  });

  const posted = (stage: "final" | "standings" | "pending" | "corrected" | "revised" = "final") => ({
    contestId,
    stage,
    rows: [
      { label: "1st", name: "Ana", prize: "₱30k" },
      { label: "2nd", name: "Ben" },
      { label: "3rd", name: "Cy" },
    ],
  });

  it("keeps a prize, trimmed, and puts it in the body", () => {
    const plan = planResults(null, { contest: "Puppets", places: [{ name: "Ana", prize: " ₱30k " }, { name: "Ben", prize: "  " }] }, now);
    expect(plan).toMatchObject({ rows: [{ label: "1st", name: "Ana", prize: "₱30k" }, { label: "2nd", name: "Ben" }], body: "1st: Ana · ₱30k\n2nd: Ben" });
  });

  it("defaults to final first, then corrected after a final", () => {
    expect(planResults(null, { contest: "X", places: ["A"] }, now)).toMatchObject({ stage: "final" });
    expect(planResults(posted("pending"), { contest: "X", places: ["A"] }, now)).toMatchObject({ stage: "final", title: "Results are in: X" });
    expect(planResults(posted("standings"), { contest: "X", places: ["A"] }, now)).toMatchObject({ stage: "final", title: "Results are in: X" });
    expect(planResults(posted("final"), { contest: "X", places: ["Ana", "Ben", "Zed"] }, now)).toMatchObject({ stage: "corrected" });
    expect(planResults(posted("revised"), { contest: "X", places: ["Ana", "Ben", "Zed"] }, now)).toMatchObject({ stage: "corrected" });
  });

  it("posts standings without finishing the event", () => {
    expect(planResults(null, { contest: "Street dance", places: ["A", "B"], stage: "standings" }, now)).toMatchObject({
      stage: "standings",
      title: "Standings: Street dance",
      markDone: false,
    });
  });

  it("marks what was corrected and lists the changed labels", () => {
    const plan = planResults(posted(), { contest: "X", places: [{ name: "Ana", prize: "₱30k" }, "Dee", "Eve"], stage: "corrected" }, now);
    expect(plan).toEqual({
      stage: "corrected",
      rows: [
        { label: "1st", name: "Ana", prize: "₱30k" },
        { label: "2nd", name: "Dee", was: "Ben" },
        { label: "3rd", name: "Eve", was: "Cy" },
      ],
      title: "Results corrected: X",
      body: "Changed: 2nd, 3rd\n1st: Ana · ₱30k\n2nd: Dee (was Ben)\n3rd: Eve (was Cy)",
      markDone: true,
      contestId,
    });
  });

  it("titles a revision and handles a place added or removed", () => {
    const added = planResults(posted(), { contest: "X", places: [{ name: "Ana", prize: "₱30k" }, "Ben", "Cy", "Di"], stage: "revised" }, now);
    expect(added).toMatchObject({ title: "Results revised: X", body: expect.stringMatching(/^Changed: 4th\n/) });
    const removed = planResults(posted(), { contest: "X", places: [{ name: "Ana", prize: "₱30k" }, "Ben"], stage: "revised" }, now);
    expect(removed).toMatchObject({ body: expect.stringMatching(/^Changed: 3rd removed\n/) });
  });

  it("counts a changed prize as a change, and refuses when nothing differs", () => {
    expect(planResults(posted(), { contest: "X", places: [{ name: "Ana", prize: "₱40k" }, "Ben", "Cy"], stage: "corrected" }, now)).toMatchObject({ body: expect.stringMatching(/^Changed: 1st\n/) });
    expect(planResults(posted(), { contest: "X", places: [{ name: "Ana", prize: "₱30k" }, "Ben", "Cy"], stage: "corrected" }, now)).toEqual({
      error: "Nothing changed from the results already posted",
    });
  });

  it("refuses a correction with nothing earlier to correct", () => {
    expect(planResults(null, { contest: "X", places: ["A"], stage: "corrected" }, now)).toHaveProperty("error");
  });
});
