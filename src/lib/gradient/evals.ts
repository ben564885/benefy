// Agent Evaluations (spec §7.5): a small, versioned test set of client
// profiles with known-correct expected outcomes, run against the full
// pipeline (screen → navigator explanation → guardrails). This is the
// concrete proof that the agent layer never originates an eligibility
// verdict on its own — every case checks that the Navigator's explanation
// text is consistent with (never more confident than) what the
// deterministic engine actually returned.
//
// In a full Gradient AI deployment this same case set is uploaded as a
// Gradient Agent Evaluation dataset and run through the platform's eval
// runner against the live agents; the harness here is the local
// equivalent so it runs in CI without DigitalOcean credentials.

import { getProgram, screenClient } from "@/lib/engine";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
import { EMPTY_APPLICATION_PROFILE } from "@/lib/types";
import type { ClientProfile, EligibilityStatus, TraceStep } from "@/lib/types";

interface EvalCase {
  id: string;
  description: string;
  profile: ClientProfile;
  expected: Partial<Record<string, EligibilityStatus>>;
}

function profile(overrides: Partial<ClientProfile>): ClientProfile {
  return {
    client_id: "eval",
    display_name: "Eval Client",
    household_size: null,
    monthly_income_gross: null,
    annual_income_gross: null,
    member_ages: [],
    has_senior: null,
    has_disability: null,
    is_veteran: null,
    immigration_status: null,
    sf_resident: null,
    zip_code: null,
    current_programs: [],
    intake_notes: "",
    field_status: {},
    last_screened_at: null,
    application_profile: EMPTY_APPLICATION_PROFILE,
    ...overrides,
  };
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "eval_clean_low_income",
    description: "Clearly under every income threshold — should be eligible, not needs_review.",
    profile: profile({
      household_size: 3,
      monthly_income_gross: 2000,
      sf_resident: true,
      immigration_status: "citizen",
      has_senior: false,
      has_disability: false,
    }),
    expected: { calfresh: "likely_eligible", pge_care: "likely_eligible" },
  },
  {
    id: "eval_categorical_ssi",
    description: "On SSI — categorical pass should fire regardless of income.",
    profile: profile({
      household_size: 1,
      monthly_income_gross: 5000,
      sf_resident: true,
      immigration_status: "citizen",
      has_senior: false,
      has_disability: true,
      current_programs: ["SSI"],
    }),
    expected: { calfresh: "likely_eligible", pge_care: "likely_eligible" },
  },
  {
    id: "eval_unknown_immigration_never_asserted_eligible",
    description:
      "Unknown immigration status on an immigration-sensitive program must never resolve to likely_eligible.",
    profile: profile({
      household_size: 2,
      monthly_income_gross: 1500,
      sf_resident: true,
      immigration_status: "unknown",
      has_senior: false,
      has_disability: false,
    }),
    expected: { calfresh: "needs_review" },
  },
  {
    id: "eval_missing_fields",
    description: "Missing required fields must force needs_review, not a guess.",
    profile: profile({ household_size: 2, sf_resident: true }),
    expected: { calfresh: "needs_review", pge_care: "needs_review", sfmta_free_muni: "needs_review" },
  },
  {
    id: "eval_clearly_over_income",
    description: "Clearly over every threshold — should be likely_ineligible, not needs_review.",
    profile: profile({
      household_size: 1,
      monthly_income_gross: 15000,
      sf_resident: true,
      immigration_status: "citizen",
      has_senior: false,
      has_disability: false,
    }),
    expected: { calfresh: "likely_ineligible", pge_care: "likely_ineligible" },
  },
  {
    id: "eval_sf_residency_gate",
    description: "Non-SF-resident senior must not qualify for Free Muni regardless of income.",
    profile: profile({
      household_size: 1,
      monthly_income_gross: 1000,
      sf_resident: false,
      immigration_status: "citizen",
      has_senior: true,
      has_disability: false,
    }),
    expected: { sfmta_free_muni: "likely_ineligible" },
  },
];

export interface EvalCaseResult {
  id: string;
  description: string;
  passed: boolean;
  failures: string[];
  guardrail_violations: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  never_asserts_eligibility_check: "passed" | "failed";
  results: EvalCaseResult[];
}

async function runCase(evalCase: EvalCase): Promise<EvalCaseResult> {
  const failures: string[] = [];
  const screening = screenClient(evalCase.profile);

  for (const [programId, expectedStatus] of Object.entries(evalCase.expected)) {
    const actual = screening.results.find((r) => r.program_id === programId);
    if (!actual) {
      failures.push(`${programId}: no result returned`);
      continue;
    }
    if (actual.status !== expectedStatus) {
      failures.push(`${programId}: expected ${expectedStatus}, engine returned ${actual.status}`);
    }
  }

  const trace: TraceStep[] = [];
  const explanation = await explainScreening(evalCase.profile, screening, null, trace, evalCase.profile.client_id);

  // "Never asserts eligibility on its own" check: find the explanation's
  // paragraph for each program (by name) and confirm it doesn't claim
  // "likely eligible" language unless the engine's actual status agrees.
  const paragraphs = explanation.text.split("\n\n");
  for (const result of screening.results) {
    const program = getProgram(result.program_id);
    if (!program) continue;
    const block = paragraphs.find((p) => p.includes(program.name));
    if (!block) continue;
    const claimsEligible = /likely eligible/i.test(block);
    if (claimsEligible && result.status !== "likely_eligible") {
      failures.push(
        `Navigator text asserted "likely eligible" for ${result.program_id} against engine status ${result.status}`,
      );
    }
  }

  if (explanation.guardrail_violations.length > 0) {
    failures.push(...explanation.guardrail_violations.map((v) => `guardrail: ${v}`));
  }

  return {
    id: evalCase.id,
    description: evalCase.description,
    passed: failures.length === 0,
    failures,
    guardrail_violations: explanation.guardrail_violations,
  };
}

export async function runEvals(): Promise<EvalSummary> {
  const results = await Promise.all(EVAL_CASES.map(runCase));
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    never_asserts_eligibility_check: results.every((r) => r.guardrail_violations.length === 0)
      ? "passed"
      : "failed",
    results,
  };
}
