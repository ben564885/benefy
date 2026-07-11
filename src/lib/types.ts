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

export type IncomeTestType = "fpl_pct" | "ami_pct";

export interface ProgramDefinition {
  program_id: string;
  name: string;
  level: "state" | "utility" | "sf_local";
  administered_by: string;
  short_description: string;
  required_documents?: string[];
  eligibility: {
    income_test: { basis: "annual_gross"; type: IncomeTestType; max_pct: number };
    categorical_pass: string[];
    requires_sf_resident: boolean;
    immigration_sensitive: boolean;
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
