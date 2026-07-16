import { describe, it, expect } from "vitest";
import { parseGeneric } from "@/lib/parseGeneric";

describe("parseGeneric", () => {
  it("parses 'Work: Mon, Wed 9am - 5pm' with a leading label", () => {
    const blocks = parseGeneric("Work: Mon, Wed 9am - 5pm");
    expect(blocks).toEqual([
      { day: 0, start: 540, end: 1020, label: "Work" },
      { day: 2, start: 540, end: 1020, label: "Work" },
    ]);
  });

  it("parses a 24h range with no am/pm and no label → 'Busy'", () => {
    const blocks = parseGeneric("Mon 09:00-17:00");
    expect(blocks).toEqual([
      { day: 0, start: 540, end: 1020, label: "Busy" },
    ]);
  });

  it("parses 'Tuesday and Thursday 14:30-16:00 Volleyball'", () => {
    const blocks = parseGeneric("Tuesday and Thursday 14:30-16:00 Volleyball");
    expect(blocks).toEqual([
      { day: 1, start: 870, end: 960, label: "Volleyball" },
      { day: 3, start: 870, end: 960, label: "Volleyball" },
    ]);
  });

  it("returns no blocks for plain prose with no times", () => {
    const blocks = parseGeneric(
      "Let's grab coffee sometime next week to catch up on things.",
    );
    expect(blocks).toEqual([]);
  });

  it("parses multiple lines and dedupes identical blocks", () => {
    const blocks = parseGeneric(
      ["Gym Fri 6am-7am", "Gym Fri 6am-7am", "Study Sun 13:00-15:00"].join("\n"),
    );
    expect(blocks).toEqual([
      { day: 4, start: 360, end: 420, label: "Gym" },
      { day: 6, start: 780, end: 900, label: "Study" },
    ]);
  });
});
