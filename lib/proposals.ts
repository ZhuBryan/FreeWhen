// lib/proposals.ts
// Event-proposal types and payload validation. Pure TS, no deps.
import { weekdayForISODate } from "@/lib/schedule";

export type ProposalRsvp = { member_id: string; response: "yes" | "no" };

export type Proposal = {
  id: string;
  date: string;
  start: number;
  end: number;
  rsvps: ProposalRsvp[];
};

// Validates + normalises an incoming proposal body. Returns clean fields or
// throws. `date` must be a real YYYY-MM-DD; the window must satisfy
// 0 <= start < end <= 1440 with integer minute bounds.
export function validateProposal(input: unknown): {
  date: string;
  start: number;
  end: number;
} {
  if (typeof input !== "object" || input === null) {
    throw new Error("proposal must be an object");
  }
  const b = input as Record<string, unknown>;
  const date = b.date;
  const start = b.start;
  const end = b.end;

  if (typeof date !== "string" || weekdayForISODate(date) === null) {
    throw new Error("date must be a real YYYY-MM-DD calendar date");
  }
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end)
  ) {
    throw new Error("start and end must be integers");
  }
  if (!(start >= 0 && start < end && end <= 1440)) {
    throw new Error("proposal requires 0 <= start < end <= 1440");
  }

  return { date, start, end };
}
