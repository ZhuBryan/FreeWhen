// lib/rateLimit.ts
// Sliding-window rate limiter, in-memory. Fine for a single instance; if this
// ever runs multi-region/multi-instance, swap the Map for a shared store
// (e.g. Redis) so limits are enforced across processes.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  // Guard against unbounded growth from an endless stream of distinct keys
  // (e.g. spoofed IPs), an occasional early reset is an acceptable tradeoff
  // for not needing a background sweep.
  if (hits.size > 5000) hits.clear();

  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
