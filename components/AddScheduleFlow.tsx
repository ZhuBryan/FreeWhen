"use client";

import { useMemo, useRef, useState } from "react";
import { parseQuest, type Block } from "@/lib/parseQuest";
import { parseGeneric } from "@/lib/parseGeneric";
import { parseIcs } from "@/lib/parseIcs";
import {
  DAY_NAMES,
  DAY_START,
  DAY_END,
  SLOT,
  formatMonthDay,
  formatRange,
  minutesToLabel,
} from "@/lib/schedule";
import { setMyMember } from "@/lib/storage";

type Mode = "quest" | "ics" | "manual";

// Group blocks that share a label + time range, collecting their days — used to
// render compact previews like "Seminar · Tue/Thu · 1:30–2:50 PM".
type BlockGroup = { label: string; start: number; end: number; days: number[] };
function groupBlocks(blocks: Block[]): BlockGroup[] {
  const map = new Map<string, BlockGroup>();
  for (const b of blocks) {
    const key = `${b.label}|${b.start}|${b.end}`;
    const g = map.get(key);
    if (g) g.days.push(b.day);
    else map.set(key, { label: b.label, start: b.start, end: b.end, days: [b.day] });
  }
  return [...map.values()].map((g) => ({
    ...g,
    days: g.days.sort((a, b) => a - b),
  }));
}

type ManualRow = {
  id: number;
  label: string;
  days: number[]; // 0 = Mon … 6 = Sun
  start: number; // minutes from midnight
  end: number; // minutes from midnight
};

// 8:00 AM … 10:00 PM in 30-min steps, matching the overlap grid.
const TIME_OPTIONS: number[] = [];
for (let t = DAY_START; t <= DAY_END; t += SLOT) TIME_OPTIONS.push(t);

let nextRowId = 1;
function newRow(): ManualRow {
  return { id: nextRowId++, label: "", days: [], start: 9 * 60, end: 17 * 60 };
}

