// Intake Agent (spec §7.1): turns a user's free-text description of their
// own household into a structured ClientProfile and asks targeted follow-ups for missing
// required fields. Never states eligibility — that's the Navigator's job,
// and only after the check_eligibility tool has run (see tools.ts).
//
// Three backends, tried in order: the managed Agent Platform (currently
// blocked account-wide — kept ready for when DO support resolves it), then
// direct Serverless Inference with real tool-calling orchestrated in our
// own backend (see inferenceClient.ts), then a local heuristic extractor as
// the last resort so the app never fully breaks.

import { callAgent, isAgentConfigured } from "@/lib/gradient/client";
import { isInferenceConfigured, runToolLoop, INTAKE_MODEL } from "@/lib/gradient/inferenceClient";
import { CHECK_ELIGIBILITY_TOOL, UPDATE_PROFILE_TOOL } from "@/lib/gradient/tools";
import {
  extractProfilePatch,
  missingCoreFields,
  missingSeniorDisabilityField,
  missingVeteranField,
} from "@/lib/gradient/intakeExtractor";
import { getClient, screenAndStore, updateProfile } from "@/lib/store";
import type { ClientProfile, TraceStep } from "@/lib/types";

export interface IntakeResponse {
  patch: Partial<ClientProfile>;
  assistant_reply: string;
  ready_to_screen: boolean;
  mode: "live_gradient_agent" | "live_inference" | "local_fallback";
}

const IMMIGRATION_STATUS_LABEL: Record<string, Record<string, string>> = {
  en: {
    citizen: "a U.S. citizen",
    lpr: "a permanent resident",
    other: "another immigration status",
    unknown: "an unconfirmed immigration status",
  },
  es: {
    citizen: "ciudadano/a de EE. UU.",
    lpr: "residente permanente",
    other: "otro estatus migratorio",
    unknown: "estatus migratorio sin confirmar",
  },
};

function buildCompletionSummary(profile: ClientProfile, lang: "en" | "es" = "en"): string {
  const perMonth = lang === "es" ? "/mes" : "/month";
  const perYear = lang === "es" ? "/año" : "/year";
  const income =
    profile.monthly_income_gross != null
      ? `$${profile.monthly_income_gross.toLocaleString()}${perMonth}`
      : profile.annual_income_gross != null
        ? `$${profile.annual_income_gross.toLocaleString()}${perYear}`
        : lang === "es"
          ? "ingreso registrado"
          : "income on file";
  const residency =
    profile.sf_resident
      ? lang === "es"
        ? "en San Francisco"
        : "in San Francisco"
      : lang === "es"
        ? "fuera de San Francisco"
        : "outside San Francisco";
  const status = profile.immigration_status
    ? IMMIGRATION_STATUS_LABEL[lang][profile.immigration_status]
    : lang === "es"
      ? "estatus migratorio registrado"
      : "immigration status on file";
  if (lang === "es") {
    return `Entendido — hogar de ${profile.household_size}, ${income}, viviendo ${residency}, ${status}. Ejecutando su evaluación ahora.`;
  }
  return `Got it — household of ${profile.household_size}, ${income}, living ${residency}, ${status}. Running your screening now.`;
}

// Fast path for the guided quick-reply chips / income stepper in ChatPanel.
// Their answers are already unambiguous, so there's no need to round-trip a
// model per click — that's what caused a multi-second "Thinking…" beat
// after every single question. This resolves locally and stays silent
// (assistant_reply: null) until the last required field lands, at which
// point it writes one summary message instead of one per question.
export function runGuidedIntakeTurn(
  userText: string,
  profile: ClientProfile,
  lang: "en" | "es" = "en",
): { patch: Partial<ClientProfile>; assistant_reply: string | null; ready_to_screen: boolean } {
  const { patch } = extractProfilePatch(userText, profile);
  const merged = { ...profile, ...patch };
  const wasMissingCore = missingCoreFields(profile).length > 0;
  const stillMissingCore = missingCoreFields(merged).length > 0;
  const wasMissingSenior = missingSeniorDisabilityField(profile);
  const stillMissingSenior = missingSeniorDisabilityField(merged);
  const wasMissingVeteran = missingVeteranField(profile);
  const stillMissingVeteran = missingVeteranField(merged);
  const justFinishedCore = wasMissingCore && !stillMissingCore;
  const justFinishedSenior = wasMissingSenior && !stillMissingSenior && !stillMissingCore;
  const justFinishedVeteran = wasMissingVeteran && !stillMissingVeteran && !stillMissingCore && !stillMissingSenior;
  const readyToScreen = !stillMissingCore && !stillMissingSenior && !stillMissingVeteran;
  return {
    patch,
    assistant_reply:
      justFinishedVeteran ||
      (justFinishedSenior && !stillMissingVeteran) ||
      (justFinishedCore && !stillMissingSenior && !stillMissingVeteran)
        ? buildCompletionSummary(merged, lang)
        : null,
    ready_to_screen: readyToScreen,
  };
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
  } else if (missingVeteranField(merged)) {
    parts.push("Are you a veteran or former military? Optional, but it can unlock additional benefits.");
  } else {
    parts.push("Profile looks complete — ready to run the screening.");
  }
  return parts.join(" ");
}

