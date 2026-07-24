"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LeafSprig from "@/components/LeafSprig";

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

// Believable group names the input placeholder cycles through. The first is the
// SSR default (kept in sync with the initial JSX placeholder).
const PLACEHOLDERS = [
  "e.g. CS 350 study crew",
  "e.g. intramural dodgeball",
  "e.g. pho friday",
  "e.g. co-op house",
  "e.g. climbing gang",
  "e.g. MATH 239 survivors",
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
  const [phIndex, setPhIndex] = useState(0);

  // Rotate the input placeholder through a few believable group names so the
  // empty state feels alive. First value matches the SSR default.
  useEffect(() => {
    const id = setInterval(
      () => setPhIndex((i) => (i + 1) % PLACEHOLDERS.length),
      2500,
    );
    return () => clearInterval(id);
  }, []);

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
    <div className="mx-auto max-w-4xl px-5 pb-20 pt-12 sm:pt-16">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="hero-grid pointer-events-none absolute -inset-x-16 -top-24 bottom-0 -z-10"
          aria-hidden
        />
        {/* Botanical accents: they peek from the edges, cropped by the hero's
            overflow, and sit behind the opaque preview card so they read as
            paper texture rather than illustration. */}
        <LeafSprig
          className="pointer-events-none absolute -right-16 -top-12 -z-10 hidden h-80 rotate-[18deg] text-gold-500 opacity-[0.07] sm:block"
        />
        <LeafSprig
          className="pointer-events-none absolute -bottom-10 -left-14 -z-10 h-44 -rotate-[26deg] scale-x-[-1] text-gold-500 opacity-[0.06]"
        />
        <div className="grid items-center gap-10 sm:grid-cols-[1.05fr_0.95fr] sm:gap-12">
          {/* Left: pitch + form */}
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Schedule overlap for friend groups
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Find the time everyone&apos;s{" "}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">actually free</span>
                <span
                  className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-gold-200/70"
                  aria-hidden
                />
              </span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
              Everyone adds their schedule once: paste it, import a calendar
              file, or enter it by hand. FreeWhen overlaps them, shows when the
              whole group is open, and finds days that work for events.
            </p>

            {/* Create form: inline, resting on a hairline instead of a card */}
            <form
              onSubmit={createGroup}
              className="mt-8 border-t border-stone-200 pt-6"
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
                  placeholder={PLACEHOLDERS[phIndex]}
                  maxLength={80}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
                />
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="shrink-0 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(6,78,59,0.2)] transition hover:bg-gold-600 hover:shadow-[0_2px_8px_rgba(6,78,59,0.25)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-[0_1px_2px_rgba(6,78,59,0.2)]"
                >
                  {loading ? "Creating…" : "Create group"}
                </button>
              </div>
              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
              <p className="mt-3 text-xs text-ink-faint">
                No accounts, no sign-ups. You get a private link to share.
              </p>
            </form>
          </div>

          {/* Right: product preview, lifted slightly off the page and tilted a
              hair so it straightens on hover */}
          <div className="group/card sm:pl-2">
            <div className="-rotate-[0.7deg] rounded-xl border border-stone-200 bg-white p-4 shadow-[0_12px_32px_-16px_rgba(6,78,59,0.18)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-0.5 hover:rotate-0 hover:shadow-[0_18px_40px_-18px_rgba(6,78,59,0.28)] motion-reduce:transform-none">
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
                      className="fw-pour h-3.5 rounded-[3px]"
                      style={{
                        backgroundColor: previewShade(level),
                        animationDelay: `${(r * 7 + c) * 12}ms`,
                      }}
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
        </div>
      </div>

      {/* How it works */}
      <div className="mt-20">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
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
            <li key={s.n} className="border-t border-stone-300 pt-4">
              <span className="font-mono text-xs font-medium text-gold-600">
                {s.n}
              </span>
              <h3 className="mt-3 text-[15px] font-semibold text-ink">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {s.d}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
