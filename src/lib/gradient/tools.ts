// The eligibility engine, exposed as a Gradient AI function/tool.
//
// This is the centerpiece of the architecture (spec §7.2): the Intake Agent
// gathers a ClientProfile through conversation, then issues a tool call to
// `check_eligibility`. The *tool*, not the model, computes eligibility — the
// deterministic engine in lib/engine.ts is the only code path that ever
// produces a likely_eligible / likely_ineligible / needs_review verdict.
// The agent can describe, explain, and contextualize that verdict, but it
// cannot originate one.

import { screenClient } from "@/lib/engine";
import type { ClientProfile, ScreeningResult } from "@/lib/types";
import type { GradientToolDefinition } from "@/lib/gradient/client";

export const CHECK_ELIGIBILITY_TOOL: GradientToolDefinition = {
  type: "function",
  function: {
    name: "check_eligibility",
    description:
      "Runs the deterministic benefits eligibility engine against a client profile and returns a per-program screening result (likely_eligible / likely_ineligible / needs_review) with reasons and estimated dollar values. This is the ONLY source of truth for eligibility — never state a client is or isn't eligible without calling this function first.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        household_size: { type: "integer", minimum: 1 },
        monthly_income_gross: { type: "number", minimum: 0 },
        member_ages: { type: "array", items: { type: "integer" } },
        has_senior: { type: "boolean" },
        has_disability: { type: "boolean" },
        immigration_status: {
          type: "string",
          enum: ["citizen", "lpr", "other", "unknown"],
        },
        sf_resident: { type: "boolean" },
        zip_code: { type: "string" },
        current_programs: { type: "array", items: { type: "string" } },
      },
      required: ["household_size", "sf_resident", "immigration_status"],
    },
  },
};

export function executeCheckEligibility(profile: ClientProfile): ScreeningResult {
  return screenClient(profile);
}

export const UPDATE_PROFILE_TOOL: GradientToolDefinition = {
  type: "function",
  function: {
    name: "update_client_profile",
    description:
      "Persist known facts about the user's household, income, residency, and immigration status. Call this every time the user states or corrects information — even a single field. Only include fields you're confident about; omit anything not mentioned.",
    parameters: {
      type: "object",
      properties: {
        household_size: { type: "integer", minimum: 1 },
        monthly_income_gross: { type: "number", minimum: 0 },
        annual_income_gross: { type: "number", minimum: 0 },
        member_ages: { type: "array", items: { type: "integer" } },
        has_senior: { type: "boolean" },
        has_disability: { type: "boolean" },
        immigration_status: {
          type: "string",
          enum: ["citizen", "lpr", "other", "unknown"],
        },
        sf_resident: { type: "boolean" },
        zip_code: { type: "string" },
        current_programs: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export const GET_SCREENING_TOOL: GradientToolDefinition = {
  type: "function",
  function: {
    name: "get_screening_result",
    description:
      "Fetch the most recently computed eligibility screening for this client. Always call this before discussing eligibility for any program — never rely on anything said earlier in the conversation.",
    parameters: { type: "object", properties: {} },
  },
};
