import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isLocalDevWithoutSupabase } from "@/lib/devMode";

// Next.js 16 renamed Middleware to Proxy (same mechanism) — see
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
//
// This is an optimistic check only (cookie present -> has a session ->
// let the page render); it guards page navigation to /clients/*, not API
// routes. Real ownership enforcement (does this user own *this* client_id)
// happens per-request in src/lib/auth.ts, close to the data.
export async function proxy(request: NextRequest) {
  if (isLocalDevWithoutSupabase()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/clients/:path*"],
};
