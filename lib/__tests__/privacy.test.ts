import { describe, it, expect } from "vitest";
import { stripPrivateLabels } from "@/lib/privacy";
import type { PublicMember } from "@/lib/types";

function member(overrides: Partial<PublicMember> = {}): PublicMember {
  return {
    id: "m1",
    name: "Alex",
    color: "#e11d48",
    schedule: [
      { day: 0, start: 540, end: 660, label: "CS 350 LEC", room: "MC 4021" },
      { day: 2, start: 600, end: 720, label: "Work", date: "2026-07-22" },
    ],
    tz: null,
    shareLabels: false,
    ...overrides,
  };
}

describe("stripPrivateLabels", () => {
  it("replaces every label with \"Busy\" when shareLabels is false", () => {
    const out = stripPrivateLabels(member());
    expect(out.schedule.every((b) => b.label === "Busy")).toBe(true);
  });

  it("drops room when shareLabels is false", () => {
    const out = stripPrivateLabels(member());
    expect(out.schedule.every((b) => b.room === undefined)).toBe(true);
    expect(out.schedule.every((b) => !("room" in b))).toBe(true);
  });

  it("keeps a one-off date while stripping its label", () => {
    const out = stripPrivateLabels(member());
    const dated = out.schedule.find((b) => b.day === 2);
    expect(dated?.date).toBe("2026-07-22");
    expect(dated?.label).toBe("Busy");
  });

  it("leaves a sharer's labels and rooms untouched", () => {
    const src = member({ shareLabels: true });
    const out = stripPrivateLabels(src);
    expect(out).toBe(src);
    expect(out.schedule[0].label).toBe("CS 350 LEC");
    expect(out.schedule[0].room).toBe("MC 4021");
  });

  it("keeps an already-\"Busy\" label as \"Busy\"", () => {
    const out = stripPrivateLabels(
      member({ schedule: [{ day: 1, start: 540, end: 600, label: "Busy" }] }),
    );
    expect(out.schedule[0].label).toBe("Busy");
  });

  it("does not mutate the input schedule", () => {
    const src = member();
    stripPrivateLabels(src);
    expect(src.schedule[0].label).toBe("CS 350 LEC");
    expect(src.schedule[0].room).toBe("MC 4021");
  });
});
