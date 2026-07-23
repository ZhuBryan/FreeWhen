import { describe, it, expect } from "vitest";
import { parseQuest } from "@/lib/parseQuest";
import { validateSchedule } from "@/lib/schedule";

// Helper: find a course by code.
const byCode = <T extends { code: string }>(courses: T[], code: string): T =>
  courses.find((c) => c.code === code)!;

// (a) Clean tab-separated Quest list view: 5 courses, TTh + MWF, LEC+TUT.
const CLEAN = [
  "CS 350 - Operating Systems",
  "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
  "1234\t001\tLEC\tMWF 10:30AM - 11:20AM\tMC 4021\tJ. Doe\t01/06/2025 - 04/04/2025",
  "5678\t101\tTUT\tTh 2:30PM - 3:20PM\tMC 2038\tA. Smith\t01/06/2025 - 04/04/2025",
  "MATH 239 - Introduction to Combinatorics",
  "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
  "2345\t001\tLEC\tTTh 1:00PM - 2:20PM\tMC 1085\tB. Lee\t01/06/2025 - 04/04/2025",
  "STAT 230 - Probability",
  "3456\t001\tLEC\tMWF 9:30AM - 10:20AM\tSTC 0060\tC. Wong\t01/06/2025 - 04/04/2025",
  "PHYS 234 - Quantum Physics 1",
  "4567\t001\tLEC\tTTh 8:30AM - 9:50AM\tPHY 145\tD. Kim\t01/06/2025 - 04/04/2025",
  "ENGL 210F - Genres of Technical Communication",
  "6789\t001\tLEC\tMWF 12:30PM - 1:20PM\tHH 234\tE. Brown\t01/06/2025 - 04/04/2025",
].join("\n");

// (b) Newline-mangled version of the same first two courses (every tab -> newline).
const MANGLED = [
  "CS 350 - Operating Systems",
  "1234",
  "001",
  "LEC",
  "MWF 10:30AM - 11:20AM",
  "MC 4021",
  "J. Doe",
  "5678",
  "101",
  "TUT",
  "Th 2:30PM - 3:20PM",
  "MC 2038",
  "MATH 239 - Introduction to Combinatorics",
  "2345",
  "001",
  "LEC",
  "TTh 1:00PM - 2:20PM",
  "MC 1085",
].join("\n");

// (c) Schedule with a TBA row and an online course without times.
const WITH_TBA = [
  "CS 458 - Computer Security",
  "1111\t001\tLEC\tMWF 11:30AM - 12:20PM\tMC 4020\tF. Ng\t01/06/2025 - 04/04/2025",
  "2222\t101\tTUT\tTBA\tTBA\t \t01/06/2025 - 04/04/2025",
  "PD 11 - Processes for Technical Report Writing",
  "3333\t001\tLEC\tOnline TBA\t\tStaff",
].join("\n");

describe("parseQuest: clean tab-separated (a)", () => {
  const res = parseQuest(CLEAN);

  it("finds all 5 courses", () => {
    expect(res.courses.map((c) => c.code)).toEqual([
      "CS 350",
      "MATH 239",
      "STAT 230",
      "PHYS 234",
      "ENGL 210F",
    ]);
  });

  it("parses CS 350 LEC (MWF 10:30-11:20) and TUT (Th 2:30-3:20)", () => {
    const cs = byCode(res.courses, "CS 350");
    expect(cs.meetings).toHaveLength(2);
    const lec = cs.meetings[0];
    expect(lec.days).toEqual([0, 2, 4]);
    expect(lec.start).toBe(630);
    expect(lec.end).toBe(680);
    expect(lec.label).toBe("CS 350 LEC");
    const tut = cs.meetings[1];
    expect(tut.days).toEqual([3]);
    expect(tut.start).toBe(870);
    expect(tut.end).toBe(920);
    expect(tut.label).toBe("CS 350 TUT");
  });

  it("parses TTh afternoon (MATH 239 1:00-2:20 PM)", () => {
    const m = byCode(res.courses, "MATH 239").meetings[0];
    expect(m.days).toEqual([1, 3]);
    expect(m.start).toBe(780); // 1:00 PM
    expect(m.end).toBe(860); // 2:20 PM
  });

  it("handles 12:30 PM correctly (ENGL 210F)", () => {
    const m = byCode(res.courses, "ENGL 210F").meetings[0];
    expect(m.days).toEqual([0, 2, 4]);
    expect(m.start).toBe(750); // 12:30 PM
    expect(m.end).toBe(800); // 1:20 PM
  });

  it("produces one block per meeting-day with no warnings", () => {
    // 3 + 1 + 2 + 3 + 2 + 3 = 14
    expect(res.blocks).toHaveLength(14);
    expect(res.warnings).toEqual([]);
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 870,
      end: 920,
      label: "CS 350 TUT",
      room: "MC 2038",
    });
  });
});

