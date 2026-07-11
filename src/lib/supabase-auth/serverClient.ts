import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Anon-key client for Server Components / Route Handlers — reads the
// session from cookies to answer "who is making this request", nothing
// more. Data access still goes through the service-role client
// (src/lib/supabase.ts); this one exists only so auth.getUser() can be
// checked server-side, which is what src/lib/auth.ts calls.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render — proxy.ts already
            // refreshes the session cookie on the way in, so this is safe
            // to ignore here.
          }
        },
      },
    },
  );
}
