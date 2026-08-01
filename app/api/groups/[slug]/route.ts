import { NextResponse } from "next/server";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { stripPrivateLabels } from "@/lib/privacy";
import type { Block, PublicMember } from "@/lib/types";
import type { Proposal, ProposalRsvp } from "@/lib/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/groups/[slug]  { name }  (header: x-edit-token = creator_token)
// Renames the group. Only the group creator (who holds creator_token) may do it.
export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } },
) {
  if (!rateLimit(`rename:${clientIp(req)}`, 20)) {
    return NextResponse.json(
      { error: "Too many requests, slow down." },
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

  const name =
    body && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  if (!name) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Group name is too long" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, creator_token")
    .eq("slug", params.slug)
    .single();
  if (error || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (token !== group.creator_token) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("groups")
    .update({ name })
    .eq("id", group.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await broadcastGroupChange(params.slug);
  return NextResponse.json({ ok: true });
}

// GET /api/groups/[slug] -> { group, members(id, name, color, schedule, tz,
// shareLabels), proposals }. Never returns edit_token or creator_token.
// Members who haven't opted in to sharing labels have their block labels
// collapsed to "Busy" (and rooms dropped) before leaving the server, so private
// labels never reach other viewers. The owner recovers their own real labels
// via GET /api/members/[id] (see that route), merged client-side.
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, slug, name, created_at")
    .eq("slug", params.slug)
    .single();

  if (error || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: members, error: mErr } = await supabase
    .from("members")
    .select("id, name, color, schedule, tz, share_labels")
    .eq("group_id", group.id)
    .order("created_at", { ascending: true });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // Map DB rows to the public shape, then strip labels for members who keep
  // theirs private so what they're busy with never leaves the server.
  const publicMembers: PublicMember[] = (members ?? []).map((m) =>
    stripPrivateLabels({
      id: m.id,
      name: m.name,
      color: m.color,
      schedule: (m.schedule ?? []) as Block[],
      tz: m.tz,
      shareLabels: m.share_labels === true,
    }),
  );

  const { data: propRows, error: pErr } = await supabase
    .from("proposals")
    .select("id, date, start_min, end_min")
    .eq("group_id", group.id)
    .order("date", { ascending: true });

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const ids = (propRows ?? []).map((p) => p.id);
  const rsvpsByProposal = new Map<string, ProposalRsvp[]>();
  if (ids.length > 0) {
    const { data: rsvpRows, error: rErr } = await supabase
      .from("proposal_rsvps")
      .select("proposal_id, member_id, response")
      .in("proposal_id", ids);
    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }
    for (const r of rsvpRows ?? []) {
      const list = rsvpsByProposal.get(r.proposal_id) ?? [];
      list.push({ member_id: r.member_id, response: r.response });
      rsvpsByProposal.set(r.proposal_id, list);
    }
  }

  const proposals: Proposal[] = (propRows ?? []).map((p) => ({
    id: p.id,
    date: p.date,
    start: p.start_min,
    end: p.end_min,
    rsvps: rsvpsByProposal.get(p.id) ?? [],
  }));

  return NextResponse.json({ group, members: publicMembers, proposals });
}