export const INTAKE_SYSTEM_PROMPT = `You are the Intake Agent for Benefy, a benefits-screening tool used directly by San Francisco residents to screen themselves for benefits. Your job is to turn a person's free-text description of their own household into a structured profile by calling functions. You are never the source of truth for eligibility — only the check_eligibility function's result is.

Rules you always follow:
1. You never state that the user is, might be, or is not eligible for any benefit program under any circumstance, unless you have called check_eligibility in this conversation and are reporting exactly what it returned.
2. Call update_client_profile with only the fields you're confident about from what the user just said. Do not guess values that weren't stated.
3. Required fields before a screening can run: household_size, income (monthly_income_gross or annual_income_gross), sf_resident, immigration_status, and whether anyone in the household is a senior (65+) or has a disability (has_senior / has_disability).
4. Call check_eligibility only once those required fields are captured.
5. immigration_status must be exactly one of: citizen, lpr, other, unknown. If the user is unsure or the situation sounds unclear, use unknown — never default to citizen to be helpful.
6. Never use guarantee language ("you will get X", "guaranteed", "approved"). Frame any result as a screening estimate.
7. Keep replies brief, warm, and plain-language — you're talking directly to the person applying, not a chatbot persona.
8. Always reply in the same language the user writes in (e.g. answer Spanish messages in Spanish).`;

export async function runIntakeTurn(
  userText: string,
  clientId: string,
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
      // The agent's own endpoint rejects system/developer-role messages —
      // instructions are fixed server-side on the agent (see the `instruction`
      // field set at agent-creation time). client_id has to travel as part of
      // the user message instead, since the attached functions
      // (update_client_profile / check_eligibility) are real deployed DO
      // Functions the *platform* invokes — our code never sees their
      // arguments or results directly, only the side effect they leave in the
      // store, and the final natural-language reply.
      const res = await callAgent("INTAKE", [
        { role: "user", content: `[client_id: ${clientId}]\n${userText}` },
      ]);
      if (res.content) {
        const current = (await getClient(clientId))?.profile ?? profile;
        return {
          patch: {},
          assistant_reply: res.content,
          ready_to_screen: missingCoreFields(current).length === 0,
          mode: "live_gradient_agent",
        };
      }
    } catch (err) {
      trace.push({
        step: "intake_agent_call_failed",
        actor: "intake_agent",
        detail: `Live agent call failed (${(err as Error).message}); falling back to the next available backend.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (isInferenceConfigured()) {
    trace.push({
      step: "intake_live_inference_call",
      actor: "intake_agent",
      detail: `Calling live DigitalOcean Serverless Inference (${INTAKE_MODEL}) with real tool-calling — update_client_profile and check_eligibility are genuine functions the model can invoke.`,
      timestamp: new Date().toISOString(),
    });
    try {
      const result = await runToolLoop(
        INTAKE_MODEL,
        INTAKE_SYSTEM_PROMPT,
        userText,
        [UPDATE_PROFILE_TOOL, CHECK_ELIGIBILITY_TOOL],
        {
          update_client_profile: async (args) => {
            const patch = args as Partial<ClientProfile>;
            const updated = await updateProfile(clientId, patch);
            trace.push({
              step: "tool_call_update_client_profile",
              actor: "function",
              detail: `Model called update_client_profile with: ${Object.keys(patch).join(", ") || "no fields"}.`,
              timestamp: new Date().toISOString(),
            });
            return { ok: true, profile: updated?.profile };
          },
          check_eligibility: async () => {
            const updated = await screenAndStore(clientId);
            if (!updated || !updated.last_screening) return { error: "client not found" };
            trace.push({
              step: "tool_call_check_eligibility",
              actor: "function",
              detail: `Model called check_eligibility. Deterministic engine returned ${updated.last_screening.eligible_count} likely-eligible, ${updated.last_screening.needs_review_count} needs-review, ${updated.last_screening.ineligible_count} likely-ineligible.`,
              timestamp: new Date().toISOString(),
            });
            return updated.last_screening as unknown as Record<string, unknown>;
          },
        },
      );

      const current = (await getClient(clientId))?.profile ?? profile;
      trace.push({
        step: "intake_live_inference_reply",
        actor: "intake_agent",
        detail: `Model produced a final reply after ${result.calls.length} real tool call(s).`,
        timestamp: new Date().toISOString(),
      });
      return {
        patch: {},
        assistant_reply: result.content || buildFollowUpReply(profile, {}),
        ready_to_screen: missingCoreFields(current).length === 0,
        mode: "live_inference",
      };
    } catch (err) {
      trace.push({
        step: "intake_live_inference_failed",
        actor: "intake_agent",
        detail: `Live inference call failed (${(err as Error).message}); falling back to the local extractor.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  trace.push({
    step: "intake_local_fallback",
    actor: "intake_agent",
    detail: "No live backend configured — extracting fields with the local heuristic parser.",
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
