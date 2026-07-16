// lib/parseQuest.ts
// Pure-TS parser for UW Quest "My Class Schedule" (list view) copy-paste text.
// No dependencies. Turns messy tab/newline separated text into schedule blocks.

export type Block = {
  day: number; // 0 = Mon … 6 = Sun
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  label: string; // e.g. "CS 350 LEC"
  // Optional ISO "YYYY-MM-DD". Absent = weekly recurring (the default).
  // Present = a one-off on that specific date; `day` must equal the date's
  // weekday (0 = Mon). See validateSchedule / blocksForWeek in lib/schedule.ts.
  date?: string;
};

export type Meeting = {
  days: number[];
  start: number;
  end: number;
  component: string | null;
  label: string;
};

export type Course = {
  code: string; // e.g. "CS 350"
  title: string; // e.g. "Operating Systems"
  meetings: Meeting[];
};

export type ParseResult = {
  courses: Course[];
  blocks: Block[];
  warnings: string[];
};

const COURSE_HEADER = /^([A-Z]{2,6})\s*(\d{2,4}[A-Z]?)\s*-\s*(.+)$/;
const RANGE =
  /(\d{1,2}):(\d{2})\s*([AP]M)\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)/i;
const SINGLE_TIME = /\d{1,2}:\d{2}\s*[AP]M/i;
const COMPONENT = /\b(LEC|TUT|LAB|SEM|PRJ|TST|STU)\b/i;

const DAY_MAP: Record<string, number> = {
  M: 0,
  T: 1,
  W: 2,
  Th: 3,
  F: 4,
  Sa: 5,
  Su: 6,
};

// Tokenize a day string longest-first (Th/Sa/Su before M/T/W/F).
// Returns null if any character can't be consumed.
function parseDays(raw: string): number[] | null {
  const s = raw.trim();
  if (!s) return null;
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two === "Th" || two === "Sa" || two === "Su") {
      out.push(DAY_MAP[two]);
      i += 2;
      continue;
    }
    const one = s.slice(i, i + 1);
    if (one === "M" || one === "T" || one === "W" || one === "F") {
      out.push(DAY_MAP[one]);
      i += 1;
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

// 12PM -> 720, 12AM -> 0, 10:30AM -> 630
function toMinutes(h: string, m: string, ap: string): number {
  let hour = parseInt(h, 10) % 12;
  if (ap.toUpperCase() === "PM") hour += 12;
  return hour * 60 + parseInt(m, 10);
}

function findComponent(line: string): string | null {
  const m = line.match(COMPONENT);
  return m ? m[1].toUpperCase() : null;
}

export function parseQuest(input: string): ParseResult {
  const rawLines = input.split(/\r?\n/);
  const courses: Course[] = [];
  const blocks: Block[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  let current: Course | null = null;
  const prevNonEmpty: string[] = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    // Course header?
    const header = line.match(COURSE_HEADER);
    if (header) {
      current = {
        code: `${header[1]} ${header[2]}`.trim(),
        title: header[3].trim(),
        meetings: [],
      };
      courses.push(current);
      prevNonEmpty.push(line);
      continue;
    }

    const range = line.match(RANGE);
    if (range) {
      const beforeText = line.slice(0, range.index ?? 0);
      const tokens = beforeText.split(/[\s\t]+/).filter(Boolean);
      const dayToken = tokens.length ? tokens[tokens.length - 1] : "";
      const days = parseDays(dayToken);

      const start = toMinutes(range[1], range[2], range[3]);
      const end = toMinutes(range[4], range[5], range[6]);

      if (!days) {
        warnings.push(`Couldn't read days for: "${line}"`);
        prevNonEmpty.push(line);
        continue;
      }
      if (end <= start) {
        warnings.push(`Ignored (end not after start): "${line}"`);
        prevNonEmpty.push(line);
        continue;
      }

      // Component: this line, then up to 2 preceding non-empty lines.
      const component =
        findComponent(line) ||
        findComponent(prevNonEmpty[prevNonEmpty.length - 1] || "") ||
        findComponent(prevNonEmpty[prevNonEmpty.length - 2] || "");

      const code = current ? current.code : null;
      const label = code
        ? component
          ? `${code} ${component}`
          : code
        : component || "Class";

      const meeting: Meeting = { days, start, end, component, label };
      if (current) current.meetings.push(meeting);

      for (const day of days) {
        const key = `${day}|${start}|${end}|${label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ day, start, end, label });
      }
      prevNonEmpty.push(line);
      continue;
    }

    // Time-looking line that isn't a valid range → warn (skip TBA/no-time rows).
    if (SINGLE_TIME.test(line)) {
      warnings.push(`Couldn't parse time on: "${line}"`);
    }
    prevNonEmpty.push(line);
  }

  return { courses, blocks, warnings };
}

export default parseQuest;
