import { describe, it, expect } from "vitest";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";

const ev = {
  title: "Study crew; hangout, maybe",
  dateISO: "2026-07-24",
  start: 19 * 60,
  end: 22 * 60,
  description: "Planned with FreeWhen",
};

describe("buildIcs", () => {
  it("writes floating local times and required fields", () => {
    const ics = buildIcs(ev);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260724T190000");
    expect(ics).toContain("DTEND:20260724T220000");
    expect(ics).toContain("DESCRIPTION:Planned with FreeWhen");
    expect(ics).toMatch(/UID:.+@freewhen/);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("escapes commas and semicolons in text fields", () => {
    expect(buildIcs(ev)).toContain(
      "SUMMARY:Study crew\\; hangout\\, maybe",
    );
  });
});

describe("googleCalendarUrl", () => {
  it("builds a render link with the date pair", () => {
    const url = googleCalendarUrl(ev);
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("20260724T190000%2F20260724T220000");
    expect(url).toContain("action=TEMPLATE");
  });
});
