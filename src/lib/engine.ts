import fplTable from "@/config/fpl_table.json";
import amiTable from "@/config/ami_table.json";
import programsConfig from "@/config/programs.json";
import type {
  ClientProfile,
  EligibilityResult,
  ImmigrationStatus,
  ProgramDefinition,
  ScreeningResult,
} from "@/lib/types";

const REQUIRED_BASE_FIELDS = [
  "household_size",
  "income",
  "sf_resident",
  "immigration_status",
] as const;

const BORDERLINE_BAND_POINTS = 5;
const CLEAR_MARGIN_POINTS = 10;

function fplForHouseholdSize(size: number): number {
  const table = fplTable.annual_by_household_size as Record<string, number>;
  const max = 8;
  if (size <= max) return table[String(size)];
  return table[String(max)] + fplTable.additional_person_annual * (size - max);
}

function amiForHouseholdSize(size: number): number {
  const table = amiTable.annual_100pct_by_household_size as Record<string, number>;
  const max = 8;
  if (size <= max) return table[String(size)];
  return table[String(max)] + amiTable.additional_person_annual * (size - max);
}

function dollarTableFor(
  table: { annual_by_household_size: Record<string, number>; additional_person_annual: number },
  size: number,
): number {
  const max = 8;
  if (size <= max) return table.annual_by_household_size[String(size)];
  return table.annual_by_household_size[String(max)] + table.additional_person_annual * (size - max);
}

// Resolves any of the four percentage/dollar-comparable income test types to
// a common (basis, maxPct, label) shape so the same borderline-band logic in
// evaluateProgram can drive all of them. dollar_table and
// flat_annual_income_cap treat their own ceiling as the "100%" line.
function incomeBasisFor(
  program: ProgramDefinition,
  householdSize: number,
): { basis: number; maxPct: number; label: string } {
  const test = program.eligibility.income_test;
  if (test.type === "fpl_pct") {
    return { basis: fplForHouseholdSize(householdSize), maxPct: test.max_pct as number, label: "FPL" };
  }
  if (test.type === "ami_pct") {
    return { basis: amiForHouseholdSize(householdSize), maxPct: test.max_pct as number, label: "Bay Area AMI" };
  }
  if (test.type === "dollar_table") {
    return {
      basis: dollarTableFor(test.dollar_table!, householdSize),
      maxPct: 100,
      label: `${program.name}'s income limit`,
    };
  }
  // flat_annual_income_cap
  return { basis: test.max_amount as number, maxPct: 100, label: `${program.name}'s income limit` };
}

function annualIncomeOf(profile: ClientProfile): number | null {
  if (profile.annual_income_gross != null) return profile.annual_income_gross;
  if (profile.monthly_income_gross != null) return profile.monthly_income_gross * 12;
  return null;
}

function missingBaseFields(profile: ClientProfile): string[] {
  const missing: string[] = [];
  if (profile.household_size == null) missing.push("household_size");
  if (annualIncomeOf(profile) == null) missing.push("monthly_income_gross");
  if (profile.sf_resident == null) missing.push("sf_resident");
  if (profile.immigration_status == null) missing.push("immigration_status");
  return missing;
}

function valueEstimateFor(program: ProgramDefinition, householdSize: number): number {
  const ve = program.value_estimate;
  if (ve.method === "fixed") return ve.annual_value;
  const table = ve.annual_by_household_size;
  const max = 8;
  if (householdSize <= max) return table[String(householdSize)];
  return table[String(max)] + ve.additional_person_annual * (householdSize - max);
}

