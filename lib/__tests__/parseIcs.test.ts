import { describe, it, expect } from "vitest";
import { parseIcs } from "@/lib/parseIcs";

// Fixed reference date for deterministic import-window behaviour.
// 2026-09-01 (a Tuesday). Window = 2026-07-03 … 2027-09-01.
const NOW = new Date(Date.UTC(2026, 8, 1));

// (a) Google Calendar-style export: two weekly events (BYDAY=MO,WE,FR and a
// TZID + BYDAY=TU,TH), a folded SUMMARY line, an all-day event, and a one-off
// that falls inside the import window.
const GOOGLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Toronto:20260907T090000",
  "DTEND;TZID=America/Toronto:20260907T095000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "SUMMARY:Lecture CS 350",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Toronto:20260908T133000",
  "DTEND;TZID=America/Toronto:20260908T145000",
  "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
  "SUMMARY:Semi",
  " nar", // folded continuation → "Seminar"
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260907",
  "DTEND;VALUE=DATE:20260908",
  "SUMMARY:Reading Week Holiday",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Toronto:20260910T120000",
  "DTEND;TZID=America/Toronto:20260910T130000",
  "SUMMARY:One-off lunch",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

// (b) Outlook-style: FREQ=WEEKLY with no BYDAY → weekday from DTSTART's date.
// 2026-09-09 is a Wednesday → day 2.
const OUTLOOK = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART:20260909T100000",
  "DTEND:20260909T110000",
  "RRULE:FREQ=WEEKLY",
  "SUMMARY:Standup",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs: Google-style (a)", () => {
  const res = parseIcs(GOOGLE, NOW);

  it("expands BYDAY=MO,WE,FR into three recurring blocks", () => {
    for (const day of [0, 2, 4]) {
      expect(res.blocks).toContainEqual({
        day,
        start: 540, // 09:00
        end: 590, // 09:50
        label: "Lecture CS 350",
      });
    }
  });

  it("expands TZID + BYDAY=TU,TH and unfolds the folded SUMMARY", () => {
    for (const day of [1, 3]) {
      expect(res.blocks).toContainEqual({
        day,
        start: 810, // 13:30
        end: 890, // 14:50
        label: "Seminar",
      });
    }
  });

  it("imports the in-window one-off as a dated block", () => {
    // 2026-09-10 is a Thursday → day 3.
    expect(res.blocks).toContainEqual({
      day: 3,
      start: 720, // 12:00
      end: 780, // 13:00
      label: "One-off lunch",
      date: "2026-09-10",
    });
  });

  it("skips the all-day event, keeping 6 blocks and no warnings", () => {
    expect(res.blocks).toHaveLength(6); // 3 + 2 recurring + 1 dated
    expect(res.blocks.some((b) => b.label === "Reading Week Holiday")).toBe(
      false,
    );
    expect(res.warnings).toEqual([]);
  });
});

describe("parseIcs: Outlook-style, WEEKLY without BYDAY (b)", () => {
  const res = parseIcs(OUTLOOK, NOW);

  it("uses the DTSTART weekday (Wed → day 2)", () => {
    expect(res.blocks).toEqual([
      { day: 2, start: 600, end: 660, label: "Standup" },
    ]);
    expect(res.warnings).toEqual([]);
  });
});

describe("parseIcs: import window (d)", () => {
  // A one-off dated well after the +365-day window (2027-12 vs NOW 2026-09).
  const FUTURE = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART:20271225T090000",
    "DTEND:20271225T100000",
    "SUMMARY:Way-off holiday party",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const res = parseIcs(FUTURE, NOW);

  it("skips an out-of-window one-off and warns", () => {
    expect(res.blocks).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/outside the import window/i);
  });
});

describe("parseIcs: expired weekly UNTIL (e)", () => {
  // Weekly repeat whose UNTIL (2026-05-01) is before NOW (2026-09-01).
  const EXPIRED = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART:20260105T100000",
    "DTEND:20260105T110000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260501T000000Z",
    "SUMMARY:Last-term seminar",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const res = parseIcs(EXPIRED, NOW);

  it("skips the event entirely and warns about the ended repeat", () => {
    expect(res.blocks).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/repeat has already ended/i);
  });

  it("keeps a weekly event whose UNTIL is still in the future", () => {
    const ONGOING = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART:20260907T100000",
      "DTEND:20260907T110000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z",
      "SUMMARY:This-term seminar",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const r = parseIcs(ONGOING, NOW);
    expect(r.blocks).toEqual([
      { day: 0, start: 600, end: 660, label: "This-term seminar" },
    ]);
    expect(r.warnings).toEqual([]);
  });
});

describe("parseIcs: garbage input (c)", () => {
  it("returns no blocks and does not crash on non-ics text", () => {
    const res = parseIcs(
      "This is just some random text.\nNot an ICS file at all.\nBEGIN but not really\n",
      NOW,
    );
    expect(res.blocks).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("handles empty input", () => {
    const res = parseIcs("", NOW);
    expect(res.blocks).toEqual([]);
    expect(res.warnings).toEqual([]);
  });
});
