"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GroupResponse, PublicMember } from "@/lib/types";
import {
  addWeeksISO,
  bestTimes,
  blocksForWeek,
  DAY_END,
  DAY_START,
  formatMonthDay,
  formatRange,
  formatWeekRange,
  formatWindow,
  minutesToLabel,
  mondayOfISO,
  todayISO,
  weekDatesISO,
  DAY_NAMES_FULL,
} from "@/lib/schedule";
import {
  getCreatorToken,
  getMyMember,
  getViewPrefs,
  setViewPrefs,
  clearMyMember,
} from "@/lib/storage";
import { subscribeToGroup } from "@/lib/realtime";
import { convertBlocks } from "@/lib/timezone";
import OverlapGrid from "@/components/OverlapGrid";
import AddScheduleFlow from "@/components/AddScheduleFlow";
import EditScheduleFlow from "@/components/EditScheduleFlow";
import ShareButton from "@/components/ShareButton";
import PlannerPanel from "@/components/PlannerPanel";

export default function GroupPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [data, setData] = useState<GroupResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">(
    "loading",
  );
  const [creatorToken, setCreatorToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; token: string } | null>(null);
  const [live, setLive] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // View preferences: which hours the grid shows, and how many people need
  // to be free for a window to count. Persisted per group.
  const [dayStart, setDayStart] = useState(DAY_START);
  const [dayEnd, setDayEnd] = useState(DAY_END);
  const [minFree, setMinFree] = useState<number | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    setCreatorToken(getCreatorToken(slug));
    setMe(getMyMember(slug));
    const prefs = getViewPrefs(slug);
    if (prefs) {
      setDayStart(prefs.dayStart);
      setDayEnd(prefs.dayEnd);
      setMinFree(prefs.minFree);
    }
    setPrefsLoaded(true);
    load();
  }, [slug, load]);

  // Live sync: subscribe to the group's realtime channel (updates the page the
  // moment anyone saves a schedule), plus refetch-on-focus as a fallback.
  useEffect(() => {
    const unsubscribe = subscribeToGroup(slug, load, setLive);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [slug, load]);

  useEffect(() => {
    if (!prefsLoaded) return;
    setViewPrefs(slug, { dayStart, dayEnd, minFree });
  }, [slug, prefsLoaded, dayStart, dayEnd, minFree]);

  // Timezone every member's schedule is displayed in — the viewer's own
  // browser zone. Members with a different stored `tz` get their schedule
  // converted before any grid/planner math sees it.
  const viewerTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  const members: PublicMember[] = useMemo(
    () =>
      (data?.members ?? []).map((m) =>
        m.tz && m.tz !== viewerTz
          ? { ...m, schedule: convertBlocks(m.schedule, m.tz, viewerTz) }
          : m,
      ),
    [data, viewerTz],
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

  const effectiveMinFree =
    minFree === null ? null : Math.min(minFree, Math.max(members.length, 1));

  const windows = useMemo(
    () =>
      bestTimes(effectiveMembers, {
        dayStart,
        dayEnd,
        minFree: effectiveMinFree ?? undefined,
      }),
    [effectiveMembers, dayStart, dayEnd, effectiveMinFree],
  );

  const isCreator = Boolean(creatorToken);

  async function copyBestTimes() {
    const lines = windows.map(
      (w, i) =>
        `${i + 1}. ${DAY_NAMES_FULL[w.day]} ${formatRange(w.start, w.end)}${
          w.free === w.total ? "" : ` (${w.free}/${w.total} free)`
        }`,
    );
    const text = [
      `${data?.group.name ?? "Group"} — best times, week of ${formatMonthDay(
        weekStart,
      )}:`,
      ...lines,
      window.location.href,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

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
          className="mt-6 inline-block rounded-lg bg-ink px-4 py-2 font-medium text-white transition hover:bg-black"
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
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {data.group.name}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-faint">
            <span>
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
            {live && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-green-700"
                title="Updates appear instantly when anyone edits"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-green-600" />
                </span>
                live
              </span>
            )}
          </p>
        </div>
        <ShareButton slug={slug} />
      </div>

      {/* Members */}
      <div className="mt-5">
        {hasMembers ? (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white py-1 pl-2 pr-1.5 text-sm"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-ink">{m.name}</span>
                {m.tz && m.tz !== viewerTz && (
                  <span className="text-[10px] text-ink-faint">
                    {m.tz.split("/").pop()?.replace(/_/g, " ")}
                  </span>
                )}
                {me?.id === m.id && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    you
                  </span>
                )}
                {canRemove(m) && (
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    aria-label={`Remove ${m.name}`}
                    className="flex h-4 w-4 items-center justify-center rounded text-ink-faint transition hover:bg-stone-100 hover:text-rose-600"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center">
            <p className="font-medium text-ink">No schedules yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Add yours first, then share the link with your friends.
            </p>
          </div>
        )}
      </div>

      {/* Add / edit schedule */}
      <div className="mt-5 space-y-2">
        {(() => {
          const myMember = me
            ? members.find((m) => m.id === me.id)
            : undefined;
          return (
            myMember &&
            me && (
              <EditScheduleFlow
                key={myMember.id + String(myMember.schedule.length)}
                member={myMember}
                token={me.token}
                onSaved={load}
              />
            )
          );
        })()}
        <AddScheduleFlow
          slug={slug}
          onAdded={load}
          buttonLabel={
            me && members.some((m) => m.id === me.id)
              ? "+ Add someone else's schedule"
              : "+ Add my schedule"
          }
        />
      </div>

      {/* Overlap + best times + planner */}
      {hasMembers && (
        <>
          <section className="mt-10">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Weekly overlap
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              Greener means more people free. Click a slot to see who&apos;s
              busy.
            </p>

            {/* Week selector */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWeekStart((w) => addWeeksISO(w, -1))}
                aria-label="Previous week"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-ink-soft transition hover:border-stone-400 hover:text-ink"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums text-ink">
                  {formatWeekRange(weekStart)}
                </span>
                {weekStart !== currentWeek && (
                  <button
                    type="button"
                    onClick={() => setWeekStart(currentWeek)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium text-ink-soft transition hover:border-stone-400 hover:text-ink"
                  >
                    Today
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addWeeksISO(w, 1))}
                aria-label="Next week"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-ink-soft transition hover:border-stone-400 hover:text-ink"
              >
                ›
              </button>
            </div>

            {/* Hours shown */}
            <div className="mt-3 flex items-center gap-2 text-sm">
              <label htmlFor="fw-day-start" className="text-ink-faint">
                Hours
              </label>
              <select
                id="fw-day-start"
                value={dayStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDayStart(v);
                  if (dayEnd <= v) setDayEnd(v + 60);
                }}
                className="rounded-md border border-stone-200 bg-white px-2 py-1 text-ink outline-none transition focus:border-stone-400"
              >
                {Array.from({ length: 24 }, (_, h) => h * 60).map((m) => (
                  <option key={m} value={m}>
                    {minutesToLabel(m).replace(":00", "")}
                  </option>
                ))}
              </select>
              <span className="text-ink-faint">to</span>
              <select
                aria-label="Day end"
                value={dayEnd}
                onChange={(e) => setDayEnd(Number(e.target.value))}
                className="rounded-md border border-stone-200 bg-white px-2 py-1 text-ink outline-none transition focus:border-stone-400"
              >
                {Array.from({ length: 24 }, (_, h) => (h + 1) * 60)
                  .filter((m) => m > dayStart)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m === 1440
                        ? "midnight"
                        : minutesToLabel(m).replace(":00", "")}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
              <OverlapGrid
                members={effectiveMembers}
                weekDates={weekDatesISO(weekStart)}
                dayStart={dayStart}
                dayEnd={dayEnd}
              />
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Best times · week of {formatMonthDay(weekStart)}
              </h2>
              {windows.length > 0 && (
                <button
                  type="button"
                  onClick={copyBestTimes}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-stone-400 hover:text-ink"
                >
                  {copied ? "Copied" : "Copy for group chat"}
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-faint">
              <span>Longest windows (60 min or more) when</span>
              {members.length > 2 ? (
                <select
                  aria-label="How many people need to be free"
                  value={effectiveMinFree ?? 0}
                  onChange={(e) =>
                    setMinFree(Number(e.target.value) || null)
                  }
                  className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-ink outline-none transition focus:border-stone-400"
                >
                  <option value={0}>everyone</option>
                  {Array.from(
                    { length: members.length - 2 },
                    (_, i) => members.length - 1 - i,
                  ).map((k) => (
                    <option key={k} value={k}>
                      at least {k} of {members.length}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-medium">everyone</span>
              )}
              <span>is free.</span>
            </div>
            {windows.length > 0 ? (
              <ul className="mt-3 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                {windows.map((w, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-ink-faint">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatWindow(w)}
                    </span>
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.free === w.total
                          ? "bg-green-100 text-green-800"
                          : "bg-stone-100 text-ink-soft"
                      }`}
                    >
                      {w.free === w.total
                        ? "everyone"
                        : `${w.free} of ${w.total} free`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-lg border border-stone-200 bg-white p-4 text-sm text-ink-soft">
                {members.length === 1
                  ? "Add more people to find shared free time."
                  : `No 60-minute window works between ${minutesToLabel(
                      dayStart,
                    )} and ${
                      dayEnd === 1440 ? "midnight" : minutesToLabel(dayEnd)
                    }. Widen the hours, lower how many people need to be free, or scan the heatmap for the closest slots.`}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Plan something
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-ink-faint">
              Scan the coming days for a slot that fits — then send it to the
              group chat or straight to a calendar.
            </p>
            <PlannerPanel members={members} groupName={data.group.name} />
          </section>
        </>
      )}
    </div>
  );
}
