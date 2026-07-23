"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Block } from "@/lib/types";
import {
  DAY_NAMES,
  DAY_START,
  DAY_END,
  SLOT,
  minutesToLabel,
  slotsIn,
} from "@/lib/schedule";

// Drag-to-paint week grid. Drag across cells to mark busy time; start a drag
// on an already-painted cell to erase instead. Emits merged Block[] (one block
// per contiguous run per day) via onChange. Pure pointer events, works with
// mouse and touch, and pointer capture keeps a drag alive outside the grid.

const PAINT_LABEL = "Busy";

function cellKey(day: number, slot: number): string {
  return `${day}:${slot}`;
}

// Painted cell-set -> merged blocks (contiguous runs per day).
export function cellsToBlocks(
  cells: Set<string>,
  dayStart: number,
  slots: number,
): Block[] {
  const out: Block[] = [];
  for (let day = 0; day < 7; day++) {
    let runStart: number | null = null;
    for (let slot = 0; slot <= slots; slot++) {
      const on = slot < slots && cells.has(cellKey(day, slot));
      if (on && runStart === null) runStart = slot;
      else if (!on && runStart !== null) {
        out.push({
          day,
          start: dayStart + runStart * SLOT,
          end: dayStart + slot * SLOT,
          label: PAINT_LABEL,
        });
        runStart = null;
      }
    }
  }
  return out;
}

// Blocks -> painted cell-set (recurring blocks only; clamped to the grid).
export function blocksToCells(
  blocks: Block[],
  dayStart: number,
  slots: number,
): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    if (b.date) continue; // one-offs don't belong on a weekly paint grid
    const from = Math.max(0, Math.floor((b.start - dayStart) / SLOT));
    const to = Math.min(slots, Math.ceil((b.end - dayStart) / SLOT));
    for (let s = from; s < to; s++) cells.add(cellKey(b.day, s));
  }
  return cells;
}

export default function WeekPaintGrid({
  initialBlocks = [],
  onChange,
  dayStart = DAY_START,
  dayEnd = DAY_END,
}: {
  initialBlocks?: Block[];
  onChange: (blocks: Block[]) => void;
  dayStart?: number;
  dayEnd?: number;
}) {
  const slots = slotsIn(dayStart, dayEnd);
  const [cells, setCells] = useState<Set<string>>(() =>
    blocksToCells(initialBlocks, dayStart, slots),
  );
  // erase = true when the drag started on a painted cell.
  const drag = useRef<{ erase: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const emit = useCallback(
    (next: Set<string>) => {
      setCells(next);
      onChange(cellsToBlocks(next, dayStart, slots));
    },
    [onChange, dayStart, slots],
  );

  // Which cell is under a pointer event (null when outside the grid).
  function cellAt(e: React.PointerEvent): { day: number; slot: number } | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const day = Math.floor((x / rect.width) * 7);
    const slot = Math.floor((y / rect.height) * slots);
    if (day < 0 || day > 6 || slot < 0 || slot >= slots) return null;
    return { day, slot };
  }

  function applyAt(e: React.PointerEvent) {
    const c = cellAt(e);
    if (!c || !drag.current) return;
    const key = cellKey(c.day, c.slot);
    const has = cells.has(key);
    if (drag.current.erase ? !has : has) return; // no-op, skip a re-render
    const next = new Set(cells);
    if (drag.current.erase) next.delete(key);
    else next.add(key);
    emit(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    const c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { erase: cells.has(cellKey(c.day, c.slot)) };
    applyAt(e);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (drag.current) applyAt(e);
  }

  function onPointerUp() {
    drag.current = null;
  }

  const painted = useMemo(
    () => cellsToBlocks(cells, dayStart, slots),
    [cells, dayStart, slots],
  );

  return (
    <div>
      <div className="flex select-none">
        {/* Hour labels */}
        <div className="w-12 shrink-0">
          <div className="h-5" />
          {Array.from({ length: slots }).map((_, slot) => {
            const t = dayStart + slot * SLOT;
            return (
              <div
                key={slot}
                className="flex h-[16px] items-start justify-end pr-2 text-[10px] leading-none text-ink-faint"
              >
                {t % 60 === 0 ? minutesToLabel(t).replace(":00", "") : ""}
              </div>
            );
          })}
        </div>

        <div className="flex-1">
          {/* Day header */}
          <div className="flex h-5">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="flex-1 text-center text-xs font-medium text-ink-soft"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Paintable area */}
          <div
            ref={gridRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="grid cursor-crosshair touch-none grid-cols-7 overflow-hidden rounded-md border border-stone-200"
            role="grid"
            aria-label="Drag to mark busy times"
          >
            {Array.from({ length: slots }).map((_, slot) =>
              DAY_NAMES.map((_d, day) => {
                const on = cells.has(cellKey(day, slot));
                const onHour = (dayStart + slot * SLOT) % 60 === 0;
                return (
                  <div
                    key={cellKey(day, slot)}
                    style={{ gridRow: slot + 1, gridColumn: day + 1 }}
                    className={`h-[16px] border-stone-100 transition-colors duration-100 ${
                      day > 0 ? "border-l" : ""
                    } ${slot > 0 ? (onHour ? "border-t border-t-stone-200" : "border-t") : ""} ${
                      on ? "fw-paint bg-gold-600" : "bg-white hover:bg-gold-50"
                    }`}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Drag to mark busy time · drag over painted cells to erase
        {painted.length > 0 &&
          ` · ${painted.length} block${painted.length === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
