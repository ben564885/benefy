// Intake Agent (spec §7.1): turns free-text caseworker notes into a
// structured ClientProfile and asks targeted follow-ups for missing
// required fields. Never states eligibility — that's the Navigator's job,
// and only after the check_eligibility tool has run (see tools.ts).

import { callAgent, isAgentConfigured } from "@/lib/gradient/client";
import { CHECK_ELIGIBILITY_TOOL } from "@/lib/gradient/tools";
import {
  extractProfilePatch,
  missingCoreFields,
  missingSeniorDisabilityField,
} from "@/lib/gradient/intakeExtractor";
import type { ClientProfile, TraceStep } from "@/lib/types";

export interface IntakeResponse {
  patch: Partial<ClientProfile>;
  assistant_reply: string;
  ready_to_screen: boolean;
  mode: "live_gradient_agent" | "local_fallback";
}

function buildFollowUpReply(profile: ClientProfile, patch: Partial<ClientProfile>): string {
  const merged = { ...profile, ...patch };
  const captured = Object.entries(patch)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k]) => k.replace(/_/g, " "));

  const missing = missingCoreFields(merged);
  const parts: string[] = [];
  if (captured.length > 0) {
    parts.push(`Got it — captured ${captured.join(", ")}.`);
  }
  if (missing.length > 0) {
    parts.push(`Still need: ${missing.map((m) => m.prompt).join(" ")}`);
  } else if (missingSeniorDisabilityField(merged)) {
    parts.push(
      "One more useful detail: is anyone in the household a senior (65+) or living with a disability? This only affects the SF Muni program, but worth capturing.",
    );
  } else {
    parts.push("Profile looks complete — ready to run the screening.");
  }
  return parts.join(" ");
}

export async function runIntakeTurn(
  userText: string,
  profile: ClientProfile,
  trace: TraceStep[],
): Promise<IntakeResponse> {
  if (isAgentConfigured("INTAKE")) {
    trace.push({
      step: "intake_agent_call",
      actor: "intake_agent",
      detail: "Calling live Gradient Intake agent to extract structured fields from free text.",
      timestamp: new Date().toISOString(),
    });
    try {
      const systemPrompt = `You are the Intake agent for Benefind. Extract a partial ClientProfile JSON patch from the caseworker's free text about a client. Fields: household_size, monthly_income_gross, annual_income_gross, member_ages, has_senior, has_disability, immigration_status (citizen|lpr|other|unknown), sf_resident, zip_code, current_programs. Only include fields you're confident about. You may also call the check_eligibility tool once household_size, income, sf_resident, and immigration_status are known — but you never state eligibility yourself; only the tool result does. Current profile: ${JSON.stringify(profile)}. Respond with a JSON object patch, plus a short natural-language reply asking about any still-missing required fields.`;
      const res = await callAgent(
        "INTAKE",
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        [CHECK_ELIGIBILITY_TOOL],
      );
      if (res.content) {
        const parsed = JSON.parse(res.content) as { patch?: Partial<ClientProfile>; reply?: string };
        const patch = parsed.patch ?? {};
        return {
          patch,
          assistant_reply: parsed.reply ?? buildFollowUpReply(profile, patch),
          ready_to_screen: missingCoreFields({ ...profile, ...patch }).length === 0,
          mode: "live_gradient_agent",
        };
      }
    } catch (err) {
      trace.push({
        step: "intake_agent_call_failed",
        actor: "intake_agent",
        detail: `Live agent call failed (${(err as Error).message}); falling back to local extractor.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  trace.push({
    step: "intake_local_fallback",
    actor: "intake_agent",
    detail: "GRADIENT_INTAKE_AGENT_* not configured — extracting fields with the local heuristic parser.",
    timestamp: new Date().toISOString(),
  });
  const { patch } = extractProfilePatch(userText, profile);
  const merged = { ...profile, ...patch };
  return {
    patch,
    assistant_reply: buildFollowUpReply(profile, patch),
    ready_to_screen: missingCoreFields(merged).length === 0,
    mode: "local_fallback",
  };
}
