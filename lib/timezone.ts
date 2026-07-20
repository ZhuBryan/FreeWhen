// lib/timezone.ts
// Per-member timezone conversion. Pure TS, no deps — uses Intl for offsets.
import type { Block } from "@/lib/types";
import { addDaysISO } from "@/lib/schedule";

// Minutes east of UTC for `tz` at instant `at`, e.g. Toronto in January is
// -300 (UTC-5). Works by formatting `at` in `tz`, re-reading those wall-clock
// fields as if they were UTC, and diffing against the real UTC instant.
// Note: offsets are sampled at a single instant, so a schedule stored in one
// DST regime and viewed in another can be off by an hour near the transition.
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // midnight sometimes renders as "24"
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60000);
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Converts `blocks` from `fromTz` wall-clock time to `toTz` wall-clock time.
// Blocks that end up crossing midnight are split into two (one per day).
// Returns the input unchanged for a no-op conversion (same zone, zero
// offset delta, or an invalid zone).
export function convertBlocks(
  blocks: Block[],
  fromTz: string,
  toTz: string,
  at: Date = new Date(),
): Block[] {
  if (fromTz === toTz) return blocks;
  if (!isValidTimeZone(fromTz) || !isValidTimeZone(toTz)) return blocks;

  let delta: number;
  try {
    delta = tzOffsetMinutes(toTz, at) - tzOffsetMinutes(fromTz, at);
  } catch {
    return blocks;
  }
  if (delta === 0) return blocks;

  const out: Block[] = [];
  for (const b of blocks) {
    let start = b.start + delta;
    let end = b.end + delta;
    let dayShift = 0;
    while (start < 0) {
      start += 1440;
      end += 1440;
      dayShift -= 1;
    }
    while (start >= 1440) {
      start -= 1440;
      end -= 1440;
      dayShift += 1;
    }
    const day = ((b.day + dayShift) % 7 + 7) % 7;
    const date = b.date ? addDaysISO(b.date, dayShift) : undefined;

    if (end > 1440) {
      // Crosses midnight in the new timezone — split at the day boundary.
      const first: Block = { day, start, end: 1440, label: b.label };
      if (date) first.date = date;
      out.push(first);

      const day2 = (day + 1) % 7;
      const second: Block = { day: day2, start: 0, end: end - 1440, label: b.label };
      if (date) second.date = addDaysISO(date, 1);
      out.push(second);
    } else {
      const block: Block = { day, start, end, label: b.label };
      if (date) block.date = date;
      out.push(block);
    }
  }
  return out;
}
