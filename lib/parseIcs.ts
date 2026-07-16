// lib/parseIcs.ts
// Pure-TS parser for iCalendar (.ics / RFC 5545) exports. No dependencies.
// Weekly/daily repeating events become recurring blocks; one-off (and
// unsupported-recurrence) events become dated blocks on their DTSTART date, as
// long as that date is inside the import window (60 days back → 365 ahead of
// `now`). All-day events are ignored; expired repeats and out-of-window one-offs
// are skipped and counted in warnings.

import type { Block } from "@/lib/parseQuest";

export type IcsResult = {
  blocks: Block[];
  warnings: string[];
};

// BYDAY / weekday codes → 0 = Mon … 6 = Sun.
const BYDAY_MAP: Record<string, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

type RawProp = {
  name: string;
  params: Record<string, string>;
  value: string;
};

// RFC 5545 line unfolding: a CRLF (or LF/CR) followed by a single space or tab
// is a continuation of the previous line — remove the break and one whitespace.
function unfold(text: string): string[] {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if (lines.length > 0 && (line.startsWith(" ") || line.startsWith("\t"))) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

// Split "DTSTART;TZID=America/Toronto:20260907T093000" into name/params/value.
function parseProp(line: string): RawProp | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = left.split(";");
  const name = segs[0].trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf("=");
    if (eq === -1) continue;
    params[segs[i].slice(0, eq).trim().toUpperCase()] = segs[i]
      .slice(eq + 1)
      .trim();
  }
  return { name, params, value };
}

