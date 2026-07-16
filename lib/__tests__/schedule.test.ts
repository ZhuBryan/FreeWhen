import { describe, it, expect } from "vitest";
import {
  blocksForWeek,
  validateSchedule,
  weekdayForISODate,
  mondayOfISO,
  addWeeksISO,
  weekDatesISO,
  formatWeekRange,
} from "@/lib/schedule";
import type { Block } from "@/lib/types";

// Week of Mon 2026-07-13 … Sun 2026-07-19.
const WEEK = "2026-07-13";

const recurring: Block = { day: 0, start: 540, end: 600, label: "Standup" };
// 2026-07-15 is a Wednesday → day 2.
const datedThisWeek: Block = {
  day: 2,
  start: 600,
  end: 660,
  label: "Dentist",
  date: "2026-07-15",
};
// 2026-07-22 is a Wednesday in the *next* week.
const datedNextWeek: Block = {
  day: 2,
  start: 600,
  end: 660,
  label: "Next-week thing",
  date: "2026-07-22",
};

describe("blocksForWeek", () => {
  it("recurring blocks always appear", () => {
    expect(blocksForWeek([recurring], WEEK)).toEqual([recurring]);
    // Also appears in an unrelated week.
    expect(blocksForWeek([recurring], "2026-08-10")).toEqual([recurring]);
  });

  it("dated blocks appear only in their own week", () => {
    expect(blocksForWeek([datedThisWeek], WEEK)).toEqual([datedThisWeek]);
    expect(blocksForWeek([datedNextWeek], WEEK)).toEqual([]);
    expect(blocksForWeek([datedThisWeek], addWeeksISO(WEEK, 1))).toEqual([]);
  });

  it("merges recurring + in-week dated blocks", () => {
    const schedule = [recurring, datedThisWeek, datedNextWeek];
    expect(blocksForWeek(schedule, WEEK)).toEqual([recurring, datedThisWeek]);
  });
});

describe("week date helpers", () => {
  it("mondayOfISO returns the Monday of the containing week", () => {
    expect(mondayOfISO("2026-07-15")).toBe("2026-07-13"); // Wed → Mon
    expect(mondayOfISO("2026-07-13")).toBe("2026-07-13"); // Mon → Mon
    expect(mondayOfISO("2026-07-19")).toBe("2026-07-13"); // Sun → Mon
  });

  it("weekDatesISO lists Mon…Sun", () => {
    expect(weekDatesISO(WEEK)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
    ]);
  });

  it("formatWeekRange renders same-month and cross-month ranges", () => {
    expect(formatWeekRange("2026-07-13")).toBe("Jul 13 – 19");
    expect(formatWeekRange("2026-06-29")).toBe("Jun 29 – Jul 5");
  });
});

describe("validateSchedule — dated blocks", () => {
  it("accepts a dated block whose weekday matches its day", () => {
    const out = validateSchedule([datedThisWeek]);
    expect(out).toEqual([datedThisWeek]);
  });

  it("keeps existing undated (recurring) blocks valid", () => {
    expect(validateSchedule([recurring])).toEqual([recurring]);
  });

  it("rejects a dated block whose weekday does not match its day", () => {
    expect(() =>
      validateSchedule([{ ...datedThisWeek, day: 0 }]),
    ).toThrow(/weekday must match/i);
  });

  it("rejects an impossible calendar date", () => {
    expect(() =>
      validateSchedule([{ day: 6, start: 0, end: 60, label: "x", date: "2026-02-30" }]),
    ).toThrow(/real YYYY-MM-DD/i);
  });

  it("rejects a badly formatted date", () => {
    expect(() =>
      validateSchedule([{ day: 0, start: 0, end: 60, label: "x", date: "2026-7-1" }]),
    ).toThrow(/real YYYY-MM-DD/i);
  });
});

describe("weekdayForISODate", () => {
  it("maps known dates (0=Mon)", () => {
    expect(weekdayForISODate("2026-07-13")).toBe(0); // Mon
    expect(weekdayForISODate("2026-07-19")).toBe(6); // Sun
  });
  it("returns null for invalid dates", () => {
    expect(weekdayForISODate("2026-13-01")).toBeNull();
    expect(weekdayForISODate("nope")).toBeNull();
  });
});
