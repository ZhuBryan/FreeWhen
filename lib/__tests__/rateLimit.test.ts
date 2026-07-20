import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("allows up to the limit", () => {
    const key = `allow-${Math.random()}`;
    expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(true);
  });

  it("blocks the request after the limit", () => {
    const key = `block-${Math.random()}`;
    expect(rateLimit(key, 2)).toBe(true);
    expect(rateLimit(key, 2)).toBe(true);
    expect(rateLimit(key, 2)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1)).toBe(true);
    expect(rateLimit(a, 1)).toBe(false);
    expect(rateLimit(b, 1)).toBe(true);
  });

  it("allows requests again once the window expires", async () => {
    const key = `expire-${Math.random()}`;
    expect(rateLimit(key, 1, 50)).toBe(true);
    expect(rateLimit(key, 1, 50)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit(key, 1, 50)).toBe(true);
  });
});
