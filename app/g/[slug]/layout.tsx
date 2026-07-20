// app/g/[slug]/layout.tsx
// Per-group <title>/description so shared links show the group name instead
// of the generic site title. Falls back silently if Supabase isn't
// configured or the group can't be found — metadata should never 500 a page.
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const supabase = getSupabase();
    const { data: group, error } = await supabase
      .from("groups")
      .select("name")
      .eq("slug", params.slug)
      .single();

    if (error || !group) return { title: "FreeWhen" };

    return {
      title: `${group.name} · FreeWhen`,
      description:
        "See when everyone in this group is free — live schedule overlap.",
    };
  } catch {
    return { title: "FreeWhen" };
  }
}

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
