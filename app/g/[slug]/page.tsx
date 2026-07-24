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
  minutesToLabel,
  mondayOfISO,
  sharedLabels,
  todayISO,
  weekDatesISO,
  weekdayForISODate,
  DAY_NAMES,
  DAY_NAMES_FULL,
} from "@/lib/schedule";
import {
  getCreatorToken,
  getMyMember,
  getViewPrefs,
  setViewPrefs,
  setMyMember,
  clearMyMember,
} from "@/lib/storage";
import { subscribeToGroup } from "@/lib/realtime";
import { convertBlocks } from "@/lib/timezone";
import LeafSprig from "@/components/LeafSprig";
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
  const [feedCopied, setFeedCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [hoursEditing, setHoursEditing] = useState(false);

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
    // A "use on my phone" link carries the edit token in the URL fragment
    // (#me=id:token); the fragment never reaches the server or logs. Adopt that
    // identity, persist it locally, then scrub the hash from the address bar.
    const handoff = location.hash.match(/^#me=([^:]+):(.+)$/);
    if (handoff) {
      setMyMember(slug, handoff[1], handoff[2]);
      history.replaceState(null, "", location.pathname);
      setMe({ id: handoff[1], token: handoff[2] });
    } else {
      setMe(getMyMember(slug));
    }
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

  // Timezone every member's schedule is displayed in: the viewer's own
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

  // Classes two or more members share. Computed from the RAW (unconverted)
  // schedules so timezone shifting can never break the exact time match.
  const shared = useMemo(() => sharedLabels(data?.members ?? []), [data]);

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
      `${data?.group.name ?? "Group"}: best times, week of ${formatMonthDay(
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

  // Copy a webcal:// subscribe URL for the live everyone-free feed.
  async function copyFeed() {
    const url = `webcal://${location.host}/api/groups/${slug}/feed.ics`;
    try {
      await navigator.clipboard.writeText(url);
      setFeedCopied(true);
      setTimeout(() => setFeedCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  // Hand this browser's edit identity to another device. The token rides in the
  // URL fragment so it never reaches the server or logs.
  async function useOnPhone() {
    if (!me) return;
    const url = `${location.origin}/g/${slug}#me=${me.id}:${me.token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "FreeWhen", url });
      } catch {
        /* share dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000);
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

  async function rsvp(proposalId: string, response: "yes" | "no") {
    if (!me) return;
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-edit-token": me.token },
      body: JSON.stringify({ response }),
    });
    if (res.ok) load();
    else alert("Could not save your response.");
  }

  async function deleteProposal(proposalId: string) {
    if (!creatorToken) return;
    if (!confirm("Delete this proposal?")) return;
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: "DELETE",
      headers: { "x-edit-token": creatorToken },
    });
    if (res.ok) load();
    else alert("Could not delete proposal.");
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
          className="mt-6 inline-block rounded-lg bg-gold-500 px-4 py-2 font-medium text-white shadow-[0_1px_2px_rgba(6,78,59,0.2)] transition hover:bg-gold-600 hover:shadow-[0_2px_8px_rgba(6,78,59,0.25)] active:scale-[0.98]"
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
  const myMember = me ? members.find((m) => m.id === me.id) : undefined;
  // "Saved" once the visitor has their own schedule in this group. This flips
  // the page from action-first (big add CTA) to answer-first (availability on
  // top, a quiet action row below).
  const hasSaved = Boolean(myMember && me);

  const hoursLabel = `${minutesToLabel(dayStart).replace(":00", "")} to ${
    dayEnd === 1440 ? "midnight" : minutesToLabel(dayEnd).replace(":00", "")
  }`;

  // The full add flow used as the top-of-page primary CTA before the visitor
  // has saved anything.
  const addPrimaryBlock = (
    <div className="mt-5">
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
  );

  // Once saved, the same actions collapse into one quiet row that sits below
  // the answer instead of competing with it.
  const compactActionRow = myMember && me && (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      <EditScheduleFlow
        key={myMember.id + String(myMember.schedule.length)}
        member={myMember}
        token={me.token}
        onSaved={load}
      />
      <AddScheduleFlow
        slug={slug}
        onAdded={load}
        buttonLabel="+ Add someone else's schedule"
      />
      <button
        type="button"
        onClick={useOnPhone}
        title="Open your schedule on another device, no re-entering it"
        className="text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
      >
        {phoneCopied ? "Link copied, open on your phone" : "Use on my phone"}
      </button>
    </div>
  );

  const availabilitySection = (
    <section
      className="fw-fade border-t border-stone-200/70 pt-8"
      style={{ animationDelay: "0ms" }}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        Availability
      </p>
      <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
        Weekly overlap
      </h2>
      <p className="mt-0.5 text-sm text-ink-faint">
        Greener means more people free. Click a slot to see who&apos;s busy.
      </p>

      {/* Week selector */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addWeeksISO(w, -1))}
          aria-label="Previous week"
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-ink-soft transition hover:bg-stone-100 hover:text-ink"
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
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-ink-soft transition hover:bg-stone-100 hover:text-ink"
        >
          ›
        </button>
      </div>

      {/* Hours shown: one quiet line that reveals the two selects on demand. */}
      <div className="mt-3 text-sm text-ink-faint">
        {hoursEditing ? (
          <div className="flex items-center gap-2">
            <label htmlFor="fw-day-start">Hours</label>
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
            <span>to</span>
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
        ) : (
          <span>
            <span className="text-ink-soft">{hoursLabel}</span>{" "}
            <span aria-hidden>·</span>{" "}
            <button
              type="button"
              onClick={() => setHoursEditing(true)}
              className="font-medium text-gold-700 underline underline-offset-2 hover:text-gold-600"
            >
              change
            </button>
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-4">
        <OverlapGrid
          members={effectiveMembers}
          weekDates={weekDatesISO(weekStart)}
          dayStart={dayStart}
          dayEnd={dayEnd}
        />
      </div>

      {/* One clear next step when it's still just you: share the link. */}
      {hasSaved && members.length === 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3">
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">Now share the link</span> so
            friends can add theirs.
          </p>
          <ShareButton slug={slug} />
        </div>
      )}
    </section>
  );

  const bestTimesSection = (
    <section
      className="fw-fade mt-14 border-t border-stone-200/70 pt-8"
      style={{ animationDelay: "60ms" }}
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            Recommended
          </p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
            Best times · week of {formatMonthDay(weekStart)}
          </h2>
        </div>
        {windows.length > 0 && (
          <button
            type="button"
            onClick={copyBestTimes}
            className="shrink-0 text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
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
            onChange={(e) => setMinFree(Number(e.target.value) || null)}
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
        <ul className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {windows.map((w, i) => (
            <li
              key={i}
              className="group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gold-50"
            >
              <span className="w-6 shrink-0 font-mono text-xs font-medium tabular-nums text-ink-faint transition-colors group-hover/row:text-gold-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold tabular-nums text-ink">
                  {formatRange(w.start, w.end)}
                </span>
                <span className="text-xs text-ink-faint">
                  {DAY_NAMES_FULL[w.day]}
                </span>
              </span>
              <span
                className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  w.free === w.total
                    ? "bg-gold-50 text-gold-700 ring-1 ring-gold-200"
                    : "bg-stone-100 text-ink-soft"
                }`}
              >
                {w.free === w.total ? "everyone" : `${w.free} of ${w.total} free`}
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
  );

  const proposalsSection = (data.proposals ?? []).length > 0 && (
    <section
      className="fw-fade mt-14 border-t border-stone-200/70 pt-8"
      style={{ animationDelay: "120ms" }}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        Proposed
      </p>
      <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
        Proposed hangouts
      </h2>
      <ul className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {(data.proposals ?? []).map((p) => {
          const wd = weekdayForISODate(p.date);
          const yesVoters = p.rsvps
            .filter((r) => r.response === "yes")
            .map((r) => members.find((m) => m.id === r.member_id))
            .filter((m): m is PublicMember => Boolean(m));
          const myResponse = me
            ? p.rsvps.find((r) => r.member_id === me.id)?.response
            : undefined;
          return (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {wd !== null ? DAY_NAMES[wd] : ""}{" "}
                  <span className="font-normal text-ink-faint">
                    {formatMonthDay(p.date)}
                  </span>
                </span>
                <span className="text-sm font-medium tabular-nums text-ink">
                  {formatRange(p.start, p.end)}
                </span>
                <span className="flex items-center gap-1">
                  {yesVoters.map((m) => (
                    <span
                      key={m.id}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold uppercase text-white"
                      style={{ backgroundColor: m.color }}
                      title={m.name}
                      aria-hidden
                    >
                      {m.name.trim().charAt(0) || "?"}
                    </span>
                  ))}
                  <span className="text-xs text-ink-faint">
                    {yesVoters.length} going
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {me && (
                    <span className="inline-flex overflow-hidden rounded-md ring-1 ring-stone-200">
                      <button
                        type="button"
                        onClick={() => rsvp(p.id, "yes")}
                        aria-pressed={myResponse === "yes"}
                        className={`px-2.5 py-1 text-xs font-medium transition ${
                          myResponse === "yes"
                            ? "bg-gold-500 text-white"
                            : "bg-white text-ink-soft hover:text-ink"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => rsvp(p.id, "no")}
                        aria-pressed={myResponse === "no"}
                        className={`border-l border-stone-200 px-2.5 py-1 text-xs font-medium transition ${
                          myResponse === "no"
                            ? "bg-stone-700 text-white"
                            : "bg-white text-ink-soft hover:text-ink"
                        }`}
                      >
                        No
                      </button>
                    </span>
                  )}
                  {isCreator && (
                    <button
                      type="button"
                      onClick={() => deleteProposal(p.id)}
                      aria-label="Delete proposal"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition hover:bg-stone-100 hover:text-rose-600"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const plannerSection = (
    <section
      className="fw-fade mt-14 border-t border-stone-200/70 pt-8"
      style={{ animationDelay: "180ms" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            Planner
          </p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
            Plan something
          </h2>
        </div>
        <button
          type="button"
          onClick={copyFeed}
          title="Subscribe in Google/Apple Calendar, updates as schedules change"
          className="shrink-0 text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {feedCopied ? "Link copied" : "Calendar feed"}
        </button>
      </div>
      <p className="mb-3 mt-0.5 text-sm text-ink-faint">
        Scan the coming days for a slot that fits, then send it to the group
        chat or straight to a calendar.
      </p>
      <PlannerPanel
        members={members}
        groupName={data.group.name}
        slug={slug}
        myToken={me?.token ?? null}
        onProposed={load}
      />
    </section>
  );

  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-8">
      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 overflow-hidden">
        {/* A single sprig tucked behind the share action, low enough to read as
            texture on the paper rather than an illustration. */}
        <LeafSprig
          className="pointer-events-none absolute -right-8 -top-12 -z-10 h-36 rotate-[16deg] text-gold-500 opacity-[0.05]"
        />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {data.group.name}
          </h1>
          <p className="mt-1.5 flex items-center gap-2.5 text-sm text-ink-faint">
            <span className="tabular-nums">
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
            {live && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700"
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
                className="group inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 py-1 pl-1 pr-3 text-sm transition-colors hover:border-stone-300 hover:bg-white"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
                  style={{ backgroundColor: m.color }}
                  aria-hidden
                >
                  {m.name.trim().charAt(0) || "?"}
                </span>
                <span className="font-medium text-ink">{m.name}</span>
                {m.tz && m.tz !== viewerTz && (
                  <span className="text-[10px] text-ink-faint">
                    {m.tz.split("/").pop()?.replace(/_/g, " ")}
                  </span>
                )}
                {me?.id === m.id && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-600">
                    you
                  </span>
                )}
                {canRemove(m) && (
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    aria-label={`Remove ${m.name}`}
                    className="-mr-1.5 flex h-5 w-5 items-center justify-center rounded-full text-ink-faint opacity-0 transition hover:bg-stone-100 hover:text-rose-600 focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
            <LeafSprig
              className="pointer-events-none mx-auto mb-2 h-9 text-gold-500 opacity-[0.15]"
            />
            <p className="font-medium text-ink">Nobody here yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Add yours first, then share the link with your friends.
            </p>
          </div>
        )}
      </div>

      {/* Same classes: labels 2+ members share at the exact same time */}
      {members.length >= 2 && shared.length > 0 && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Same classes
          </p>
          <ul className="mt-2 space-y-1.5">
            {shared.map((s) => (
              <li
                key={s.label}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="font-semibold text-ink">{s.label}</span>
                {s.room && (
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-faint">
                    {s.room}
                  </span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {s.memberIds.map((id) => {
                    const m = data.members.find((x) => x.id === id);
                    if (!m) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-ink-soft"
                      >
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold uppercase text-white"
                          style={{ backgroundColor: m.color }}
                          aria-hidden
                        >
                          {m.name.trim().charAt(0) || "?"}
                        </span>
                        {m.name}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Answer-first once you've saved; action-first until then. Each state
          leaves exactly one obvious next step. */}
      {hasSaved && hasMembers ? (
        <div className="mt-12">
          {availabilitySection}
          {bestTimesSection}
          {compactActionRow}
          {proposalsSection}
          {plannerSection}
        </div>
      ) : (
        <>
          {addPrimaryBlock}
          {hasMembers && (
            <div className="mt-12">
              {availabilitySection}
              {bestTimesSection}
              {proposalsSection}
              {plannerSection}
            </div>
          )}
        </>
      )}
    </div>
  );
}
