"use client";

import { useMemo, useState } from "react";
import type { PublicMember } from "@/lib/types";
import {
  DAY_NAMES,
  DAY_START,
  DAY_END,
  formatMonthDay,
  formatRange,
  planRange,
  todayISO,
  type DayPlan,
} from "@/lib/schedule";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";

// Time-of-day presets for the scan window.
const TOD = {
  any: { label: "Any time", start: DAY_START, end: DAY_END },
  morning: { label: "Mornings", start: 8 * 60, end: 12 * 60 },
  afternoon: { label: "Afternoons", start: 12 * 60, end: 17 * 60 },
  evening: { label: "Evenings", start: 17 * 60, end: 22 * 60 },
} as const;
type TodKey = keyof typeof TOD;

const DURATIONS = [
  { min: 60, label: "1 h" },
  { min: 90, label: "1.5 h" },
  { min: 120, label: "2 h" },
  { min: 180, label: "3 h" },
];

const SPANS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
];

function planScore(p: DayPlan): number {
  const w = p.windows[0];
  if (!w) return -1;
  // Most people guaranteed free wins; break ties with window length.
  return w.free * 10000 + (w.end - w.start);
}

export default function PlannerPanel({
  members,
  groupName,
  slug,
  myToken,
  onProposed,
}: {
  members: PublicMember[];
  groupName: string;
  slug?: string;
  myToken?: string | null;
  onProposed?: () => void;
}) {
  const [startISO, setStartISO] = useState(() => todayISO());
  const [span, setSpan] = useState(14);
  const [tod, setTod] = useState<TodKey>("evening");
  const [duration, setDuration] = useState(120);
  const [minFree, setMinFree] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [proposing, setProposing] = useState<string | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const canPropose = Boolean(slug && myToken);

  async function propose(dateISO: string, start: number, end: number) {
    if (!slug || !myToken) return;
    setProposing(dateISO);
    setProposeError(null);
    try {
      const res = await fetch(`/api/groups/${slug}/proposals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-edit-token": myToken,
        },
        body: JSON.stringify({ date: dateISO, start, end }),
      });
      if (!res.ok) {
        setProposeError(dateISO);
        return;
      }
      onProposed?.();
    } catch {
      setProposeError(dateISO);
    } finally {
      setProposing(null);
    }
  }

  const total = members.length;
  const effectiveMinFree =
    minFree === null ? total : Math.min(minFree, Math.max(total, 1));

  const plans = useMemo(
    () =>
      planRange(members, startISO, span, {
        minMinutes: duration,
        minFree: effectiveMinFree,
        dayStart: TOD[tod].start,
        dayEnd: TOD[tod].end,
        perDay: 3,
      }),
    [members, startISO, span, duration, effectiveMinFree, tod],
  );

  const hits = useMemo(() => plans.filter((p) => p.windows.length > 0), [plans]);
  const bestDate = useMemo(() => {
    let best: DayPlan | null = null;
    for (const p of hits) {
      if (!best || planScore(p) > planScore(best)) best = p;
    }
    return best?.date ?? null;
  }, [hits]);

  async function copyPlan() {
    const lines = hits.slice(0, 6).map((p) => {
      const w = p.windows[0];
      const who = w.free === w.total ? "everyone" : `${w.free}/${w.total}`;
      return `- ${DAY_NAMES[p.day]} ${formatMonthDay(p.date)}: ${formatRange(
        w.start,
        w.end,
      )} (${who} free)`;
    });
    const text = [
      `${groupName}: days that work (${TOD[tod].label.toLowerCase()}, ${
        duration / 60
      }h+):`,
      ...lines,
      typeof window !== "undefined" ? window.location.href : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  const selectCls =
    "rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-stone-400";

  return (
    <div>
      {/* Controls: one quiet toolbar so the five inputs read as a single
          control surface rather than five floating widgets. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-2 text-sm">
        <input
          type="date"
          aria-label="Start date"
          value={startISO}
          onChange={(e) => e.target.value && setStartISO(e.target.value)}
          className={selectCls}
        />
        <select
          aria-label="How many days to scan"
          value={span}
          onChange={(e) => setSpan(Number(e.target.value))}
          className={selectCls}
        >
          {SPANS.map((s) => (
            <option key={s.days} value={s.days}>
              next {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Time of day"
          value={tod}
          onChange={(e) => setTod(e.target.value as TodKey)}
          className={selectCls}
        >
          {(Object.keys(TOD) as TodKey[]).map((k) => (
            <option key={k} value={k}>
              {TOD[k].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Minimum duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={selectCls}
        >
          {DURATIONS.map((d) => (
            <option key={d.min} value={d.min}>
              {d.label}+
            </option>
          ))}
        </select>
        {total > 2 && (
          <select
            aria-label="How many people need to be free"
            value={minFree ?? 0}
            onChange={(e) => setMinFree(Number(e.target.value) || null)}
            className={selectCls}
          >
            <option value={0}>everyone</option>
            {Array.from({ length: total - 2 }, (_, i) => total - 1 - i).map(
              (k) => (
                <option key={k} value={k}>
                  {k}+ of {total}
                </option>
              ),
            )}
          </select>
        )}
      </div>

      {/* Results */}
      {hits.length === 0 ? (
        <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 text-sm text-ink-soft">
          No {duration / 60}-hour window works in these {span} days. Try a
          different time of day, a shorter duration, or fewer people.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-ink-faint">
              <span className="font-medium text-ink">{hits.length}</span> of{" "}
              {span} days work
            </p>
            <button
              type="button"
              onClick={copyPlan}
              className="text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              {copied ? "Copied" : "Copy for group chat"}
            </button>
          </div>

          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {hits.map((p) => {
              const w = p.windows[0];
              const isBest = p.date === bestDate;
              const others = p.windows.slice(1);
              const ev = {
                title: groupName,
                dateISO: p.date,
                start: w.start,
                end: w.end,
                description: "Planned with FreeWhen",
              };
              return (
                <li
                  key={p.date}
                  className="group/row px-4 py-3 transition-colors hover:bg-gold-50"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-ink transition-colors group-hover/row:text-gold-600">
                      {DAY_NAMES[p.day]}{" "}
                      <span className="font-normal text-ink-faint">
                        {formatMonthDay(p.date)}
                      </span>
                    </span>
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatRange(w.start, w.end)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.free === w.total
                          ? "bg-green-100 text-green-800"
                          : "bg-stone-100 text-ink-soft"
                      }`}
                    >
                      {w.free === w.total
                        ? "everyone free"
                        : `${w.free} of ${w.total} free`}
                    </span>
                    {isBest && (
                      <span className="fw-pulse-once rounded-full bg-gold-500 px-2 py-0.5 text-xs font-semibold text-white">
                        best bet
                      </span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {/* One primary action per row: propose if you can,
                          otherwise the most common calendar add. */}
                      {canPropose ? (
                        <button
                          type="button"
                          onClick={() => propose(p.date, w.start, w.end)}
                          disabled={proposing === p.date}
                          className="rounded-md bg-gold-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-gold-600 disabled:opacity-50"
                        >
                          {proposing === p.date ? "Proposing…" : "Propose"}
                        </button>
                      ) : (
                        <a
                          href={googleCalendarUrl(ev)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-ink-soft transition hover:border-stone-400 hover:text-ink"
                        >
                          Google Cal
                        </a>
                      )}
                      {/* Everything else tucks behind a quiet disclosure. */}
                      <details className="group/cal relative">
                        <summary className="cursor-pointer list-none text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
                          add to calendar
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col gap-0.5 rounded-lg border border-stone-200 bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
                          {canPropose && (
                            <a
                              href={googleCalendarUrl(ev)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-stone-100 hover:text-ink"
                            >
                              Google Calendar
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => downloadIcs(ev)}
                            className="rounded-md px-2 py-1.5 text-left text-xs font-medium text-ink-soft transition hover:bg-stone-100 hover:text-ink"
                          >
                            Download .ics
                          </button>
                        </div>
                      </details>
                    </span>
                  </div>
                  {proposeError === p.date && (
                    <div className="mt-1 text-xs text-rose-600">
                      Could not propose. Try again.
                    </div>
                  )}
                  <div className="mt-1 text-xs text-ink-faint">
                    {w.free < w.total && p.freeNames.length > 0 && (
                      <>Free: {p.freeNames.join(", ")}</>
                    )}
                    {others.length > 0 && (
                      <span className={w.free < w.total ? "ml-2" : ""}>
                        Also: {others.map((o) => formatRange(o.start, o.end)).join(" · ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
