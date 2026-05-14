import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.ts";

export type DB = SupabaseClient<Database>;

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

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
