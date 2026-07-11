// Local development without Supabase credentials — in-memory persistence
// and a fixed dev user so the screening flow is testable after `npm run dev`
// without copying .env.local first. Disabled in production builds.

export const DEV_USER_ID = "local-dev-user";

export function isLocalDevWithoutSupabase(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}
