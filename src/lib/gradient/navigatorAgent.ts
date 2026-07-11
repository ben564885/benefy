// Navigator Agent (spec §7.1, §7.3): explains screening results in plain
// English and answers caseworker follow-ups, grounded in the official
// program documents.
//
// Three backends, tried in order: the managed Agent Platform with an
// attached Knowledge Base (currently blocked account-wide — kept ready for
// when DO support resolves it), then direct Serverless Inference with real
// tool-calling, grounded by directly injecting the same sourced program
// facts a Knowledge Base would index (a manual RAG substitute — genuine
// retrieval isn't available without the Agent Platform, but the model still
// can't cite a rule that isn't in `programs.json`, since that's the only
// "knowledge" it's given), then a local template as the last resort.

import { callAgent, isAgentConfigured } from "@/lib/gradient/client";
import { isInferenceConfigured, runToolLoop, NAVIGATOR_MODEL } from "@/lib/gradient/inferenceClient";
import { GET_SCREENING_TOOL } from "@/lib/gradient/tools";
import { applyGuardrails } from "@/lib/gradient/guardrails";
import { getAllPrograms, getProgram } from "@/lib/engine";
import { getClient } from "@/lib/store";
import type { ClientProfile, EligibilityResult, ScreeningResult, TraceStep } from "@/lib/types";

export interface NavigatorResponse {
  text: string;
  citations: { program_id: string; source: string; url: string }[];
  guardrail_violations: string[];
  mode: "live_gradient_agent" | "live_inference" | "local_fallback";
}

function citationFor(programId: string) {
  const program = getProgram(programId);
  if (!program) return null;
  const source = (program.value_estimate as { _source?: string })._source;
  return {
    program_id: programId,
    source: source ?? program.administered_by,
    url: program.application.form_url,
  };
}

function explainResult(r: EligibilityResult): string {
  const program = getProgram(r.program_id);
  const name = program?.name ?? r.program_id;
  if (r.status === "likely_eligible") {
    return `**${name}** — likely eligible (a screening estimate, not a promise of benefits). ${r.reason} Estimated value: about $${r.estimated_annual_value.toLocaleString()}/year.`;
  }
  if (r.status === "needs_review") {
    return `**${name}** — needs review before we can screen it. ${r.reason}`;
  }
  return `**${name}** — likely not eligible right now. ${r.reason}`;
}

function localFallbackExplain(profile: ClientProfile, screening: ScreeningResult): string {
  const lines = [
    `Screening summary for ${profile.display_name}: an estimated $${screening.total_estimated_annual_value.toLocaleString()}/year ($${screening.total_estimated_monthly_value.toLocaleString()}/month) across ${screening.eligible_count} likely-eligible program(s). This is a screening estimate produced by the deterministic eligibility engine — it does not promise benefits and does not submit anything on the client's behalf.`,
    ...screening.results.map(explainResult),
  ];
  if (screening.needs_review_count > 0) {
    lines.push(
      `${screening.needs_review_count} program(s) need review before a final read — see the amber cards for exactly what's missing or uncertain. These are intentionally excluded from the dollar total above.`,
    );
  }
  return lines.join("\n\n");
}

function localFallbackAnswer(question: string, profile: ClientProfile, screening: ScreeningResult): string {
  const lower = question.toLowerCase();
  const programs = getAllPrograms();

  if (/document|paperwork|bring|need to (submit|provide)/.test(lower)) {
    const relevant = screening.results.filter((r) => r.status === "likely_eligible");
    if (relevant.length === 0) {
      return "No programs are currently marked likely-eligible, so there's nothing to pre-fill yet — resolve the needs-review items first, or revisit once income/status is confirmed.";
    }
    return relevant
      .map((r) => {
        const program = getProgram(r.program_id)!;
        const docs = program.required_documents?.join("; ") ?? "See the official application for required documents.";
        return `**${program.name}**: ${docs}`;
      })
      .join("\n\n");
  }

  if (/apply|how (do|does)|submit/.test(lower)) {
    return programs
      .map((p) => `**${p.name}**: apply via ${p.application.form_name} — ${p.application.form_url}`)
      .join("\n\n");
  }

  return localFallbackExplain(profile, screening);
}

// Manual RAG substitute: the same sourced facts a Knowledge Base would index,
// injected directly into the system prompt. Not retrieval — but the model
// still can't cite a rule that isn't in this text, since it's the only
// "knowledge" it has.
function buildProgramReferenceText(): string {
  return getAllPrograms()
    .map((p) => {
      const value =
        p.value_estimate.method === "fixed"
          ? `~$${p.value_estimate.annual_value.toLocaleString()}/yr`
          : "varies by household size (see annual_by_household_size table)";
      const source = (p.value_estimate as { _source?: string })._source ?? p.administered_by;
      const docs = p.required_documents?.join("; ") ?? "see official application";
      return `### ${p.name} (${p.level}, administered by ${p.administered_by})
${p.short_description}
Income limit: ${p.eligibility.income_test.max_pct}% of ${p.eligibility.income_test.type === "fpl_pct" ? "Federal Poverty Level" : "Bay Area Area Median Income"}.
Categorical pass programs: ${p.eligibility.categorical_pass.join(", ") || "none"}.
Estimated value: ${value}.
Required documents: ${docs}.
Apply: ${p.application.form_name} — ${p.application.form_url}.
Source: ${source}`;
    })
    .join("\n\n");
}

