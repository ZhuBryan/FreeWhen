import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups  { name } -> { slug, creatorToken }
export async function POST(req: Request) {
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

  const slug = nanoid(10);
  const creatorToken = nanoid(24);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("groups")
    .insert({ slug, name, creator_token: creatorToken })
    .select("slug")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create group" },
      { status: 500 },
    );
  }

  return NextResponse.json({ slug: data.slug, creatorToken }, { status: 201 });
}
