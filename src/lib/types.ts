export type ImmigrationStatus = "citizen" | "lpr" | "other" | "unknown";

export type FieldStatus = "captured" | "missing" | "asked";

// A household member's identity details, collected only when a specific
// program adapter requires them (e.g. LIHEAP asks for SSNs of every income
// earner in the household). ssn_encrypted is AES-256-GCM ciphertext (see
// src/lib/apply/crypto.ts) — the plaintext SSN is never stored or logged.
export interface HouseholdMember {
  full_name: string;
  date_of_birth: string | null;
  relationship: string | null;
  has_income: boolean | null;
  ssn_encrypted: string | null;
}

// Fields real benefit application forms ask for beyond what the eligibility
// engine needs. Nullable throughout: the apply flow's gap-fill step is what
// prompts for these, one program's requirements at a time, rather than the
// intake conversation front-loading fields most users will never need.
export interface ApplicationProfile {
  legal_name: string | null;
  date_of_birth: string | null;
  street_address: string | null;
  city: string | null;
  mailing_zip_code: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: "en" | "es" | null;
  pge_account_number: string | null;
  sfpuc_account_number: string | null;
  household_members: HouseholdMember[];
  ssn_last4: string | null;
  ssn_encrypted: string | null;
}

export interface ClientProfile {
  client_id: string;
  display_name: string;
  household_size: number | null;
  monthly_income_gross: number | null;
  annual_income_gross: number | null;
  member_ages: number[];
  has_senior: boolean | null;
  has_disability: boolean | null;
  is_veteran: boolean | null;
  immigration_status: ImmigrationStatus | null;
  sf_resident: boolean | null;
  zip_code: string | null;
  current_programs: string[];
  intake_notes: string;
  field_status: Record<string, FieldStatus>;
  last_screened_at: string | null;
  application_profile: ApplicationProfile;
}

export const EMPTY_APPLICATION_PROFILE: ApplicationProfile = {
  legal_name: null,
  date_of_birth: null,
  street_address: null,
  city: null,
  mailing_zip_code: null,
  phone: null,
  email: null,
  preferred_language: null,
  pge_account_number: null,
  sfpuc_account_number: null,
  household_members: [],
  ssn_last4: null,
  ssn_encrypted: null,
};

// fpl_pct / ami_pct: standard percent-of-basis test against the shared FPL/AMI
// tables (fpl_table.json / ami_table.json).
// dollar_table: a program-specific income ceiling table (e.g. PG&E FERA's own
// schedule), shaped like value_estimate's table_by_household_size.
// flat_annual_income_cap: a single dollar ceiling not scaled by household size
// (e.g. CalEITC's earned-income cap).
// none: no income test at all — eligibility here turns entirely on the other
// gates (categorical/immigration/sf_resident/senior_or_disabled).
// manual: a real income/asset test exists but isn't expressible as a simple
// percentage or dollar ceiling (SSI-style countable-income exclusions, asset
// limits, funding-limited priority systems) — always resolves to needs_review
// rather than guessing, unless a categorical_pass hit or hard gate applies.
export type IncomeTestType = "fpl_pct" | "ami_pct" | "dollar_table" | "flat_annual_income_cap" | "none" | "manual";

export interface ProgramDefinition {
  program_id: string;
  name: string;
  level: "federal" | "state" | "county" | "sf_local" | "regional" | "utility";
  administered_by: string;
  short_description: string;
  required_documents?: string[];
  eligibility: {
    income_test: {
      basis: "annual_gross";
      type: IncomeTestType;
      max_pct?: number;
      dollar_table?: { annual_by_household_size: Record<string, number>; additional_person_annual: number };
      max_amount?: number;
    };
    categorical_pass: string[];
    requires_sf_resident: boolean;
    immigration_sensitive: boolean;
    // If set, only these immigration statuses can pass this gate at all (e.g.
    // CAPI is only for noncitizens ineligible for SSI due to status — citizens
    // should apply to SSI instead). Independent of immigration_sensitive,
    // which governs the "unknown/other → needs_review" caution downstream.
    immigration_required?: ImmigrationStatus[];
    requires_senior_or_disabled: boolean;
    senior_age_cutoff?: number;
  };
  value_estimate:
    | {
        method: "table_by_household_size";
        annual_by_household_size: Record<string, number>;
        additional_person_annual: number;
      }
    | { method: "fixed"; annual_value: number };
  application: {
    form_name: string;
    form_url: string;
    prefill_map: Record<string, string>;
    // web_submit: a worker adapter fills and submits a real online form.
    // pdf_fill: a worker adapter generates a completed, downloadable PDF.
    // assisted: no automation exists (auth-walled portal, in-person step, or
    // lottery/informational page) — the user gets the existing prefill-sheet
    // handoff only. Defaults to "assisted" when omitted.
    apply_mode?: "web_submit" | "pdf_fill" | "assisted";
    // True only when this program's worker adapter is verified end-to-end —
    // it must match that adapter's `verified` flag (worker/src/adapters/).
    // The results page offers real "Apply automatically" only for ready
    // programs, and the apply API refuses to enqueue one without it, so an
    // apply_mode of web_submit/pdf_fill whose adapter is still unverified is
    // shown but not actually run. Defaults to false when omitted.
    auto_apply_ready?: boolean;
    // ApplicationProfile / HouseholdMember keys (dot-path for household
    // members, e.g. "household_members[].ssn_encrypted") this program's
    // adapter needs beyond ClientProfile. Drives the apply flow's gap-fill
    // step. Omitted/empty for assisted-mode programs.
    required_application_fields?: string[];
  };
}

export type EligibilityStatus = "likely_eligible" | "likely_ineligible" | "needs_review";

export interface EligibilityResult {
  program_id: string;
  status: EligibilityStatus;
  confidence: number;
  income_pct_fpl: number | null;
  reason: string;
  estimated_annual_value: number;
  missing_fields: string[];
  review_triggers: string[];
}

export interface ScreeningResult {
  client_id: string;
  screened_at: string;
  results: EligibilityResult[];
  total_estimated_annual_value: number;
  total_estimated_monthly_value: number;
  potential_additional_value: number;
  eligible_count: number;
  needs_review_count: number;
  ineligible_count: number;
}

export interface ClientRecord {
  profile: ClientProfile;
  last_screening: ScreeningResult | null;
}

export interface TraceStep {
  step: string;
  actor: "intake_agent" | "navigator_agent" | "function" | "router";
  detail: string;
  timestamp: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// One submission job per program a client applies to. The worker (see
// worker/) is the only process that moves a row past "collecting_info" —
// the web app only enqueues and reads status.
export type SubmissionStatus =
  | "queued"
  | "collecting_info"
  | "filling"
  | "awaiting_review"
  | "submitting"
  | "submitted"
  | "failed"
  | "needs_human";

export interface SubmissionArtifact {
  kind: "screenshot" | "pdf" | "receipt";
  label: string;
  // Signed/relative URL into private Supabase Storage, or a data URL for
  // small receipts — never a public link.
  url: string;
  created_at: string;
}

export interface Submission {
  id: string;
  client_id: string;
  program_id: string;
  apply_mode: "web_submit" | "pdf_fill" | "assisted";
  status: SubmissionStatus;
  consent_id: string;
  artifacts: SubmissionArtifact[];
  receipt_note: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
}

// Recorded once per apply action (which may cover several programs at
// once), not once per submission — see the "confirm all" flow.
export interface Consent {
  id: string;
  client_id: string;
  program_ids: string[];
  consent_text_version: string;
  accepted_at: string;
}
