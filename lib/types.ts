// lib/types.ts
import type { Block } from "@/lib/parseQuest";

export type { Block };

// A member as returned by GET (never includes edit_token).
export type PublicMember = {
  id: string;
  name: string;
  color: string;
  schedule: Block[];
  tz?: string | null;
};

export type Group = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type GroupResponse = {
  group: Group;
  members: PublicMember[];
};

// Fixed 10-colour palette, assigned by member count (index = count % 10).
export const MEMBER_COLORS = [
  "#e11d48", // rose
  "#f59e0b", // amber / gold
  "#16a34a", // green
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#db2777", // pink
  "#0d9488", // teal
  "#ea580c", // orange
  "#4f46e5", // indigo
  "#65a30d", // lime
] as const;

export function colorForIndex(i: number): string {
  return MEMBER_COLORS[i % MEMBER_COLORS.length];
}
