-- Run after schema.sql. Ties each screening session to a real signed-in
-- user (see the OTP email sign-in flow) instead of trusting an unguarded
-- client_id in the URL.

alter table public.clients add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists clients_user_id_idx on public.clients(user_id);

-- Existing rows created before auth existed have no owner and are now
-- orphaned/unreachable through the app (RLS below only matches a real
-- user_id) — fine for a pre-launch app with no real users yet.

drop policy if exists "Users can view their own clients" on public.clients;
create policy "Users can view their own clients"
  on public.clients for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own clients" on public.clients;
create policy "Users can insert their own clients"
  on public.clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own clients" on public.clients;
create policy "Users can update their own clients"
  on public.clients for update
  using (auth.uid() = user_id);

-- These policies matter for defense-in-depth (e.g. a future direct
-- client-side Supabase query); the app's route handlers use the
-- service-role key today, which bypasses RLS, and enforce ownership
-- explicitly in code instead — see src/lib/auth.ts requireOwnedClient().
