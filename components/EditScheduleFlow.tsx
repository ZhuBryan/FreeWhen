"use client";

import { useMemo, useState } from "react";
import type { Block, PublicMember } from "@/lib/types";
import {
  DAY_NAMES,
  formatMonthDay,
  formatRange,
} from "@/lib/schedule";
import WeekPaintGrid from "@/components/WeekPaintGrid";

// Edit your own schedule in place: existing blocks are listed with their
// labels intact (remove what no longer applies), and new busy time is painted
// on the grid. Saving PATCHes the merged schedule with your edit token.

type Grouped = {
  key: string;
  label: string;
  start: number;
  end: number;
  days: number[];
  blocks: Block[];
};

function groupRecurring(blocks: Block[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const b of blocks) {
    if (b.date) continue;
    const key = `${b.label}|${b.start}|${b.end}`;
    const g = map.get(key);
    if (g) {
      g.days.push(b.day);
      g.blocks.push(b);
    } else {
      map.set(key, {
        key,
        label: b.label,
        start: b.start,
        end: b.end,
        days: [b.day],
        blocks: [b],
      });
    }
  }
  return [...map.values()].map((g) => ({
    ...g,
    days: [...g.days].sort((a, b) => a - b),
  }));
}

export default function EditScheduleFlow({
  member,
  token,
  onSaved,
}: {
  member: PublicMember;
  token: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState<Block[]>(member.schedule);
  const [painted, setPainted] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recurring = useMemo(() => groupRecurring(kept), [kept]);
  const dated = useMemo(
    () =>
      kept
        .filter((b) => b.date)
        .sort((a, b) =>
          a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.start - b.start,
        ),
    [kept],
  );

  function removeGroup(g: Grouped) {
    setKept((ks) => ks.filter((b) => !g.blocks.includes(b)));
  }
  function removeDated(target: Block) {
    setKept((ks) => ks.filter((b) => b !== target));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-edit-token": token,
        },
        body: JSON.stringify({ schedule: [...kept, ...painted] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save changes");
      setOpen(false);
      setPainted([]);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setKept(member.schedule);
          setPainted([]);
          setOpen(true);
        }}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-stone-400 hover:text-ink"
      >
        Edit my schedule
      </button>
    );
  }

  const removedCount = member.schedule.length - kept.length;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Edit your schedule</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {/* Existing blocks (labels preserved) */}
      {recurring.length === 0 && dated.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">
          Everything removed. Paint new busy times below or save to clear your
          schedule.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            Current blocks
          </p>
          <ul className="mt-1.5 space-y-1">
            {recurring.map((g) => (
              <li
                key={g.key}
                className="flex items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{g.label}</span>{" "}
                  <span className="text-ink-faint">
                    · {g.days.map((d) => DAY_NAMES[d]).join("/")} ·{" "}
                    {formatRange(g.start, g.end)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeGroup(g)}
                  aria-label={`Remove ${g.label}`}
                  className="shrink-0 rounded px-1.5 text-ink-faint transition hover:bg-stone-100 hover:text-rose-600"
                >
                  ×
                </button>
              </li>
            ))}
            {dated.map((b, i) => (
              <li
                key={`d${i}`}
                className="flex items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{b.label}</span>{" "}
                  <span className="text-ink-faint">
                    · {DAY_NAMES[b.day]} {formatMonthDay(b.date!)} ·{" "}
                    {formatRange(b.start, b.end)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeDated(b)}
                  aria-label={`Remove ${b.label}`}
                  className="shrink-0 rounded px-1.5 text-ink-faint transition hover:bg-stone-100 hover:text-rose-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Paint additions */}
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
        Add busy time
      </p>
      <div className="mt-1.5">
        <WeekPaintGrid initialBlocks={painted} onChange={setPainted} />
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(6,78,59,0.2)] transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving
          ? "Saving…"
          : `Save changes${
              removedCount > 0 || painted.length > 0
                ? ` (${[
                    removedCount > 0 ? `−${removedCount}` : null,
                    painted.length > 0 ? `+${painted.length}` : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")})`
                : ""
            }`}
      </button>
    </div>
  );
}
