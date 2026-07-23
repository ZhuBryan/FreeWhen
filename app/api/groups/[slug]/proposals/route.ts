import { NextResponse } from "next/server";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";
import { validateProposal } from "@/lib/proposals";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/[slug]/proposals  { date, start, end }  (header: x-edit-token)
// The token must be the group's creator_token or any member's edit_token in
// this group: proposing is open to everyone who belongs to the group.
export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  if (!rateLimit(`propose:${clientIp(req)}`, 20)) {
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

  let proposal;
  try {
    proposal = validateProposal(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id, creator_token")
    .eq("slug", params.slug)
    .single();

  if (gErr || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  let allowed = token === group.creator_token;
  if (!allowed) {
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("group_id", group.id)
      .eq("edit_token", token)
      .limit(1)
      .maybeSingle();
    allowed = Boolean(member);
  }

  if (!allowed) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      group_id: group.id,
      date: proposal.date,
      start_min: proposal.start,
      end_min: proposal.end,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create proposal" },
      { status: 500 },
    );
  }

  await broadcastGroupChange(params.slug);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
