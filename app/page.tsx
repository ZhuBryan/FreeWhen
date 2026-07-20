"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Static product preview: a week of overlap data baked in so the landing page
// shows the actual output (heatmap + best window) before anyone signs up.
const PREVIEW: number[][] = [
  [1, 1, 2, 1, 2, 3, 3],
  [0, 1, 1, 0, 1, 3, 4],
  [0, 0, 1, 0, 1, 4, 4],
  [1, 0, 0, 1, 2, 4, 3],
  [2, 1, 1, 2, 2, 3, 2],
  [1, 2, 1, 1, 3, 2, 2],
  [2, 3, 2, 2, 4, 2, 1],
  [3, 4, 3, 3, 4, 1, 1],
  [4, 4, 4, 3, 4, 1, 2],
  [3, 4, 4, 4, 3, 2, 2],
];

function previewShade(level: number): string {
  // 0 = all busy … 4 = all free (matches the real grid's interpolation).
  const from = [240, 240, 241];
  const to = [21, 128, 61];
  const f = level / 4;
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      try {
        localStorage.setItem(`freewhen:creator:${data.slug}`, data.creatorToken);
      } catch {
        /* storage may be blocked; the link still works */
      }
      router.push(`/g/${data.slug}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-14 sm:pt-20">
      {/* Hero */}
      <div className="text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Schedule overlap for friend groups
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
          Find the time everyone&apos;s{" "}
          <span className="underline decoration-green-500 decoration-4 underline-offset-4">
            actually free
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-soft">
          Everyone adds their schedule once — paste it, import a calendar file,
          or enter it by hand. FreeWhen overlaps them, shows when the whole
          group is open, and finds days that work for events.
        </p>
      </div>

      {/* Create form */}
      <form
        onSubmit={createGroup}
        className="mx-auto mt-9 max-w-md rounded-xl border border-stone-200 bg-white p-5"
      >
        <label
          htmlFor="group-name"
          className="block text-sm font-medium text-ink-soft"
        >
          Name your group
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CS 350 study crew"
            maxLength={80}
            className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-ink outline-none transition focus:border-stone-500"
          />
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="shrink-0 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Creating…" : "Create group"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <p className="mt-3 text-xs text-ink-faint">
          No accounts, no sign-ups — you get a private link to share.
        </p>
      </form>

      {/* Product preview */}
      <div className="mx-auto mt-10 max-w-md">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ink-soft">
              4 people · week of Nov 9
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              live
            </span>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-[3px]" aria-hidden>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div
                key={i}
                className="pb-0.5 text-center text-[10px] font-medium text-ink-faint"
              >
                {d}
              </div>
            ))}
            {PREVIEW.map((row, r) =>
              row.map((level, c) => (
                <div
                  key={`${r}-${c}`}
                  className="h-3 rounded-[3px]"
                  style={{ backgroundColor: previewShade(level) }}
                />
              )),
            )}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
            <span className="text-xs font-medium tabular-nums text-ink">
              Best: Friday · 7:00–10:00 PM
            </span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              everyone free
            </span>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          Live preview of a group page
        </p>
      </div>

      {/* How it works */}
      <div className="mt-16">
        <h2 className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          How it works
        </h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "Create a group",
              d: "Give it a name and get a shareable link.",
            },
            {
              n: "02",
              t: "Everyone adds theirs",
              d: "Paste a class schedule, import a calendar file, or add times by hand.",
            },
            {
              n: "03",
              t: "See what works",
              d: "A live heatmap of free time, the best windows to meet, and days that fit an event.",
            },
          ].map((s) => (
            <li key={s.n} className="bg-white p-4">
              <span className="font-mono text-xs text-ink-faint">{s.n}</span>
              <h3 className="mt-2 text-sm font-semibold text-ink">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {s.d}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
