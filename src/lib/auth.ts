import { getClient, getClientOwnerId } from "@/lib/store";
import { createServerSupabaseClient } from "@/lib/supabase-auth/serverClient";
import type { ClientRecord } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// The one place that decides "is this request allowed to touch this
// client_id" — every user-facing route handler and server-component page
// that takes a client_id calls this before doing anything else. See
// supabase/002_auth.sql for the matching RLS policies (defense-in-depth;
// this is the enforcement that actually runs, since routes use the
// service-role client, which bypasses RLS).

export async function getAuthedUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type OwnedClientResult =
  | { ok: true; user: User; record: ClientRecord }
  | { ok: false; status: 401 | 403 | 404 };

export async function requireOwnedClient(clientId: string): Promise<OwnedClientResult> {
  const user = await getAuthedUser();
  if (!user) return { ok: false, status: 401 };

  const ownerId = await getClientOwnerId(clientId);
  if (ownerId === null) return { ok: false, status: 404 };
  if (ownerId !== user.id) return { ok: false, status: 403 };

  const record = await getClient(clientId);
  if (!record) return { ok: false, status: 404 };

  return { ok: true, user, record };
}
