// lib/supabase.ts
// Server-only Supabase client. Lazy-initialised INSIDE the handler call so that
// `next build` succeeds with no env vars set (nothing runs at import time).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js caches fetch() responses in its Data Cache, and route-level
      // force-dynamic does not opt these inner requests out. Without no-store,
      // member reads freeze at their first snapshot and saves look like they
      // vanish even though the rows are in the database.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}

// Best-effort realtime broadcast after a mutation so open group pages refresh
// instantly. Uses the REST broadcast endpoint (no websocket needed server-side)
// and never fails the request that triggered it. Every mutation routes through
// here, so it doubles as the "this group is still alive" bump that keeps the
// daily idle-group prune job away.
export async function broadcastGroupChange(slug: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await getSupabase()
      .from("groups")
      .update({ last_active: new Date().toISOString() })
      .eq("slug", slug);
  } catch {
    /* best-effort only (column may not exist before the prune migration) */
  }
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          { topic: `group:${slug}`, event: "members_changed", payload: {} },
        ],
      }),
    });
  } catch {
    /* best-effort only */
  }
}
