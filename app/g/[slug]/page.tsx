"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GroupResponse, PublicMember } from "@/lib/types";
import {
  addWeeksISO,
  bestTimes,
  blocksForWeek,
  formatMonthDay,
  formatWeekRange,
  formatWindow,
  mondayOfISO,
  todayISO,
  weekDatesISO,
} from "@/lib/schedule";
import {
  getCreatorToken,
  getMyMember,
  clearMyMember,
} from "@/lib/storage";
import OverlapGrid from "@/components/OverlapGrid";
import AddScheduleFlow from "@/components/AddScheduleFlow";
import ShareButton from "@/components/ShareButton";

export default function GroupPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [data, setData] = useState<GroupResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">(
    "loading",
  );
  const [creatorToken, setCreatorToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; token: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${slug}`, { cache: "no-store" });
      if (res.status === 404) {
        setStatus("notfound");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const json = (await res.json()) as GroupResponse;
      setData(json);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    setCreatorToken(getCreatorToken(slug));
    setMe(getMyMember(slug));
    load();
  }, [slug, load]);

  const members: PublicMember[] = useMemo(
    () => data?.members ?? [],
    [data],
  );

  // Week-aware view: recurring blocks always apply; dated one-offs only count
  // in the week they fall in.
  const currentWeek = useMemo(() => mondayOfISO(todayISO()), []);
  const [weekStart, setWeekStart] = useState<string>(currentWeek);

  const effectiveMembers: PublicMember[] = useMemo(
    () =>
      members.map((m) => ({
        ...m,
        schedule: blocksForWeek(m.schedule, weekStart),
      })),
    [members, weekStart],
  );

  const windows = useMemo(() => bestTimes(effectiveMembers), [effectiveMembers]);

  const isCreator = Boolean(creatorToken);

  async function removeMember(m: PublicMember) {
    const isMe = me?.id === m.id;
    const token = isMe ? me?.token : creatorToken;
    if (!token) return;
    if (!confirm(`Remove ${m.name} from this group?`)) return;
    const res = await fetch(`/api/members/${m.id}`, {
      method: "DELETE",
      headers: { "x-edit-token": token },
    });
    if (res.ok) {
      if (isMe) {
        clearMyMember(slug);
        setMe(null);
      }
      load();
    } else {
      alert("Could not remove member.");
    }
  }

  function canRemove(m: PublicMember): boolean {
    return isCreator || me?.id === m.id;
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center text-ink-faint">
        Loading…
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="text-2xl font-bold text-ink">Group not found</h1>
        <p className="mt-2 text-ink-soft">
          This link may be wrong or the group was removed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gold-500 px-4 py-2 font-semibold text-white hover:bg-gold-600"
        >
          Create a new group
        </Link>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center text-ink-soft">
        Something went wrong loading this group.{" "}
        <button onClick={load} className="underline">
          Retry
        </button>
      </div>
    );
  }

  const hasMembers = members.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs font-medium text-gold-600">
            FreeWhen
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
            {data.group.name}
          </h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {members.length} {members.length === 1 ? "person" : "people"} · share
            to add more
          </p>
        </div>
        <ShareButton slug={slug} />
      </div>

      {/* Members */}
      <div className="mt-5">
        {hasMembers ? (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white py-1 pl-2 pr-1 text-sm"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-ink">{m.name}</span>
                {me?.id === m.id && (
                  <span className="text-[10px] font-semibold uppercase text-gold-600">
                    you
                  </span>
                )}
                {canRemove(m) && (
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    aria-label={`Remove ${m.name}`}
                    className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-ink-faint transition hover:bg-stone-100 hover:text-rose-600"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center">
            <p className="font-medium text-ink">No schedules yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Add yours first, then share the link with your friends.
            </p>
          </div>
        )}
      </div>

      {/* Add schedule */}
      <div className="mt-5">
        <AddScheduleFlow slug={slug} onAdded={load} />
      </div>

      {/* Overlap + best times */}
      {hasMembers && (
        <>
          <section className="mt-9">
            <h2 className="text-lg font-bold text-ink">Weekly overlap</h2>
            <p className="text-sm text-ink-faint">
              Greener = more people free. Tap a slot to see who&apos;s busy.
            </p>

            {/* Week selector */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWeekStart((w) => addWeeksISO(w, -1))}
                aria-label="Previous week"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-ink-soft transition hover:border-gold-300 hover:text-ink"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  Week of {formatWeekRange(weekStart)}
                </span>
                {weekStart !== currentWeek && (
                  <button
                    type="button"
                    onClick={() => setWeekStart(currentWeek)}
                    className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-medium text-gold-700 transition hover:bg-gold-200"
                  >
                    This week
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addWeeksISO(w, 1))}
                aria-label="Next week"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-ink-soft transition hover:border-gold-300 hover:text-ink"
              >
                ›
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
              <OverlapGrid
                members={effectiveMembers}
                weekDates={weekDatesISO(weekStart)}
              />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold text-ink">
              Best times to meet · week of {formatMonthDay(weekStart)}
            </h2>
            <p className="text-sm text-ink-faint">
              Longest windows when <span className="font-medium">everyone</span>{" "}
              is free (60 min or more).
            </p>
            {windows.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {windows.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-green-900">
                      {formatWindow(w)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4 text-sm text-ink-soft">
                {members.length === 1
                  ? "Add more people to find shared free time."
                  : "No 60-minute window works for everyone between 8 AM and 10 PM. Try the heatmap above for the closest slots."}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
