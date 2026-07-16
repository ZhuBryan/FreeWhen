// lib/parseGeneric.ts
// Lenient fallback parser for arbitrary "day + time range" schedule text that
// the Quest parser doesn't recognise. Pure TS, no dependencies.
//
// Scans line-by-line for day names (full or abbreviated, in comma / & / "and"
// separated lists) alongside a time range in 12h or 24h form, e.g.:
//   "Work: Mon, Wed 9am - 5pm"
//   "Tuesday and Thursday 14:30-16:00 Volleyball"

import type { Block } from "@/lib/parseQuest";

// Day words, longest alternatives first so "monday" wins over "mon", etc.
const DAY_RE =
  /\b(mondays?|mon|tuesdays?|tues|tue|tu|wednesdays?|weds|wed|thursdays?|thurs|thur|thu|th|fridays?|fri|saturdays?|sat|sundays?|sun)\b/gi;

// A time range: 12h ("9am-5pm", "9:00 AM - 5:00 PM") or 24h ("09:00-17:00").
const RANGE_RE =
  /(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i;

function dayNum(token: string): number {
  const t = token.toLowerCase();
  if (t.startsWith("mon")) return 0;
  if (t.startsWith("tu")) return 1;
  if (t.startsWith("wed") || t === "weds") return 2;
  if (t.startsWith("th")) return 3;
  if (t.startsWith("fri")) return 4;
  if (t.startsWith("sat")) return 5;
  if (t.startsWith("sun")) return 6;
  return -1;
}

function toMinutes(h: string, m: string | undefined, ap: string | undefined): number {
  let hour = parseInt(h, 10);
  const min = m ? parseInt(m, 10) : 0;
  if (ap) {
    const p = ap.replace(/\./g, "").toLowerCase();
    hour = hour % 12;
    if (p === "pm") hour += 12;
  }
  return hour * 60 + min;
}

// Everything that isn't a day token, connector, time, or punctuation → label.
function extractLabel(rest: string): string {
  const s = rest
    .replace(DAY_RE, " ")
    .replace(/\b(and|&)\b/gi, " ")
    .replace(/[,:;|/\\@()[\]{}.\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || "Busy";
}

export function parseGeneric(input: string): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<string>();

  for (const rawLine of (input ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const range = line.match(RANGE_RE);
    if (!range) continue;

    const start = toMinutes(range[1], range[2], range[3]);
    const end = toMinutes(range[4], range[5], range[6]);
    if (end <= start) continue;

    // Remove the time range from the line before hunting for days + label.
    const rest =
      line.slice(0, range.index ?? 0) +
      " " +
      line.slice((range.index ?? 0) + range[0].length);

    const days = new Set<number>();
    for (const m of rest.matchAll(DAY_RE)) {
      const d = dayNum(m[1]);
      if (d >= 0) days.add(d);
    }
    if (days.size === 0) continue;

    const label = extractLabel(rest);
    for (const day of [...days].sort((a, b) => a - b)) {
      const key = `${day}|${start}|${end}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ day, start, end, label });
    }
  }

  return blocks;
}

export default parseGeneric;
