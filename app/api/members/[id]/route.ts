import { NextResponse } from "next/server";
import { broadcastGroupChange, getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/members/[id]  (header: x-edit-token)
// Allowed if the token is the member's own edit_token OR the group creator_token.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
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
