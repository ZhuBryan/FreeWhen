import { getSupabase } from "@/lib/supabase";
import { buildIcsCalendar, type CalendarEvent } from "@/lib/calendar";
import { DAY_START, DAY_END, planRange, todayISO } from "@/lib/schedule";
import type { PublicMember } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/groups/[slug]/feed.ics -> a live iCalendar feed of everyone-free
// windows over the next four weeks. Subscribe to it in Google/Apple Calendar
// (webcal://) and it re-reads on their schedule as members edit their times.
// Schedules are stored as wall-clock, so the feed inherits floating local time.
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, slug, name, created_at")
    .eq("slug", params.slug)
    .single();

  if (error || !group) {
    return new Response("Group not found", { status: 404 });
  }

  const { data: members } = await supabase
    .from("members")
    .select("id, name, color, schedule, tz")
    .eq("group_id", group.id)
    .order("created_at", { ascending: true });

  const plan = planRange((members ?? []) as PublicMember[], todayISO(), 28, {
    minMinutes: 60,
    dayStart: DAY_START,
    dayEnd: DAY_END,
  });

  const events: CalendarEvent[] = [];
  for (const day of plan) {
    for (const w of day.windows) {
      events.push({
        title: `${group.name}: everyone free`,
        dateISO: day.date,
        start: w.start,
        end: w.end,
        description: "Live feed from FreeWhen",
      });
    }
  }

  const ics = buildIcsCalendar(`${group.name}: free times`, events);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
