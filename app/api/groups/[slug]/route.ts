import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/groups/[slug] -> { group, members(id, name, color, schedule, tz) }
// Never returns edit_token or creator_token.
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

  return NextResponse.json({ group, members: members ?? [] });
}
