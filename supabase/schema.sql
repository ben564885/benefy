-- Benefy persistence schema. Run this once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query) against your new project.
--
-- One row per screening session. chat_history / trace / last_screening are
-- stored as jsonb blobs (read/replaced wholesale, matching how the app used
-- to hold them in-memory) rather than normalized child tables, since nothing
-- ever queries into them individually.

create table if not exists public.clients (
  client_id text primary key,
  display_name text not null default 'You',
  household_size integer,
  monthly_income_gross numeric,
  annual_income_gross numeric,
  member_ages integer[] not null default '{}',
  has_senior boolean,
  has_disability boolean,
  immigration_status text,
  sf_resident boolean,
  zip_code text,
  current_programs text[] not null default '{}',
  intake_notes text not null default '',
  field_status jsonb not null default '{}'::jsonb,
  last_screened_at timestamptz,
  last_screening jsonb,
  chat_history jsonb not null default '[]'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- The app talks to this table exclusively through the Supabase service-role
-- key from server-side route handlers, so RLS stays enabled with no public
-- policies: only the service role (which bypasses RLS) can touch it.
alter table public.clients enable row level security;
