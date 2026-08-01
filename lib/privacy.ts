// lib/privacy.ts
// Per-member label privacy. A member who hasn't opted in to sharing labels
// exposes only that they're busy, never what with: every block's label is
// collapsed to the generic "Busy" and any room is dropped before the schedule
// leaves the server. Sharers are returned untouched.
import type { Block, PublicMember } from "@/lib/types";

// Collapse a private member's blocks to "Busy" (dropping rooms), or return the
// member unchanged when they share labels. Pure; never mutates the input.
export function stripPrivateLabels(member: PublicMember): PublicMember {
  if (member.shareLabels) return member;
  const schedule: Block[] = member.schedule.map((b) => {
    // Rebuild without `room` so private rooms never leave the server.
    const clean: Block = { day: b.day, start: b.start, end: b.end, label: "Busy" };
    if (b.date) clean.date = b.date;
    return clean;
  });
  return { ...member, schedule };
}
