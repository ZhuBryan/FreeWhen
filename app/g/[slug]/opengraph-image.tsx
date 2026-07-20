// app/g/[slug]/opengraph-image.tsx
// Dynamic OG card: a mini heatmap of the group's weekly overlap. Falls back
// to a plain branded card if Supabase isn't configured or the group/fetch
// fails — link previews should never break the share flow.
import { ImageResponse } from "next/og";
import { getSupabase } from "@/lib/supabase";
import { buildGrid, DAY_NAMES } from "@/lib/schedule";
import type { PublicMember } from "@/lib/types";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Group availability heatmap";

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// rgb(240,240,241) (empty) -> rgb(21,128,61) (everyone free), by freeCount/total.
function cellColor(freeCount: number, total: number): string {
  const t = total > 0 ? freeCount / total : 0;
  const r = Math.round(240 + (21 - 240) * t);
  const g = Math.round(240 + (128 - 240) * t);
  const b = Math.round(241 + (61 - 241) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 8px)",
          gap: 2,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#16a34a" }} />
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#86efac" }} />
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#4ade80" }} />
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#22c55e" }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#18181b" }}>FreeWhen</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#ffffff",
        border: "1px solid #e4e4e7",
        padding: 64,
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Fallback() {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <Wordmark />
        <div style={{ fontSize: 40, fontWeight: 700, color: "#18181b" }}>
          Find when your friends are actually free
        </div>
      </div>
    </Card>
  );
}

export default async function Image({
  params,
}: {
  params: { slug: string };
}) {
  try {
    const supabase = getSupabase();

    const { data: group, error: gErr } = await supabase
      .from("groups")
      .select("id, name")
      .eq("slug", params.slug)
      .single();

    if (gErr || !group) return new ImageResponse(<Fallback />, size);

    const { data: members, error: mErr } = await supabase
      .from("members")
      .select("id, name, color, schedule")
      .eq("group_id", group.id);

    if (mErr) return new ImageResponse(<Fallback />, size);

    const publicMembers = (members ?? []) as PublicMember[];
    const grid = buildGrid(publicMembers);

    return new ImageResponse(
      (
        <Card>
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: 440,
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: "#18181b",
                lineHeight: 1.1,
              }}
            >
              {truncate(group.name, 28)}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>
              {publicMembers.length}{" "}
              {publicMembers.length === 1 ? "person" : "people"} · FreeWhen
            </div>
            <div style={{ display: "flex", marginTop: 12 }}>
              <Wordmark />
            </div>
          </div>

          {/* Right column: mini heatmap */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
              marginLeft: "auto",
            }}
          >
            {DAY_NAMES.map((_, day) => (
              <div key={day} style={{ display: "flex", gap: 4 }}>
                {grid[day].map((cell, slot) => (
                  <div
                    key={slot}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: cellColor(cell.freeCount, cell.total),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </Card>
      ),
      size,
    );
  } catch {
    return new ImageResponse(<Fallback />, size);
  }
}
