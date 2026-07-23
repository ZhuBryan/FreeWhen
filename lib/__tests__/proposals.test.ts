import { describe, it, expect } from "vitest";
import { validateProposal } from "@/lib/proposals";

describe("validateProposal", () => {
  it("accepts a valid proposal", () => {
    expect(
      validateProposal({ date: "2026-07-20", start: 540, end: 660 }),
    ).toEqual({ date: "2026-07-20", start: 540, end: 660 });
  });

  it("accepts a window that ends exactly at midnight", () => {
    expect(
      validateProposal({ date: "2026-07-20", start: 0, end: 1440 }),
    ).toEqual({ date: "2026-07-20", start: 0, end: 1440 });
  });

  it("rejects a non-existent calendar date", () => {
    expect(() =>
      validateProposal({ date: "2026-02-30", start: 540, end: 660 }),
    ).toThrow();
  });

  it("rejects a malformed date string", () => {
    expect(() =>
      validateProposal({ date: "junk", start: 540, end: 660 }),
    ).toThrow();
  });

  it("rejects start >= end", () => {
    expect(() =>
      validateProposal({ date: "2026-07-20", start: 660, end: 660 }),
    ).toThrow();
  });

  it("rejects negative start", () => {
    expect(() =>
      validateProposal({ date: "2026-07-20", start: -30, end: 660 }),
    ).toThrow();
  });

  it("rejects end past midnight", () => {
    expect(() =>
      validateProposal({ date: "2026-07-20", start: 540, end: 1500 }),
    ).toThrow();
  });

  it("rejects non-integer bounds", () => {
    expect(() =>
      validateProposal({ date: "2026-07-20", start: 540.5, end: 660 }),
    ).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => validateProposal(null)).toThrow();
    expect(() => validateProposal("nope")).toThrow();
    expect(() => validateProposal(42)).toThrow();
  });
});
