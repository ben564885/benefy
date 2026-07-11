"use client";

import { createBrowserClient } from "@supabase/ssr";

// Anon-key client for the browser — auth only (sign-in/sign-up/session).
// Never use this for data access; all data reads/writes go through server
// route handlers backed by the service-role client (src/lib/supabase.ts).
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
