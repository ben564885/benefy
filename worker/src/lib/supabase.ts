import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Same service-role-key pattern as the web app's src/lib/supabase.ts —
// bypasses RLS, server-only, never exposed to a browser. This worker has
// no browser-facing surface at all.
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
