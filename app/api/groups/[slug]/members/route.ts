import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";
import { validateSchedule } from "@/lib/schedule";
import { colorForIndex } from "@/lib/types";
import { isValidTimeZone } from "@/lib/timezone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/[slug]/members  { name, schedule, tz? } -> { id, editToken }
export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  if (!rateLimit(`add:${clientIp(req)}`, 20)) {
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    body && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";

  if (!name) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  let schedule;
  try {
    schedule = validateSchedule((body as { schedule?: unknown }).schedule);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const tzInput = (body as { tz?: unknown }).tz;
  let tz: string | null = null;
  if (tzInput !== undefined && tzInput !== null) {
    if (!isValidTimeZone(tzInput)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    tz = tzInput;
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id")
    .eq("slug", params.slug)
    .single();

  if (gErr || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  const color = colorForIndex(count ?? 0);
  const editToken = nanoid(24);

  const { data, error } = await supabase
    .from("members")
    .insert({
      group_id: group.id,
      name,
      color,
      edit_token: editToken,
      schedule,
      tz,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not add member" },
      { status: 500 },
    );
  }

  await broadcastGroupChange(params.slug);

  return NextResponse.json({ id: data.id, editToken }, { status: 201 });
}
