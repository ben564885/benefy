export type ImmigrationStatus = "citizen" | "lpr" | "other" | "unknown";

export type FieldStatus = "captured" | "missing" | "asked";

export interface ClientProfile {
  client_id: string;
  display_name: string;
  household_size: number | null;
  monthly_income_gross: number | null;
  annual_income_gross: number | null;
  member_ages: number[];
  has_senior: boolean | null;
  has_disability: boolean | null;
  immigration_status: ImmigrationStatus | null;
  sf_resident: boolean | null;
  zip_code: string | null;
  current_programs: string[];
  intake_notes: string;
  field_status: Record<string, FieldStatus>;
  last_screened_at: string | null;
}

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