function evaluateProgram(profile: ClientProfile, program: ProgramDefinition): EligibilityResult {
  const base: EligibilityResult = {
    program_id: program.program_id,
    status: "needs_review",
    confidence: 0.5,
    income_pct_fpl: null,
    reason: "",
    estimated_annual_value: 0,
    missing_fields: [],
    review_triggers: [],
  };

  // 1. Completeness check — base fields, plus senior/disability if this program needs it.
  const missing = missingBaseFields(profile);
  if (
    program.eligibility.requires_senior_or_disabled &&
    profile.has_senior == null &&
    profile.has_disability == null
  ) {
    missing.push("has_senior_or_has_disability");
  }
  if (missing.length > 0) {
    return {
      ...base,
      status: "needs_review",
      confidence: 0.5,
      reason: `Missing required information: ${missing.join(", ")}.`,
      missing_fields: missing,
      review_triggers: ["missing_required_field"],
    };
  }

  // 2. Hard gates.
  if (program.eligibility.requires_sf_resident && profile.sf_resident === false) {
    return {
      ...base,
      status: "likely_ineligible",
      confidence: 0.9,
      reason: `${program.name} requires San Francisco residency; you are not an SF resident.`,
    };
  }
  if (program.eligibility.requires_senior_or_disabled) {
    const cutoff = program.eligibility.senior_age_cutoff ?? 65;
    const isSenior =
      profile.has_senior === true || profile.member_ages.some((a) => a >= cutoff);
    const isDisabled = profile.has_disability === true;
    if (!isSenior && !isDisabled) {
      return {
        ...base,
        status: "likely_ineligible",
        confidence: 0.9,
        reason: `${program.name} requires you (or a household member) to be a senior (${cutoff}+) or have a qualifying disability; neither applies.`,
      };
    }
  }
  if (
    program.eligibility.immigration_required &&
    !program.eligibility.immigration_required.includes(profile.immigration_status as ImmigrationStatus)
  ) {
    return {
      ...base,
      status: "likely_ineligible",
      confidence: 0.85,
      reason: `${program.name} is restricted to specific immigration statuses that don't include yours (${profile.immigration_status}).`,
    };
  }

  const householdSize = profile.household_size as number;
  const annualIncome = annualIncomeOf(profile) as number;
  const testType = program.eligibility.income_test.type;
  const hasScalableIncomeTest = testType !== "none" && testType !== "manual";
  const { pctOfBasis, maxPct, basisLabel } = hasScalableIncomeTest
    ? (() => {
        const { basis, maxPct, label } = incomeBasisFor(program, householdSize);
        return { pctOfBasis: Math.round((annualIncome / basis) * 1000) / 10, maxPct, basisLabel: label };
      })()
    : { pctOfBasis: null as number | null, maxPct: null as number | null, basisLabel: "" };

  // 3. Categorical pass.
  const categoricalHit = program.eligibility.categorical_pass.find((p) =>
    profile.current_programs.includes(p),
  );
  if (categoricalHit) {
    const value = valueEstimateFor(program, householdSize);
    return {
      ...base,
      status: "likely_eligible",
      confidence: 0.95,
      income_pct_fpl: pctOfBasis,
      reason: `You already receive ${categoricalHit}, which categorically qualifies you for ${program.name} without a separate income test.`,
      estimated_annual_value: value,
    };
  }

  // 4. Immigration gate.
  if (
    program.eligibility.immigration_sensitive &&
    (profile.immigration_status === "unknown" || profile.immigration_status === "other")
  ) {
    return {
      ...base,
      status: "needs_review",
      confidence: 0.5,
      income_pct_fpl: pctOfBasis,
      reason: `${program.name} eligibility depends on immigration status, which is not clearly established (${profile.immigration_status}). Verify status before proceeding rather than assuming eligibility.`,
      review_triggers: ["immigration_status_uncertain"],
    };
  }

  // 5. Income test.
  if (testType === "none") {
    const value = valueEstimateFor(program, householdSize);
    return {
      ...base,
      status: "likely_eligible",
      confidence: 0.85,
      reason: `${program.name} has no income test — eligibility here depends only on the other criteria you've confirmed.`,
      estimated_annual_value: value,
    };
  }
  if (testType === "manual") {
    return {
      ...base,
      status: "needs_review",
      confidence: 0.4,
      reason: `${program.name}'s income/asset test is more complex than a simple percentage-of-poverty-line comparison (e.g. countable-income exclusions, asset limits, or funding-limited priority rules) — this screener can't determine eligibility from income alone. You've cleared the other criteria it checks, so it's worth applying directly for a real determination.`,
      review_triggers: ["income_test_not_modeled"],
    };
  }

  const lowerBand = (maxPct as number) - BORDERLINE_BAND_POINTS;
  const upperBand = (maxPct as number) + BORDERLINE_BAND_POINTS;

  if ((pctOfBasis as number) >= lowerBand && (pctOfBasis as number) <= upperBand) {
    return {
      ...base,
      status: "needs_review",
      confidence: 0.5,
      income_pct_fpl: pctOfBasis,
      reason: `Income is ${pctOfBasis}% of ${basisLabel}, close to the ${maxPct}% ${program.name} cutoff. This is near the eligibility boundary — verify exact income and household size before determining eligibility.`,
      review_triggers: ["borderline_income"],
    };
  }

  if ((pctOfBasis as number) < (maxPct as number) - CLEAR_MARGIN_POINTS || (pctOfBasis as number) < lowerBand) {
    const value = valueEstimateFor(program, householdSize);
    return {
      ...base,
      status: "likely_eligible",
      confidence: 0.85,
      income_pct_fpl: pctOfBasis,
      reason: `Income is ${pctOfBasis}% of ${basisLabel}, under the ${maxPct}% ${program.name} limit.`,
      estimated_annual_value: value,
    };
  }

  return {
    ...base,
    status: "likely_ineligible",
    confidence: 0.85,
    income_pct_fpl: pctOfBasis,
    reason: `Income is ${pctOfBasis}% of ${basisLabel}, over the ${maxPct}% ${program.name} limit.`,
  };
}

export function evaluate(
  profile: ClientProfile,
  programs: ProgramDefinition[] = programsConfig as unknown as ProgramDefinition[],
): EligibilityResult[] {
  return programs.map((program) => evaluateProgram(profile, program));
}

export function screenClient(profile: ClientProfile): ScreeningResult {
  const results = evaluate(profile);
  const eligible = results.filter((r) => r.status === "likely_eligible");
  const needsReview = results.filter((r) => r.status === "needs_review");
  const ineligible = results.filter((r) => r.status === "likely_ineligible");

  const total = eligible.reduce((sum, r) => sum + r.estimated_annual_value, 0);
  const potentialAdditional = needsReview.reduce((sum, r) => {
    const program = (programsConfig as unknown as ProgramDefinition[]).find(
      (p) => p.program_id === r.program_id,
    );
    if (!program || profile.household_size == null) return sum;
    return sum + valueEstimateFor(program, profile.household_size);
  }, 0);

  return {
    client_id: profile.client_id,
    screened_at: new Date().toISOString(),
    results,
    total_estimated_annual_value: total,
    total_estimated_monthly_value: Math.round((total / 12) * 100) / 100,
    potential_additional_value: potentialAdditional,
    eligible_count: eligible.length,
    needs_review_count: needsReview.length,
    ineligible_count: ineligible.length,
  };
}

export function getProgram(programId: string): ProgramDefinition | undefined {
  return (programsConfig as unknown as ProgramDefinition[]).find((p) => p.program_id === programId);
}

export function getAllPrograms(): ProgramDefinition[] {
  return programsConfig as unknown as ProgramDefinition[];
}

export const REQUIRED_FIELDS_FOR_COMPLETE_SCREEN = REQUIRED_BASE_FIELDS;
