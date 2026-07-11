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
  -- ApplicationProfile (src/lib/types.ts): fields real application forms
  -- need beyond eligibility screening (address, account numbers, household
  -- member SSNs). ssn_encrypted / household_members[].ssn_encrypted hold
  -- AES-256-GCM ciphertext only — see src/lib/apply/crypto.ts. Never
  -- selected by any API route that returns to the browser un-redacted.
  application_profile jsonb not null default '{
    "legal_name": null, "date_of_birth": null, "street_address": null,
    "city": null, "mailing_zip_code": null, "phone": null, "email": null,
    "preferred_language": null, "pge_account_number": null,
    "sfpuc_account_number": null, "household_members": [],
    "ssn_last4": null, "ssn_encrypted": null
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- The app talks to this table exclusively through the Supabase service-role
-- key from server-side route handlers, so RLS stays enabled with no public
-- policies: only the service role (which bypasses RLS) can touch it.
alter table public.clients enable row level security;

-- Recorded once per apply action (which may authorize several programs at
-- once via the "confirm all" flow), so program_ids is an array rather than
-- a consent-per-submission row. Created before submissions, which
-- references it.
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(client_id) on delete cascade,
  program_ids text[] not null,
  consent_text_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.consents enable row level security;
create index if not exists consents_client_id_idx on public.consents(client_id);

-- One row per (client, program) apply job. The web app enqueues rows here
-- and reads status; only the worker (worker/, a separate DO App Platform
-- component) advances status past "collecting_info" — see
-- src/lib/types.ts SubmissionStatus for the full state machine.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(client_id) on delete cascade,
  program_id text not null,
  apply_mode text not null check (apply_mode in ('web_submit', 'pdf_fill', 'assisted')),
  status text not null default 'queued' check (
    status in ('queued', 'collecting_info', 'filling', 'awaiting_review', 'submitting', 'submitted', 'failed', 'needs_human')
  ),
  consent_id uuid not null references public.consents(id),
  artifacts jsonb not null default '[]'::jsonb,
  receipt_note text,
  error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.submissions enable row level security;

create index if not exists submissions_client_id_idx on public.submissions(client_id);
-- Worker claim query: "give me the oldest queued/awaiting-confirm row not
-- already claimed" — this index carries that scan.
create index if not exists submissions_status_created_idx on public.submissions(status, created_at);
