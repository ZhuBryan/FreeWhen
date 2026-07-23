import { describe, it, expect } from "vitest";
import {
  bestTimes,
  blocksForWeek,
  buildGrid,
  validateSchedule,
  weekdayForISODate,
  mondayOfISO,
  addWeeksISO,
  weekDatesISO,
  formatWeekRange,
} from "@/lib/schedule";
import type { Block, PublicMember } from "@/lib/types";

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

describe("validateSchedule: dated blocks", () => {
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

// ---- view window + min-free windows ---------------------------------------

function member(id: string, schedule: Block[]): PublicMember {
  return { id, name: id, color: "#000", schedule };
}

describe("buildGrid with a custom view window", () => {
  it("sizes the grid to the window and ignores blocks outside it", () => {
    // Busy 7-8 AM only; window starts at 9 AM, so every slot is free.
    const m = member("a", [{ day: 0, start: 420, end: 480, label: "Gym" }]);
    const grid = buildGrid([m], { dayStart: 540, dayEnd: 720 }); // 9 AM-12 PM
    expect(grid[0]).toHaveLength(6); // 3 h / 30 min
    expect(grid[0].every((c) => c.freeCount === 1)).toBe(true);
  });

  it("still counts blocks overlapping the window edge", () => {
    // Busy 8:45-9:15; window 9 AM-10 PM → first slot busy.
    const m = member("a", [{ day: 0, start: 525, end: 555, label: "Lab" }]);
    const grid = buildGrid([m], { dayStart: 540, dayEnd: 1320 });
    expect(grid[0][0].freeCount).toBe(0);
    expect(grid[0][1].freeCount).toBe(1);
  });
});

describe("bestTimes with minFree", () => {
  // Three people. Mon: a busy 9-12, b busy 9-10, c always free.
  const a = member("a", [{ day: 0, start: 540, end: 720, label: "A" }]);
  const b = member("b", [{ day: 0, start: 540, end: 600, label: "B" }]);
  const c = member("c", []);

  it("default requires everyone and reports the head-count", () => {
    // Monday: everyone is only free 12 PM onward, no Monday window in 9-12.
    const w = bestTimes([a, b, c], { dayStart: 540, dayEnd: 720, limit: 50 });
    expect(w.filter((x) => x.day === 0)).toHaveLength(0);
    // Widen to 1 PM and Monday 12-1 qualifies, with everyone free.
    const w2 = bestTimes([a, b, c], { dayStart: 540, dayEnd: 780, limit: 50 });
    expect(w2.find((x) => x.day === 0)).toMatchObject({
      start: 720, end: 780, free: 3, total: 3,
    });
  });

  it("minFree relaxes the bar and free reports the guaranteed minimum", () => {
    const w = bestTimes([a, b, c], {
      dayStart: 540, dayEnd: 720, minFree: 2, limit: 50,
    });
    // Mon 9-10: only c free (1) → excluded. Mon 10-12: b + c free (2) → in.
    expect(w.find((x) => x.day === 0)).toMatchObject({
      start: 600, end: 720, free: 2, total: 3,
    });
  });

  it("a window spanning varying counts reports its minimum", () => {
    const w = bestTimes([a, b, c], {
      dayStart: 540, dayEnd: 780, minFree: 2, limit: 50,
    });
    // Mon 10-12 has 2 free, 12-1 has 3 → one 10 AM-1 PM run, guaranteed 2.
    expect(w.find((x) => x.day === 0)).toMatchObject({
      start: 600, end: 780, free: 2,
    });
  });

  it("minFree above the member count clamps to everyone", () => {
    const w = bestTimes([c], { dayStart: 540, dayEnd: 720, minFree: 99 });
    expect(w[0]).toMatchObject({ free: 1, total: 1 });
  });
});

// ---- date-range planning ---------------------------------------------------

import { blocksForDate, freeMembersDuring, planRange } from "@/lib/schedule";

function mk(id: string, schedule: Block[]): PublicMember {
  return { id, name: id.toUpperCase(), color: "#000", schedule };
}

describe("blocksForDate", () => {
  it("keeps recurring blocks on their weekday and dated blocks on their day", () => {
    const schedule = [recurring, datedThisWeek, datedNextWeek];
    // 2026-07-13 is a Monday → recurring (day 0) only.
    expect(blocksForDate(schedule, "2026-07-13")).toEqual([recurring]);
    // 2026-07-15 (Wed) → the dated block for that exact day.
    expect(blocksForDate(schedule, "2026-07-15")).toEqual([datedThisWeek]);
    // 2026-07-22 (next Wed) → the other dated block, not this week's.
    expect(blocksForDate(schedule, "2026-07-22")).toEqual([datedNextWeek]);
    // Tuesday → nothing.
    expect(blocksForDate(schedule, "2026-07-14")).toEqual([]);
  });

  it("returns [] for an invalid date", () => {
    expect(blocksForDate([recurring], "not-a-date")).toEqual([]);
  });
});

describe("freeMembersDuring", () => {
  it("returns only members with no overlapping block", () => {
    const busy = mk("busy", [
      { day: 0, start: 600, end: 720, label: "X" },
    ]);
    const free = mk("free", []);
    const names = freeMembersDuring([busy, free], 0, 630, 690).map((m) => m.id);
    expect(names).toEqual(["free"]);
    // Outside the block both are free.
    expect(freeMembersDuring([busy, free], 0, 720, 780)).toHaveLength(2);
  });
});

describe("planRange", () => {
  // p is busy Mon 9-12 recurring; q has a one-off Tue 2026-07-14 18:00-20:00.
  const p = mk("p", [{ day: 0, start: 540, end: 720, label: "Class" }]);
  const q = mk("q", [
    { day: 1, start: 1080, end: 1200, label: "Shift", date: "2026-07-14" },
  ]);

  it("scans each date with its own effective blocks", () => {
    const plans = planRange([p, q], "2026-07-13", 9, {
      minMinutes: 60,
      dayStart: 1020, // 5 PM
      dayEnd: 1320, // 10 PM
    });
    expect(plans).toHaveLength(9);
    // Tue Jul 14 evening: q's one-off blocks 6-8 PM → longest all-free window
    // is 8-10 PM (120 min).
    const tue = plans.find((x) => x.date === "2026-07-14")!;
    expect(tue.windows[0]).toMatchObject({ start: 1200, end: 1320, free: 2 });
    // Tue Jul 21: the one-off doesn't recur → whole evening free.
    const nextTue = plans.find((x) => x.date === "2026-07-21")!;
    expect(nextTue.windows[0]).toMatchObject({ start: 1020, end: 1320 });
  });

  it("windows never leak across dates", () => {
    const plans = planRange([p], "2026-07-13", 7, {
      minMinutes: 60,
      dayStart: 540,
      dayEnd: 720,
    });
    // Mon is fully busy for p → no window; every other day is fully open.
    const mon = plans.find((x) => x.date === "2026-07-13")!;
    expect(mon.windows).toEqual([]);
    expect(mon.freeNames).toEqual([]);
    for (const day of plans.filter((x) => x.date !== "2026-07-13")) {
      expect(day.windows[0]).toMatchObject({ start: 540, end: 720 });
      expect(day.day).toBe(weekdayForISODate(day.date));
    }
  });

  it("respects minFree and reports who is free for the best window", () => {
    const r = mk("r", [{ day: 0, start: 540, end: 720, label: "Also busy" }]);
    const plans = planRange([p, r, mk("s", [])], "2026-07-13", 1, {
      minMinutes: 60,
      minFree: 1,
      dayStart: 540,
      dayEnd: 720,
    });
    expect(plans[0].windows[0]).toMatchObject({ free: 1, total: 3 });
    expect(plans[0].freeNames).toEqual(["S"]);
  });
});

// ---- shared classes --------------------------------------------------------

import { sharedLabels } from "@/lib/schedule";

describe("sharedLabels", () => {
  it("groups members who share an identical recurring block", () => {
    const a = mk("a", [{ day: 0, start: 540, end: 600, label: "CS 350 LEC" }]);
    const b = mk("b", [{ day: 0, start: 540, end: 600, label: "CS 350 LEC" }]);
    const c = mk("c", []);
    expect(sharedLabels([a, b, c])).toEqual([
      { label: "CS 350 LEC", memberIds: ["a", "b"] },
    ]);
  });

  it("does not match when the times differ", () => {
    const a = mk("a", [{ day: 0, start: 540, end: 600, label: "CS 350 LEC" }]);
    const b = mk("b", [{ day: 0, start: 600, end: 660, label: "CS 350 LEC" }]);
    expect(sharedLabels([a, b])).toEqual([]);
  });

  it('excludes the generic "Busy" label', () => {
    const a = mk("a", [{ day: 0, start: 540, end: 600, label: "Busy" }]);
    const b = mk("b", [{ day: 0, start: 540, end: 600, label: "Busy" }]);
    expect(sharedLabels([a, b])).toEqual([]);
  });
});