// Minimal TEXT unescaping (SUMMARY may escape , ; \ and \n).
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// Time-of-day in minutes from a value like "20260907T093000" / "...T0930" /
// "...T093000Z". The literal HH:MM is treated as wall-clock (no TZ math).
function timeOfDay(value: string): number | null {
  const m = value.match(/T(\d{2})(\d{2})(\d{2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Weekday (0 = Mon … 6 = Sun) from the yyyymmdd date part, via UTC parsing to
// avoid any local-timezone off-by-one.
function weekdayFromDate(value: string): number | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7; // JS 0=Sun → our 0=Mon
}

// ISO "YYYY-MM-DD" from the yyyymmdd date part of a DTSTART/DTEND value.
function isoDateFromValue(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// UTC-midnight epoch millis for the yyyymmdd date part (date-only comparison).
function dateMs(value: string): number | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : t;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseRrule(rrule: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const eq = kv.indexOf("=");
    if (eq === -1) continue;
    out[kv.slice(0, eq).trim().toUpperCase()] = kv.slice(eq + 1).trim().toUpperCase();
  }
  return out;
}

// BYDAY codes may carry an ordinal prefix ("2MO", "-1SU"); take the day suffix.
function bydayToDays(byday: string): number[] {
  const out: number[] = [];
  for (const raw of byday.split(",")) {
    const m = raw.trim().match(/(MO|TU|WE|TH|FR|SA|SU)$/);
    if (m) out.push(BYDAY_MAP[m[1]]);
  }
  return out;
}

type PendingEvent = {
  summary: string | null;
  dtstartValue: string | null;
  dtstartIsDate: boolean;
  dtendValue: string | null;
  rrule: string | null;
};

function newEvent(): PendingEvent {
  return {
    summary: null,
    dtstartValue: null,
    dtstartIsDate: false,
    dtendValue: null,
    rrule: null,
  };
}

function isAllDay(prop: RawProp): boolean {
  // VALUE=DATE param, or a value with no time component (yyyymmdd only).
  if ((prop.params.VALUE || "").toUpperCase() === "DATE") return true;
  return !prop.value.includes("T");
}

// `now` is injectable so the import window is deterministic in tests. Events are
// imported from 60 days before `now` through 365 days after it.
export function parseIcs(input: string, now: Date = new Date()): IcsResult {
  const blocks: Block[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let skippedOutside = 0;
  let expiredRecurring = 0;

  // Date-only window bounds, in UTC-midnight millis.
  const nowMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const windowLow = nowMs - 60 * DAY_MS;
  const windowHigh = nowMs + 365 * DAY_MS;

  const lines = unfold(input ?? "");
  let ev: PendingEvent | null = null;

  const finish = (e: PendingEvent) => {
    // All-day events (holidays etc.) are not busy time blocks — skip silently.
    if (e.dtstartIsDate || !e.dtstartValue) return;

    const start = timeOfDay(e.dtstartValue);
    if (start === null) return;
    let end = e.dtendValue ? timeOfDay(e.dtendValue) : null;
    if (end === null) return;

    // Multi-day timed event (DTEND date after DTSTART date): clamp to the start
    // day by ending it at midnight, so it stays a single-day busy block.
    const startDate = isoDateFromValue(e.dtstartValue);
    const endDate = e.dtendValue ? isoDateFromValue(e.dtendValue) : null;
    if (startDate && endDate && endDate > startDate) {
      end = 1440;
    }
    if (end <= start) return;

    const rule = e.rrule ? parseRrule(e.rrule) : null;
    const freq = rule?.FREQ ?? null;
    const label = e.summary || "Busy";

    let days: number[] | null = null;
    if (freq === "WEEKLY") {
      if (rule?.BYDAY) {
        const parsed = bydayToDays(rule.BYDAY);
        days = parsed.length ? parsed : null;
      } else {
        const wd = weekdayFromDate(e.dtstartValue);
        days = wd === null ? null : [wd];
      }
    } else if (freq === "DAILY") {
      days = [0, 1, 2, 3, 4, 5, 6];
    }

    if (days) {
      // Recurring event. Honour UNTIL: if the repeat ended before `now`, the
      // event no longer contributes any busy time — skip it. (COUNT is ignored
      // and treated as ongoing.)
      if (rule?.UNTIL) {
        const untilMs = dateMs(rule.UNTIL);
        if (untilMs !== null && untilMs < nowMs) {
          expiredRecurring++;
          return;
        }
      }
      for (const day of days) {
        const key = `${day}|${start}|${end}|${label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ day, start, end, label });
      }
      return;
    }

    // One-off (no RRULE, or an unsupported FREQ like MONTHLY/YEARLY) → a dated
    // block on DTSTART's date, if that date is inside the import window.
    const iso = isoDateFromValue(e.dtstartValue);
    const ms = dateMs(e.dtstartValue);
    const wd = weekdayFromDate(e.dtstartValue);
    if (iso === null || ms === null || wd === null) return;
    if (ms < windowLow || ms > windowHigh) {
      skippedOutside++;
      return;
    }
    const key = `${iso}|${wd}|${start}|${end}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push({ day: wd, start, end, label, date: iso });
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      ev = newEvent();
      continue;
    }
    if (upper === "END:VEVENT") {
      if (ev) finish(ev);
      ev = null;
      continue;
    }
    if (!ev) continue;

    const prop = parseProp(line);
    if (!prop) continue;

    switch (prop.name) {
      case "SUMMARY":
        ev.summary = unescapeText(prop.value) || null;
        break;
      case "DTSTART":
        ev.dtstartValue = prop.value.trim();
        ev.dtstartIsDate = isAllDay(prop);
        break;
      case "DTEND":
        ev.dtendValue = prop.value.trim();
        break;
      case "RRULE":
        ev.rrule = prop.value.trim();
        break;
      default:
        break;
    }
  }

  if (skippedOutside > 0) {
    warnings.push(
      `Skipped ${skippedOutside} event${
        skippedOutside === 1 ? "" : "s"
      } outside the import window (over 60 days ago or more than a year ahead).`,
    );
  }
  if (expiredRecurring > 0) {
    warnings.push(
      `Skipped ${expiredRecurring} repeating event${
        expiredRecurring === 1 ? "" : "s"
      } whose repeat has already ended.`,
    );
  }

  return { blocks, warnings };
}

export default parseIcs;
