"use client";

import { useMemo, useState } from "react";
import type { PublicMember } from "@/lib/types";
import {
  buildGrid,
  DAY_NAMES,
  DAY_END,
  DAY_START,
  SLOT,
  minutesToLabel,
  slotsIn,
} from "@/lib/schedule";

// Interpolate all-busy (neutral grey) -> all-free (strong green).
function shadeFor(frac: number): string {
  const from = [240, 240, 241]; // #f0f0f1
  const to = [21, 128, 61]; // #15803d
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * frac));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function OverlapGrid({
  members,
  weekDates,
  dayStart = DAY_START,
  dayEnd = DAY_END,
}: {
  members: PublicMember[]; // schedules should already be week-filtered
  weekDates?: string[]; // 7 ISO dates (Mon…Sun) for header labels
  dayStart?: number; // minutes from midnight
  dayEnd?: number;
}) {
  const slots = slotsIn(dayStart, dayEnd);
  const grid = useMemo(
    () => buildGrid(members, { dayStart, dayEnd }),
    [members, dayStart, dayEnd],
  );
  const [sel, setSel] = useState<{ day: number; slot: number } | null>(null);
  const total = members.length;

  const byId = useMemo(() => {
    const m: Record<string, PublicMember> = {};
    for (const mem of members) m[mem.id] = mem;
    return m;
  }, [members]);

  const selInfo = useMemo(() => {
    if (!sel) return null;
    const cell = grid[sel.day]?.[sel.slot];
    if (!cell) return null; // stale selection after the window changed
    const from = dayStart + sel.slot * SLOT;
    const busy = cell.busy.map((id) => byId[id]).filter(Boolean);
    const free = members.filter((m) => !cell.busy.includes(m.id));
    return { from, to: from + SLOT, day: sel.day, busy, free };
  }, [sel, grid, byId, members, dayStart]);

  return (
    <div>
      <div className="grid-scroll overflow-x-auto pb-1">
        <div className="min-w-[520px]">
          {/* Header row: day names */}
          <div className="flex">
            <div className="w-12 shrink-0" />
            {DAY_NAMES.map((d, i) => (
              <div
                key={d}
                className="flex-1 pb-1 text-center text-xs font-semibold text-ink-soft"
              >
                {d}
                {weekDates?.[i] && (
                  <span className="ml-0.5 font-normal text-ink-faint">
                    {Number(weekDates[i].slice(8, 10))}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Slot rows */}
          {Array.from({ length: slots }).map((_, slot) => {
            const onHour = (dayStart + slot * SLOT) % 60 === 0;
            return (
              <div key={slot} className="flex">
                <div className="flex w-12 shrink-0 items-start justify-end pr-2 text-[10px] leading-none text-ink-faint">
                  {onHour ? minutesToLabel(dayStart + slot * SLOT).replace(":00", "") : ""}
                </div>
                {DAY_NAMES.map((_d, day) => {
                  const cell = grid[day][slot];
                  const frac = total ? cell.freeCount / total : 0;
                  const isSel = sel?.day === day && sel?.slot === slot;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSel(isSel ? null : { day, slot })}
                      title={`${cell.freeCount}/${total} free`}
                      style={{ backgroundColor: shadeFor(frac) }}
                      className={`h-[13px] flex-1 border-[0.5px] border-white/70 transition-[outline] ${
                        isSel ? "outline outline-2 outline-ink" : ""
                      } ${onHour ? "border-t-stone-200" : ""}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
        <span>All busy</span>
        <div className="flex h-2 flex-1 max-w-[160px] overflow-hidden rounded-full">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: shadeFor(i / 9) }}
            />
          ))}
        </div>
        <span>All free</span>
      </div>

      {/* Selected-cell detail */}
      {selInfo && (
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <div className="font-semibold text-ink">
            {DAY_NAMES[selInfo.day]} · {minutesToLabel(selInfo.from)} –{" "}
            {minutesToLabel(selInfo.to)}
          </div>
          {selInfo.busy.length > 0 ? (
            <p className="mt-1 text-ink-soft">
              <span className="font-medium">Busy:</span>{" "}
              {selInfo.busy.map((m) => m.name).join(", ")}
            </p>
          ) : (
            <p className="mt-1 font-medium text-green-700">Everyone is free.</p>
          )}
          {selInfo.busy.length > 0 && selInfo.free.length > 0 && (
            <p className="mt-0.5 text-ink-faint">
              Free: {selInfo.free.map((m) => m.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
