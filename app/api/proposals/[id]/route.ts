import { NextResponse } from "next/server";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/proposals/[id]  { response: 'yes' | 'no' }  (header: x-edit-token)
// The edit token identifies which member is responding, we never trust a
// member_id from the client. Upserts the caller's RSVP.
export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(`rsvp:${clientIp(req)}`, 60)) {
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

  const response = (body as { response?: unknown }).response;
  if (response !== "yes" && response !== "no") {
    return NextResponse.json(
      { error: "response must be 'yes' or 'no'" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: proposal, error: pErr } = await supabase
    .from("proposals")
    .select("id, group_id, groups(slug)")
    .eq("id", params.id)
    .single();

  if (pErr || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("group_id", proposal.group_id)
    .eq("edit_token", token)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("proposal_rsvps")
    .upsert(
      { proposal_id: params.id, member_id: member.id, response },
      { onConflict: "proposal_id,member_id" },
    );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const slug = (proposal as unknown as { groups?: { slug?: string } }).groups
    ?.slug;
  if (slug) await broadcastGroupChange(slug);

  return NextResponse.json({ ok: true });
}

// DELETE /api/proposals/[id]  (header: x-edit-token)
// Only the group creator may delete a proposal.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(`rsvp:${clientIp(req)}`, 60)) {
    return NextResponse.json(
      { error: "Too many requests, slow down." },
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

  const { data: proposal, error: pErr } = await supabase
    .from("proposals")
    .select("id, group_id")
    .eq("id", params.id)
    .single();

  if (pErr || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const { data: group } = await supabase
    .from("groups")
    .select("creator_token, slug")
    .eq("id", proposal.group_id)
    .single();

  if (!group || token !== group.creator_token) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("proposals")
    .delete()
    .eq("id", params.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (group.slug) await broadcastGroupChange(group.slug);

  return NextResponse.json({ ok: true });
}