describe("parseQuest: newline-mangled (b)", () => {
  const res = parseQuest(MANGLED);

  it("still recovers the same CS 350 meetings via lookback", () => {
    const cs = byCode(res.courses, "CS 350");
    expect(cs.meetings).toHaveLength(2);
    expect(cs.meetings[0]).toMatchObject({
      days: [0, 2, 4],
      start: 630,
      end: 680,
      label: "CS 350 LEC",
    });
    expect(cs.meetings[1]).toMatchObject({
      days: [3],
      start: 870,
      end: 920,
      label: "CS 350 TUT",
    });
  });

  it("recovers MATH 239 TTh 1:00-2:20 PM", () => {
    const m = byCode(res.courses, "MATH 239").meetings[0];
    expect(m.days).toEqual([1, 3]);
    expect(m.start).toBe(780);
    expect(m.end).toBe(860);
  });
});

describe("parseQuest: TBA + online rows (c)", () => {
  const res = parseQuest(WITH_TBA);

  it("keeps the timed LEC and skips TBA/online with no warnings", () => {
    expect(res.blocks).toHaveLength(3); // MWF of CS 458
    expect(res.warnings).toEqual([]);
    const cs = byCode(res.courses, "CS 458");
    expect(cs.meetings).toHaveLength(1);
    expect(cs.meetings[0]).toMatchObject({
      days: [0, 2, 4],
      start: 690, // 11:30 AM
      end: 740, // 12:20 PM
      label: "CS 458 LEC",
    });
  });

  it("still lists the online course as a course with no meetings", () => {
    const pd = byCode(res.courses, "PD 11");
    expect(pd.meetings).toHaveLength(0);
  });
});

describe("parseQuest: warnings", () => {
  it("warns when end is not after start", () => {
    const res = parseQuest(
      ["CS 246 - OOP", "9999\t001\tLEC\tMWF 3:00PM - 2:00PM\tMC 4040"].join("\n"),
    );
    expect(res.blocks).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

// (d) Modern Quest vertical layout: one line per field, with rooms and
// start/end dates. Includes single-day exam sittings (TST) that must become
// one-off dated blocks, and a final sitting whose class-nbr/section/component
// lines are blank (so it falls back to the bare course code).
const VERTICAL = `CS 245 - Logic & Computation
Status\tUnits\tGrading\tGrade\tDeadlines
Enrolled
0.50
Numeric Grading Basis
Academic Calendar Deadlines
Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date
6236
004
LEC
TTh 2:30PM - 3:50PM
MC 1056
Lila Kari
09/09/2026 - 12/08/2026
6436
105
TUT
F 1:30PM - 2:20PM
MC 4060
To be Announced
09/09/2026 - 12/08/2026
6530
201
TST
Th 4:30PM - 6:20PM
TBA
Dalibor Dvorski
10/29/2026 - 10/29/2026
STAT 230 - Probability
Status\tUnits\tGrading\tGrade\tDeadlines
Enrolled
0.50
Numeric Grading Basis
Academic Calendar Deadlines
Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date
6031
101
TUT
F 3:30PM - 4:20PM
UTD 105
Diana Skrzydlo
09/09/2026 - 12/08/2026
6534
003
LEC
MWF 11:30AM - 12:20PM
DC 1351
Cecilia Cotton
09/09/2026 - 12/08/2026
6538
201
TST
Th 4:30PM - 6:20PM
TBA
To be Announced
10/08/2026 - 10/08/2026

 \t

Th 4:30PM - 6:20PM
TBA
To be Announced
11/19/2026 - 11/19/2026`;

describe("parseQuest: vertical layout with rooms + dated sittings (d)", () => {
  const res = parseQuest(VERTICAL);

  it("keeps CS 245 LEC recurring on Tue/Thu with its room", () => {
    expect(res.blocks).toContainEqual({
      day: 1,
      start: 870,
      end: 950,
      label: "CS 245 LEC",
      room: "MC 1056",
    });
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 870,
      end: 950,
      label: "CS 245 LEC",
      room: "MC 1056",
    });
  });

  it("keeps CS 245 TUT recurring on Fri with its room", () => {
    expect(res.blocks).toContainEqual({
      day: 4,
      start: 810,
      end: 860,
      label: "CS 245 TUT",
      room: "MC 4060",
    });
  });

  it("turns the three exam sittings into dated one-offs with no room", () => {
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 990,
      end: 1100,
      label: "CS 245 TST",
      date: "2026-10-29",
    });
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 990,
      end: 1100,
      label: "STAT 230 TST",
      date: "2026-10-08",
    });
    // The final sitting has blank nbr/section/component lines, so its label
    // falls back to the bare course code.
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 990,
      end: 1100,
      label: "STAT 230",
      date: "2026-11-19",
    });
  });

  it("captures the STAT 230 LEC room", () => {
    expect(res.blocks).toContainEqual({
      day: 0,
      start: 690,
      end: 740,
      label: "STAT 230 LEC",
      room: "DC 1351",
    });
  });

  it("produces only schedule-valid blocks", () => {
    // validateSchedule throws on any bad block (e.g. a dated weekday mismatch).
    expect(() => validateSchedule(res.blocks)).not.toThrow();
    expect(validateSchedule(res.blocks)).toHaveLength(res.blocks.length);
  });
});
