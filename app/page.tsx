"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="mx-auto max-w-2xl px-5 pb-16 pt-14 sm:pt-20">
      {/* Hero */}
      <div className="text-center">
        <span className="inline-block rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold-700">
          for UW friend groups
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
          Find when your friends are{" "}
          <span className="text-gold-600">actually free</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-ink-soft">
          Everyone adds their schedule once — paste your Quest schedule, import
          a calendar file, or add busy times by hand. FreeWhen overlaps them and
          shows the times your whole group is open — no back-and-forth texting.
        </p>
      </div>

      {/* Create form */}
      <form
        onSubmit={createGroup}
        className="mx-auto mt-9 max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
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
            className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-ink outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="shrink-0 rounded-xl bg-gold-500 px-5 py-2.5 font-semibold text-white transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create group"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <p className="mt-3 text-xs text-ink-faint">
          No account needed. You&apos;ll get a private link to share.
        </p>
      </form>

      {/* How it works */}
      <div className="mt-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-ink-faint">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Create a group",
              d: "Give it a name and get a shareable link.",
            },
            {
              n: "2",
              t: "Everyone adds theirs",
              d: "Paste your Quest schedule, import a calendar file, or add times by hand.",
            },
            {
              n: "3",
              t: "See the overlap",
              d: "A heatmap of free time plus the best windows to meet.",
            },
          ].map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-stone-200 bg-white p-4"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 font-bold text-gold-700">
                {s.n}
              </div>
              <h3 className="mt-3 font-semibold text-ink">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
