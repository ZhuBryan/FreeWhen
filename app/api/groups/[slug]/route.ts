import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Proposal, ProposalRsvp } from "@/lib/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/groups/[slug] -> { group, members(id, name, color, schedule, tz),
// proposals }. Never returns edit_token or creator_token.
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
    .select("id, name, color, schedule, tz")
    .eq("group_id", group.id)
    .order("created_at", { ascending: true });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

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

  return NextResponse.json({ group, members: members ?? [], proposals });
}
