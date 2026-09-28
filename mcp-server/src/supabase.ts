import { createClient, SupabaseClient } from "@supabase/supabase-js";

// The client is intentionally untyped (no <Database> generic), mirroring the
// Next.js app's client. The hand-written Database type omits the per-table
// Relationships metadata that newer postgrest-js requires, which would make
// typed .insert()/.update() degrade to `never`. Tool functions cast results
// explicitly instead.
export type DB = SupabaseClient;

let cached: DB | null = null;

export function getSupabase(): DB {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in the environment."
    );
  }
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in the environment. " +
        "Find it in Supabase Dashboard > Project Settings > API > service_role."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
