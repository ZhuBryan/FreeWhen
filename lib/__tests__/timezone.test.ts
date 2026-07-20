import { describe, it, expect } from "vitest";
import { tzOffsetMinutes, isValidTimeZone, convertBlocks } from "@/lib/timezone";
import type { Block } from "@/lib/types";

// Fixed winter instant for deterministic offsets (no DST in play for these
// zones at this date): Toronto -300, Vancouver -480, UTC 0.
const AT = new Date("2026-01-15T12:00:00Z");

describe("tzOffsetMinutes", () => {
  it("UTC is always 0", () => {
    expect(tzOffsetMinutes("UTC", AT)).toBe(0);
  });

  it("Toronto is -300 (EST) at this instant", () => {
    expect(tzOffsetMinutes("America/Toronto", AT)).toBe(-300);
  });

  it("Vancouver is -480 (PST) at this instant", () => {
    expect(tzOffsetMinutes("America/Vancouver", AT)).toBe(-480);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone(123)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("x".repeat(65))).toBe(false);
  });
});

describe("convertBlocks", () => {
  const mon9to10: Block = { day: 0, start: 540, end: 600, label: "Standup" };

  it("is a no-op for identical timezones", () => {
    const out = convertBlocks([mon9to10], "America/Toronto", "America/Toronto", AT);
    expect(out).toEqual([mon9to10]);
  });

  it("is a no-op for invalid timezones", () => {
    const out = convertBlocks([mon9to10], "Not/AZone", "America/Toronto", AT);
    expect(out).toEqual([mon9to10]);
  });

  it("shifts Toronto 9-10am to Vancouver 6-7am (delta -180)", () => {
    const out = convertBlocks([mon9to10], "America/Toronto", "America/Vancouver", AT);
    expect(out).toEqual([{ day: 0, start: 360, end: 420, label: "Standup" }]);
  });

  it("Vancouver->Toronto Mon 21:00-23:00 shifts +180 into Tue 0:00-2:00", () => {
    const block: Block = { day: 0, start: 1260, end: 1380, label: "Movie" };
    const out = convertBlocks([block], "America/Vancouver", "America/Toronto", AT);
    expect(out).toEqual([{ day: 1, start: 0, end: 120, label: "Movie" }]);
  });

  it("Vancouver->Toronto Mon 22:00-23:30 shifts +180 into Tue 1:00-2:30", () => {
    const block: Block = { day: 0, start: 1320, end: 1410, label: "Call" };
    const out = convertBlocks([block], "America/Vancouver", "America/Toronto", AT);
    expect(out).toEqual([{ day: 1, start: 60, end: 150, label: "Call" }]);
  });

  it("splits a block that crosses midnight after the shift", () => {
    // Mon 20:00-23:00 (1200-1380) Vancouver -> Toronto, delta +180 -> 1380-1560.
    // Start (1380) stays Monday; end (1560) overflows past 1440 -> split.
    const block: Block = { day: 0, start: 1200, end: 1380, label: "Shift" };
    const out = convertBlocks([block], "America/Vancouver", "America/Toronto", AT);
    expect(out).toEqual([
      { day: 0, start: 1380, end: 1440, label: "Shift" },
      { day: 1, start: 0, end: 120, label: "Shift" },
    ]);
  });

  it("shifts a dated block's date forward on day-wrap, including on split", () => {
    // 2026-01-12 is a Monday.
    const block: Block = {
      day: 0,
      start: 1200,
      end: 1380,
      label: "Shift",
      date: "2026-01-12",
    };
    const out = convertBlocks([block], "America/Vancouver", "America/Toronto", AT);
    expect(out).toEqual([
      { day: 0, start: 1380, end: 1440, label: "Shift", date: "2026-01-12" },
      { day: 1, start: 0, end: 120, label: "Shift", date: "2026-01-13" },
    ]);
  });
});
