import { createClient } from "@supabase/supabase-js";

// Untyped on purpose: there's a single hand-mapped table (see ClientRow /
// rowToRecord / profileToRow in src/lib/store.ts), so we get type safety at
// that boundary instead of fighting supabase-js's generated-schema generics
// for one table.
// Server-only client: uses the service role key, so it must never be
// imported from client components. Every caller today is a route handler
// or a server component (see src/lib/store.ts).
function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local — see .env.example (Supabase section).`,
    );
  }
  return value;
}

let cached: ReturnType<typeof createClient> | null = null;

export function supabase() {
  if (!cached) {
    cached = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return cached;
}
