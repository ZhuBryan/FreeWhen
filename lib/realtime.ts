// lib/realtime.ts: client-side live sync. Subscribes to a Supabase Realtime
// broadcast channel per group; API routes broadcast after every mutation, so
// every open group page refreshes the instant someone adds or removes a
// schedule. Needs the *public* anon key (safe to expose, the database itself
// is only reachable through the service-role API routes; RLS-off tables are
// not readable over realtime broadcast).
//
// If NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are unset the
// app quietly falls back to refetch-on-focus.
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Subscribe to change events for a group. Returns an unsubscribe function.
// `onStatus(true)` fires once the websocket is actually joined (drives the
// "Live" indicator); `onChange` fires on every broadcast.
export function subscribeToGroup(
  slug: string,
  onChange: () => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const supabase = getClient();
  if (!supabase) return () => {};

  const channel: RealtimeChannel = supabase
    .channel(`group:${slug}`)
    .on("broadcast", { event: "members_changed" }, () => onChange())
    .subscribe((status) => {
      onStatus?.(status === "SUBSCRIBED");
    });

  return () => {
    onStatus?.(false);
    supabase.removeChannel(channel);
  };
}
