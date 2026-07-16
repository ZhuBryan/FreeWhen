// lib/schedule.ts
// Grid + overlap math and server-side schedule validation. Pure TS, no deps.
import type { Block, PublicMember } from "@/lib/types";

export const DAY_START = 8 * 60; // 08:00
export const DAY_END = 22 * 60; // 22:00
export const SLOT = 30; // minutes
export const SLOTS_PER_DAY = (DAY_END - DAY_START) / SLOT; // 28

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// ---- validation -----------------------------------------------------------

export const MAX_BLOCKS = 500;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Weekday (0 = Mon … 6 = Sun) for an ISO "YYYY-MM-DD", or null if the string
// isn't a real calendar date. Uses UTC so there's no local-timezone off-by-one.
export function weekdayForISODate(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject non-existent dates like 2026-02-30 (JS would roll them over).
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return (dt.getUTCDay() + 6) % 7; // JS 0=Sun → our 0=Mon
}

// Validates + normalises a schedule payload. Returns clean blocks or throws.
export function validateSchedule(input: unknown): Block[] {
  if (!Array.isArray(input)) {
    throw new Error("schedule must be an array");
  }
  if (input.length > MAX_BLOCKS) {
    throw new Error(`schedule has too many blocks (max ${MAX_BLOCKS})`);
  }
  const out: Block[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("each schedule block must be an object");
    }
    const b = raw as Record<string, unknown>;
    const day = b.day;
    const start = b.start;
    const end = b.end;
    const label = b.label;
    const date = b.date;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("block.day must be an integer 0-6");
    }
    if (typeof start !== "number" || typeof end !== "number") {
      throw new Error("block.start and block.end must be numbers");
    }
    if (!(start >= 0 && start < end && end <= 1440)) {
      throw new Error("block requires 0 <= start < end <= 1440");
    }
    if (typeof label !== "string") {
      throw new Error("block.label must be a string");
    }
    const clean: Block = { day, start, end, label: label.slice(0, 80) };
    // Optional one-off date. When present it must be a real YYYY-MM-DD whose
    // weekday matches block.day; otherwise reject the whole payload.
    if (date !== undefined && date !== null) {
      if (typeof date !== "string") {
        throw new Error("block.date must be a string (YYYY-MM-DD)");
      }
      const wd = weekdayForISODate(date);
      if (wd === null) {
        throw new Error("block.date must be a real YYYY-MM-DD calendar date");
      }
      if (wd !== day) {
        throw new Error("block.date weekday must match block.day");
      }
      clean.date = date;
    }
    out.push(clean);
  }
  return out;
}

// ---- week helpers ----------------------------------------------------------

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// ISO "YYYY-MM-DD" `days` days after `iso` (pure UTC date arithmetic).
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate(),
  )}`;
}

export function addWeeksISO(iso: string, weeks: number): string {
  return addDaysISO(iso, weeks * 7);
}

// Monday (our week start) of the week containing `iso`.
export function mondayOfISO(iso: string): string {
  const wd = weekdayForISODate(iso);
  if (wd === null) return iso;
  return addDaysISO(iso, -wd);
}

// The 7 ISO dates (Mon…Sun) of the week starting at `weekStartISO`.
export function weekDatesISO(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i));
}

// Local-today as ISO "YYYY-MM-DD" (client-side week defaulting).
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate(),
  )}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "Jul 13"
export function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// "Jul 13 – 19", or "Jun 29 – Jul 5" when the week crosses a month.
export function formatWeekRange(weekStartISO: string): string {
  const end = addDaysISO(weekStartISO, 6);
  const [, sm] = weekStartISO.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  const left = formatMonthDay(weekStartISO);
  const right = sm === em ? String(ed) : formatMonthDay(end);
  return `${left} – ${right}`;
}

// Effective blocks for a member in the week starting at `weekStartISO`:
// every recurring block (no date) plus dated blocks that fall in that week.
// Dated blocks already carry the correct weekday in `day`, so callers can use
// the result directly for grid/overlap math.
export function blocksForWeek(schedule: Block[], weekStartISO: string): Block[] {
  const week = new Set(weekDatesISO(weekStartISO));
  const out: Block[] = [];
  for (const b of schedule) {
    if (!b.date) out.push(b);
    else if (week.has(b.date)) out.push(b);
  }
  return out;
}

// ---- overlap math ---------------------------------------------------------

function slotBounds(slot: number): [number, number] {
  const s = DAY_START + slot * SLOT;
  return [s, s + SLOT];
}

function isFree(schedule: Block[], day: number, from: number, to: number): boolean {
  for (const b of schedule) {
    if (b.day !== day) continue;
    if (b.start < to && b.end > from) return false; // overlaps
  }
  return true;
}

// grid[day][slot] = { freeCount, total, busy: memberIds }
export type Cell = {
  freeCount: number;
  total: number;
  busy: string[]; // member ids busy in this slot
};

export function buildGrid(members: PublicMember[]): Cell[][] {
  const total = members.length;
  const grid: Cell[][] = [];
  for (let day = 0; day < 7; day++) {
    const row: Cell[] = [];
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const [from, to] = slotBounds(slot);
      const busy: string[] = [];
      for (const m of members) {
        if (!isFree(m.schedule, day, from, to)) busy.push(m.id);
      }
      row.push({ freeCount: total - busy.length, total, busy });
    }
    grid.push(row);
  }
  return grid;
}

export type BestWindow = {
  day: number;
  start: number;
  end: number;
};

// Contiguous windows (>= minMinutes) where EVERY member is free.
export function bestTimes(
  members: PublicMember[],
  opts: { minMinutes?: number; limit?: number } = {},
): BestWindow[] {
  const minMinutes = opts.minMinutes ?? 60;
  const limit = opts.limit ?? 5;
  if (members.length === 0) return [];

  const grid = buildGrid(members);
  const windows: BestWindow[] = [];

  for (let day = 0; day < 7; day++) {
    let runStart: number | null = null;
    for (let slot = 0; slot <= SLOTS_PER_DAY; slot++) {
      const allFree = slot < SLOTS_PER_DAY && grid[day][slot].freeCount === grid[day][slot].total && grid[day][slot].total > 0;
      if (allFree && runStart === null) {
        runStart = DAY_START + slot * SLOT;
      } else if (!allFree && runStart !== null) {
        const end = DAY_START + slot * SLOT;
        if (end - runStart >= minMinutes) {
          windows.push({ day, start: runStart, end });
        }
        runStart = null;
      }
    }
  }

  // Longest first; break ties by earlier in week, then earlier in day.
  windows.sort((a, b) => {
    const da = a.end - a.start;
    const db = b.end - b.start;
    if (db !== da) return db - da;
    if (a.day !== b.day) return a.day - b.day;
    return a.start - b.start;
  });
  return windows.slice(0, limit);
}

// ---- formatting -----------------------------------------------------------

export function minutesToLabel(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap}`;
}

// "2:30–5:30 PM" — drops the first meridian when both sides share it.
export function formatRange(start: number, end: number): string {
  const a = minutesToLabel(start);
  const b = minutesToLabel(end);
  const apA = a.slice(-2);
  const apB = b.slice(-2);
  if (apA === apB) {
    return `${a.slice(0, -3)}–${b}`;
  }
  return `${a}–${b}`;
}

export function formatWindow(w: BestWindow): string {
  return `${DAY_NAMES_FULL[w.day]} · ${formatRange(w.start, w.end)}`;
}