export default function AddScheduleFlow({
  slug,
  onAdded,
}: {
  slug: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [icsText, setIcsText] = useState("");
  const [icsFileName, setIcsFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("quest");
  const [rows, setRows] = useState<ManualRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuest(raw), [raw]);
  // Lenient fallback: if Quest finds nothing, try the generic day+time scanner.
  const genericBlocks = useMemo(
    () => (parsed.blocks.length === 0 && raw.trim() ? parseGeneric(raw) : []),
    [parsed.blocks.length, raw],
  );
  const usingGeneric = parsed.blocks.length === 0 && genericBlocks.length > 0;
  const pasteBlocks = parsed.blocks.length > 0 ? parsed.blocks : genericBlocks;
  const questBlocks = pasteBlocks;

  const icsResult = useMemo(() => parseIcs(icsText), [icsText]);
  const icsBlocks = icsResult.blocks;
  const icsRecurring = useMemo(
    () => icsBlocks.filter((b) => !b.date),
    [icsBlocks],
  );
  const icsDated = useMemo(
    () =>
      icsBlocks
        .filter((b) => b.date)
        .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.start - b.start)),
    [icsBlocks],
  );

  // One block per selected day; skip rows with no days or a bad time range.
  const manualBlocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    for (const r of rows) {
      if (r.days.length === 0 || r.end <= r.start) continue;
      const label = r.label.trim() || "Busy";
      for (const day of r.days) {
        out.push({ day, start: r.start, end: r.end, label });
      }
    }
    return out;
  }, [rows]);

  const allBlocks = useMemo(
    () => [...pasteBlocks, ...icsBlocks, ...manualBlocks],
    [pasteBlocks, icsBlocks, manualBlocks],
  );
  const hasBlocks = allBlocks.length > 0;

  // Combined-total line, e.g. "12 from Quest + 4 from calendar + 2 manual".
  const totalParts: string[] = [];
  if (pasteBlocks.length > 0) {
    totalParts.push(
      `${pasteBlocks.length} ${usingGeneric ? "from text" : "from Quest"}`,
    );
  }
  if (icsBlocks.length > 0) totalParts.push(`${icsBlocks.length} from calendar`);
  if (manualBlocks.length > 0) totalParts.push(`${manualBlocks.length} manual`);

  function updateRow(id: number, patch: Partial<ManualRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function toggleDay(id: number, day: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              days: r.days.includes(day)
                ? r.days.filter((d) => d !== day)
                : [...r.days, day].sort((a, b) => a - b),
            }
          : r,
      ),
    );
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(id: number) {
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.id !== id)));
  }

  function handleIcsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIcsFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setIcsText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function save() {
    if (!name.trim() || !hasBlocks) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), schedule: allBlocks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setMyMember(slug, data.id, data.editToken);
      setOpen(false);
      setName("");
      setRaw("");
      setIcsText("");
      setIcsFileName(null);
      setRows([newRow()]);
      setMode("quest");
      onAdded();
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
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-gold-500 px-4 py-3 font-semibold text-white transition hover:bg-gold-600"
      >
        + Add my schedule
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Add your schedule</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <label className="mt-3 block text-sm font-medium text-ink-soft">
        Your name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="e.g. Alex"
        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
      />

      {/* Mode toggle */}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
        {(
          [
            ["quest", "Paste schedule"],
            ["ics", "Import calendar"],
            ["manual", "Enter manually"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-lg px-1.5 py-1.5 text-center text-xs font-medium transition sm:text-sm ${
              mode === value
                ? "bg-white text-ink shadow-sm"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "quest" && (
        <>
          <label className="mt-4 block text-sm font-medium text-ink-soft">
            Paste schedule
          </label>
          <p className="mt-0.5 text-xs text-ink-faint">
            Works with UW Quest — or any text with days and times.
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder="CS 350 - Operating Systems&#10;1234  001  LEC  MWF 10:30AM - 11:20AM  MC 4021 ..."
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />

          {/* Live paste preview */}
          {raw.trim() && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3">
              {pasteBlocks.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No classes or times detected yet — make sure you copied the
                  whole schedule.
                </p>
              ) : usingGeneric ? (
                <>
                  <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    Parsed as generic schedule text
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Detected {genericBlocks.length} block
                    {genericBlocks.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {groupBlocks(genericBlocks).map((g, i) => (
                      <li key={i} className="text-sm text-ink-soft">
                        <span className="font-semibold text-ink">{g.label}</span>{" "}
                        · {g.days.map((d) => DAY_NAMES[d]).join("/")} ·{" "}
                        {formatRange(g.start, g.end)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Detected {questBlocks.length} class block
                    {questBlocks.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {parsed.courses
                      .filter((c) => c.meetings.length > 0)
                      .map((c) => (
                        <li key={c.code} className="text-sm">
                          <span className="font-semibold text-ink">
                            {c.code}
                          </span>{" "}
                          <span className="text-ink-faint">{c.title}</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {c.meetings.map((m, i) => (
                              <li key={i} className="text-xs text-ink-soft">
                                {m.component ? `${m.component} · ` : ""}
                                {m.days.map((d) => DAY_NAMES[d]).join("/")}{" "}
                                {formatRange(m.start, m.end)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                  </ul>
                </>
              )}

              {!usingGeneric && parsed.warnings.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <span className="font-semibold">Heads up:</span>
                  <ul className="mt-1 list-disc pl-4">
                    {parsed.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === "ics" && (
        <>
          <label className="mt-4 block text-sm font-medium text-ink-soft">
            Import a calendar file
          </label>
          <p className="mt-0.5 text-xs text-ink-faint">
            Export a <code>.ics</code> from Google Calendar, Outlook, or Apple
            Calendar. Repeating events and one-time events (up to a year ahead)
            are both imported.
          </p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-center transition hover:border-gold-400 hover:bg-gold-50"
          >
            <span className="text-sm font-medium text-ink-soft">
              Upload .ics file
            </span>
            <span className="mt-0.5 text-xs text-ink-faint">
              {icsFileName ? `Loaded: ${icsFileName}` : "Click to choose a file"}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={handleIcsFile}
            className="sr-only"
          />

          <label className="mt-4 block text-sm font-medium text-ink-soft">
            or paste the .ics text
          </label>
          <textarea
            value={icsText}
            onChange={(e) => {
              setIcsText(e.target.value);
              setIcsFileName(null);
            }}
            rows={5}
            placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;DTSTART;TZID=America/Toronto:20260907T093000 ..."
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />

          {/* Live calendar preview */}
          {icsText.trim() && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3">
              {icsBlocks.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No events found yet — check that this is a calendar export
                  (.ics) with timed events.
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Imported {icsBlocks.length} block
                    {icsBlocks.length === 1 ? "" : "s"}
                    {icsDated.length > 0 &&
                      ` · ${icsDated.length} one-time event${
                        icsDated.length === 1 ? "" : "s"
                      }`}
                  </p>
                  {icsRecurring.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {groupBlocks(icsRecurring).map((g, i) => (
                        <li key={i} className="text-sm text-ink-soft">
                          <span className="font-semibold text-ink">{g.label}</span>{" "}
                          · {g.days.map((d) => DAY_NAMES[d]).join("/")} ·{" "}
                          {formatRange(g.start, g.end)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {icsDated.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        One-time
                      </p>
                      <ul className="mt-1 space-y-1">
                        {icsDated.slice(0, 6).map((b, i) => (
                          <li key={i} className="text-sm text-ink-soft">
                            <span className="font-semibold text-ink">
                              {b.label}
                            </span>{" "}
                            · {DAY_NAMES[b.day]} {formatMonthDay(b.date!)} ·{" "}
                            {formatRange(b.start, b.end)}
                          </li>
                        ))}
                        {icsDated.length > 6 && (
                          <li className="text-xs text-ink-faint">
                            …and {icsDated.length - 6} more
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </>
              )}

              {icsResult.warnings.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <span className="font-semibold">Heads up:</span>
                  <ul className="mt-1 list-disc pl-4">
                    {icsResult.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === "manual" && (
        <>
          <label className="mt-4 block text-sm font-medium text-ink-soft">
            Enter busy times by hand
          </label>
          <p className="mt-0.5 text-xs text-ink-faint">
            Work, another school, appointments — anything that blocks your week.
          </p>

          <div className="mt-2 space-y-3">
            {rows.map((r) => {
              const badRange = r.end <= r.start;
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={r.label}
                      onChange={(e) =>
                        updateRow(r.id, { label: e.target.value })
                      }
                      maxLength={60}
                      placeholder="Label (e.g. Work)"
                      className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      aria-label="Remove row"
                      className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-ink-faint hover:bg-stone-200 hover:text-ink"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Day toggles */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {DAY_NAMES.map((d, di) => {
                      const on = r.days.includes(di);
                      return (
                        <button
                          key={di}
                          type="button"
                          onClick={() => toggleDay(r.id, di)}
                          className={`min-w-[38px] flex-1 rounded-lg px-1 py-1.5 text-xs font-medium transition ${
                            on
                              ? "bg-gold-500 text-white"
                              : "bg-white text-ink-soft ring-1 ring-stone-300 hover:ring-gold-300"
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>

                  {/* Time range */}
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={r.start}
                      onChange={(e) =>
                        updateRow(r.id, { start: Number(e.target.value) })
                      }
                      className="w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {minutesToLabel(t)}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-sm text-ink-faint">to</span>
                    <select
                      value={r.end}
                      onChange={(e) =>
                        updateRow(r.id, { end: Number(e.target.value) })
                      }
                      className="w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {minutesToLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {badRange && (
                    <p className="mt-1.5 text-xs text-rose-600">
                      End time must be after the start time.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-2 w-full rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-ink-soft transition hover:border-gold-300 hover:text-ink"
          >
            + Add another
          </button>

          {/* Manual summary */}
          {manualBlocks.length > 0 && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {manualBlocks.length} manual block
                {manualBlocks.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-2 space-y-1">
                {rows
                  .filter((r) => r.days.length > 0 && r.end > r.start)
                  .map((r) => (
                    <li key={r.id} className="text-sm text-ink-soft">
                      <span className="font-semibold text-ink">
                        {r.label.trim() || "Busy"}
                      </span>{" "}
                      · {r.days.map((d) => DAY_NAMES[d]).join(", ")} ·{" "}
                      {formatRange(r.start, r.end)}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Combined total, e.g. "12 from Quest + 4 from calendar + 2 manual". */}
      {hasBlocks && (
        <p className="mt-3 text-xs text-ink-faint">
          {totalParts.length > 1
            ? totalParts.join(" + ")
            : `${allBlocks.length} block${allBlocks.length === 1 ? "" : "s"} total`}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim() || !hasBlocks}
        className="mt-4 w-full rounded-xl bg-gold-500 px-4 py-2.5 font-semibold text-white transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save my schedule"}
      </button>
      {!saving && (!name.trim() || !hasBlocks) && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          {!name.trim()
            ? "Enter your name above to save."
            : "Nothing to save yet — paste, import, or add at least one busy time."}
        </p>
      )}
    </div>
  );
}
