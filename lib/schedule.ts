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
    const room = b.room;
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
    // Optional room label. Trimmed and capped; a non-string rejects the payload.
    if (room !== undefined && room !== null) {
      if (typeof room !== "string") {
        throw new Error("block.room must be a string");
      }
      const trimmed = room.trim().slice(0, 40);
      if (trimmed) clean.room = trimmed;
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

// Effective blocks for a member on one specific date: recurring blocks on that
// weekday plus one-off blocks dated exactly that day.
export function blocksForDate(schedule: Block[], iso: string): Block[] {
  const wd = weekdayForISODate(iso);
  if (wd === null) return [];
  return schedule.filter((b) => (b.date ? b.date === iso : b.day === wd));
}

// ---- overlap math ---------------------------------------------------------

// grid[day][slot] = { freeCount, total, busy: memberIds }
export type Cell = {
  freeCount: number;
  total: number;
  busy: string[]; // member ids busy in this slot
};

// Viewing window for grid/window math. Defaults to 8 AM - 10 PM; callers can
// widen or narrow it (early risers, night owls, "only show evenings").
export type ViewWindow = {
  dayStart?: number; // minutes from midnight, inclusive
  dayEnd?: number; // minutes from midnight, exclusive
};

export function slotsIn(dayStart: number, dayEnd: number): number {
  return Math.max(0, Math.floor((dayEnd - dayStart) / SLOT));
}

function isFree(schedule: Block[], day: number, from: number, to: number): boolean {
  for (const b of schedule) {
    if (b.day !== day) continue;
    if (b.start < to && b.end > from) return false; // overlaps
  }
  return true;
}

export function buildGrid(
  members: PublicMember[],
  view: ViewWindow = {},
): Cell[][] {
  const dayStart = view.dayStart ?? DAY_START;
  const dayEnd = view.dayEnd ?? DAY_END;
  const slots = slotsIn(dayStart, dayEnd);
  const total = members.length;
  const grid: Cell[][] = [];
  for (let day = 0; day < 7; day++) {
    const row: Cell[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const from = dayStart + slot * SLOT;
      const to = from + SLOT;
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
  free: number; // members guaranteed free for the whole window
  total: number;
};

// Contiguous windows (>= minMinutes) where at least `minFree` members are
// free (default: everyone). A single sweep per day tracks the running
// minimum freeCount, so `free` is the head-count guaranteed for the WHOLE
// window, not just its best slot.
export function bestTimes(
  members: PublicMember[],
  opts: {
    minMinutes?: number;
    limit?: number;
    minFree?: number;
  } & ViewWindow = {},
): BestWindow[] {
  const minMinutes = opts.minMinutes ?? 60;
  const limit = opts.limit ?? 5;
  const dayStart = opts.dayStart ?? DAY_START;
  const dayEnd = opts.dayEnd ?? DAY_END;
  const total = members.length;
  const minFree = Math.min(opts.minFree ?? total, total);
  if (total === 0 || minFree < 1) return [];

  const slots = slotsIn(dayStart, dayEnd);
  const grid = buildGrid(members, { dayStart, dayEnd });
  const windows: BestWindow[] = [];

  for (let day = 0; day < 7; day++) {
    let runStart: number | null = null;
    let runFree = Infinity;
    for (let slot = 0; slot <= slots; slot++) {
      const ok = slot < slots && grid[day][slot].freeCount >= minFree;
      if (ok) {
        if (runStart === null) runStart = dayStart + slot * SLOT;
        runFree = Math.min(runFree, grid[day][slot].freeCount);
      } else if (runStart !== null) {
        const end = dayStart + slot * SLOT;
        if (end - runStart >= minMinutes) {
          windows.push({ day, start: runStart, end, free: runFree, total });
        }
        runStart = null;
        runFree = Infinity;
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

// Members with no block overlapping [from, to) on `day`, used to show names
// (not just counts) for a candidate window.
export function freeMembersDuring(
  members: PublicMember[],
  day: number,
  from: number,
  to: number,
): PublicMember[] {
  return members.filter((m) => isFree(m.schedule, day, from, to));
}

// ---- date-range planning --------------------------------------------------

export type DayPlan = {
  date: string; // ISO YYYY-MM-DD
  day: number; // weekday, 0 = Mon
  windows: BestWindow[]; // qualifying windows on this date, longest first
  freeNames: string[]; // members free for the whole best window
};

// Day-by-day availability over an arbitrary date range, for planning events
// ("who's free some evening in the next two weeks?"). Each date gets the same
// guaranteed-head-count sweep as bestTimes, run against that date's effective
// blocks (recurring + one-offs dated that day).
export function planRange(
  members: PublicMember[],
  startISO: string,
  days: number,
  opts: {
    minMinutes?: number;
    minFree?: number;
    perDay?: number; // max windows kept per date
  } & ViewWindow = {},
): DayPlan[] {
  const perDay = opts.perDay ?? 3;
  const out: DayPlan[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(startISO, i);
    const wd = weekdayForISODate(date);
    if (wd === null) continue;
    const dayMembers = members.map((m) => ({
      ...m,
      schedule: blocksForDate(m.schedule, date),
    }));
    // dayMembers only carry this weekday's blocks, so the other six weekdays
    // read as fully free, keep only this date's windows, and pad the limit by
    // 6 so those six full-day runs can't crowd real results out.
    const windows = bestTimes(dayMembers, {
      minMinutes: opts.minMinutes,
      minFree: opts.minFree,
      dayStart: opts.dayStart,
      dayEnd: opts.dayEnd,
      limit: perDay + 6,
    })
      .filter((w) => w.day === wd)
      .slice(0, perDay);
    const best = windows[0];
    const freeNames = best
      ? freeMembersDuring(dayMembers, wd, best.start, best.end).map(
          (m) => m.name,
        )
      : [];
    out.push({ date, day: wd, windows, freeNames });
  }
  return out;
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

// "2:30–5:30 PM", drops the first meridian when both sides share it.
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

// ---- shared classes --------------------------------------------------------

// Recurring blocks two or more members hold identically. For every distinct
// non-empty label other than the generic "Busy", we bucket recurring blocks
// (no date) by exact (label, day, start, end); a label qualifies when any
// bucket has 2+ members, and its `memberIds` is the union of members across
// that label's qualifying buckets, ordered by their position in `members`.
// Powers the "Same classes" section, so an exact time match is required.
export function sharedLabels(
  members: PublicMember[],
): { label: string; memberIds: string[]; room?: string }[] {
  const order = new Map<string, number>();
  members.forEach((m, i) => order.set(m.id, i));

  // label -> exact-slot key -> { member ids on that slot, first room seen }
  type Bucket = { ids: Set<string>; room?: string };
  const byLabel = new Map<string, Map<string, Bucket>>();
  for (const m of members) {
    for (const b of m.schedule) {
      if (b.date) continue; // recurring blocks only
      const label = b.label.trim();
      if (!label || label === "Busy") continue;
      const key = `${label}|${b.day}|${b.start}|${b.end}`;
      let buckets = byLabel.get(label);
      if (!buckets) byLabel.set(label, (buckets = new Map()));
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = { ids: new Set() }));
      bucket.ids.add(m.id);
      if (!bucket.room && typeof b.room === "string" && b.room) {
        bucket.room = b.room;
      }
    }
  }

  const out: { label: string; memberIds: string[]; room?: string }[] = [];
  for (const [label, buckets] of byLabel) {
    const shared = new Set<string>();
    let room: string | undefined;
    for (const bucket of buckets.values()) {
      if (bucket.ids.size >= 2) {
        for (const id of bucket.ids) shared.add(id);
        if (room === undefined && bucket.room) room = bucket.room;
      }
    }
    if (shared.size > 0) {
      const entry: { label: string; memberIds: string[]; room?: string } = {
        label,
        memberIds: [...shared].sort(
          (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
        ),
      };
      if (room !== undefined) entry.room = room;
      out.push(entry);
    }
  }
  out.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return out;
}
