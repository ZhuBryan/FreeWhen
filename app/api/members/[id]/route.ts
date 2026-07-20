import { NextResponse } from "next/server";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";
import { validateSchedule } from "@/lib/schedule";
import { isValidTimeZone } from "@/lib/timezone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/members/[id]  { schedule, tz? }  (header: x-edit-token)
// Only the member's own edit_token may rewrite their schedule.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(`edit:${clientIp(req)}`, 30)) {
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429 },
    );
  }

  const token = req.headers.get("x-edit-token");
  if (!token) {
    return NextResponse.json({ error: "Missing edit token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let schedule;
  try {
    schedule = validateSchedule((body as { schedule?: unknown }).schedule);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const tzInput = (body as { tz?: unknown }).tz;
  let tz: string | null | undefined; // undefined = leave unchanged
  if (tzInput !== undefined) {
    if (tzInput !== null && !isValidTimeZone(tzInput)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    tz = tzInput as string | null;
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("id, edit_token, groups(slug)")
    .eq("id", params.id)
    .single();

  if (error || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (token !== member.edit_token) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("members")
    .update(tz === undefined ? { schedule } : { schedule, tz })
    .eq("id", params.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const slug = (member as unknown as { groups?: { slug?: string } }).groups
    ?.slug;
  if (slug) await broadcastGroupChange(slug);

  return NextResponse.json({ ok: true });
}

// DELETE /api/members/[id]  (header: x-edit-token)
// Allowed if the token is the member's own edit_token OR the group creator_token.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(`del:${clientIp(req)}`, 20)) {
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429 },
    );
  }

  const token = req.headers.get("x-edit-token");
  if (!token) {
    return NextResponse.json({ error: "Missing edit token" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("id, group_id, edit_token")
    .eq("id", params.id)
    .single();

  if (error || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data: group } = await supabase
    .from("groups")
    .select("creator_token, slug")
    .eq("id", member.group_id)
    .single();

  const allowed =
    token === member.edit_token ||
    (group && token === group.creator_token);

  if (!allowed) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("members")
    .delete()
    .eq("id", params.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (group?.slug) await broadcastGroupChange(group.slug);

  return NextResponse.json({ ok: true });
}