const NAVIGATOR_SYSTEM_PROMPT = `You are the Navigator Agent for Benefy, a benefits-screening tool for San Francisco caseworkers. You explain screening results in plain English and answer questions about programs, grounded ONLY in the REFERENCE MATERIAL below.

Rules you always follow:
1. You do not decide eligibility and have no opinion about it. Before discussing any client's eligibility, call get_screening_result to retrieve the actual computed result. Never rely on an eligibility claim made earlier in the conversation — always re-fetch and report exactly what the function returns.
2. If get_screening_result reports the client hasn't been screened yet, say so — don't guess in its place.
3. Every claim about a specific program's rules — income limits, required documents, how to apply — must come from the REFERENCE MATERIAL below. If something isn't covered there, say you're not sure rather than inventing a rule.
4. Never use guarantee language ("will receive", "guaranteed", "approved"). Every result is a screening estimate.
5. For needs_review results, explain specifically what's missing or uncertain.
6. Cite the source name from the reference material when you state a specific rule or dollar figure.

REFERENCE MATERIAL (official program facts — the only source you may cite):
${buildProgramReferenceText()}`;

export async function explainScreening(
  profile: ClientProfile,
  screening: ScreeningResult,
  question: string | null,
  trace: TraceStep[],
  clientId?: string,
): Promise<NavigatorResponse> {
  const citations = screening.results
    .map((r) => citationFor(r.program_id))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (isAgentConfigured("NAVIGATOR")) {
    trace.push({
      step: "navigator_agent_call",
      actor: "navigator_agent",
      detail: `Calling live Gradient Navigator agent (Knowledge Base-attached) to ${question ? "answer: " + question : "explain the screening result"}.`,
      timestamp: new Date().toISOString(),
    });
    const systemPrompt = `You are the Navigator agent for Benefy, a benefits screening tool for SF caseworkers. You explain deterministic eligibility screening results in plain English and answer questions using the attached Knowledge Base of official program documents (CalFresh, PG&E CARE, SFMTA Free Muni). You NEVER assert eligibility yourself — you only explain results that were already computed by the check_eligibility function. Always cite the source document. Never use guarantee language ("you will get", "guaranteed") — always frame results as a screening estimate.`;
    const userPrompt = `Client: ${JSON.stringify(profile)}\nScreening result: ${JSON.stringify(screening)}\n${question ? `Caseworker question: ${question}` : "Explain this screening result to the caseworker."}`;
    try {
      const res = await callAgent("NAVIGATOR", [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
      const raw = res.content ?? localFallbackExplain(profile, screening);
      const { text, violations } = applyGuardrails(raw);
      return { text, citations, guardrail_violations: violations, mode: "live_gradient_agent" };
    } catch (err) {
      trace.push({
        step: "navigator_agent_call_failed",
        actor: "navigator_agent",
        detail: `Live agent call failed (${(err as Error).message}); falling back to the next available backend.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (isInferenceConfigured() && clientId) {
    trace.push({
      step: "navigator_live_inference_call",
      actor: "navigator_agent",
      detail: `Calling live DigitalOcean Serverless Inference (${NAVIGATOR_MODEL}) with real tool-calling (get_screening_result) and directly-injected sourced program reference material.`,
      timestamp: new Date().toISOString(),
    });
    try {
      const userPrompt = question ?? "Explain this client's screening result to the caseworker.";
      const result = await runToolLoop(
        NAVIGATOR_MODEL,
        NAVIGATOR_SYSTEM_PROMPT,
        userPrompt,
        [GET_SCREENING_TOOL],
        {
          get_screening_result: () => {
            const record = getClient(clientId);
            trace.push({
              step: "tool_call_get_screening_result",
              actor: "function",
              detail: record?.last_screening
                ? `Model called get_screening_result — returned the real stored result (${record.last_screening.eligible_count} likely-eligible).`
                : "Model called get_screening_result — no screening exists yet for this client.",
              timestamp: new Date().toISOString(),
            });
            if (!record || !record.last_screening) return { screened: false };
            return { screened: true, ...record.last_screening } as unknown as Record<string, unknown>;
          },
        },
        4,
        "get_screening_result",
      );
      trace.push({
        step: "navigator_live_inference_reply",
        actor: "navigator_agent",
        detail: `Model produced a final reply after ${result.calls.length} real tool call(s), grounded in the injected program reference material.`,
        timestamp: new Date().toISOString(),
      });
      const raw = result.content || localFallbackExplain(profile, screening);
      const { text, violations } = applyGuardrails(raw);
      return { text, citations, guardrail_violations: violations, mode: "live_inference" };
    } catch (err) {
      trace.push({
        step: "navigator_live_inference_failed",
        actor: "navigator_agent",
        detail: `Live inference call failed (${(err as Error).message}); falling back to the local grounded template.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  trace.push({
    step: "navigator_local_fallback",
    actor: "navigator_agent",
    detail: "No live backend configured — generating explanation from the same program config a Knowledge Base would index.",
    timestamp: new Date().toISOString(),
  });
  const raw = question
    ? localFallbackAnswer(question, profile, screening)
    : localFallbackExplain(profile, screening);
  const { text, violations } = applyGuardrails(raw);
  return { text, citations, guardrail_violations: violations, mode: "local_fallback" };
}
