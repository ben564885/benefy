// Navigator Agent (spec §7.1, §7.3): explains screening results in plain
// English and answers the user's follow-up questions, grounded in the
// official program documents.
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
import type { ClientProfile, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";

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

function shortProgramName(programId: string): string {
  const program = getProgram(programId);
  return program?.name ?? programId;
}

function formatNameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")}, +${names.length - max} more`;
}

function localFallbackExplain(_profile: ClientProfile, screening: ScreeningResult): string {
  const eligible = screening.results.filter((r) => r.status === "likely_eligible");
  const needsReview = screening.results.filter((r) => r.status === "needs_review");

  const topEligible = [...eligible]
    .sort((a, b) => b.estimated_annual_value - a.estimated_annual_value)
    .slice(0, 4)
    .map((r) => shortProgramName(r.program_id));

  const lines = [
    `You may qualify for about $${screening.total_estimated_annual_value.toLocaleString()}/year across ${screening.eligible_count} program(s). Each card above shows the details and estimated value.`,
  ];

  if (topEligible.length > 0) {
    const rest = eligible.length - topEligible.length;
    lines.push(
      rest > 0
        ? `Largest matches: ${formatNameList(topEligible, topEligible.length)} (+${rest} more).`
        : `Matches: ${formatNameList(topEligible, topEligible.length)}.`,
    );
  }

  if (needsReview.length > 0) {
    const reviewNames = needsReview.map((r) => shortProgramName(r.program_id));
    lines.push(
      `${needsReview.length} program(s) need a closer look (${formatNameList(reviewNames)}). Open the amber cards — their rules are too complex for a quick income check, so they are not included in your total yet.`,
    );
  }

  lines.push("This is a screening estimate only. Nothing has been submitted and nothing is guaranteed.");
  return lines.join("\n\n");
}

function explainResultsMeaning(profile: ClientProfile, screening: ScreeningResult): string {
  const eligible = screening.results.filter((r) => r.status === "likely_eligible");
  const review = screening.results.filter((r) => r.status === "needs_review");
  const ineligible = screening.results.filter((r) => r.status === "likely_ineligible");

  return [
    `Here's what your screening is showing:`,
    `• The big dollar total (~$${screening.total_estimated_annual_value.toLocaleString()}/year) is the combined estimated value of programs where you appear likely eligible — a screening estimate, not money already approved.`,
    `• Green cards (${eligible.length}): based on what you told us, your household appears to meet the rules for these programs.`,
    `• Amber "Needs review" cards (${review.length}): we couldn't confirm these from income alone — the rules are more complex, or something is still uncertain. They're not included in the dollar total until confirmed.`,
    ineligible.length > 0
      ? `• Gray cards (${ineligible.length}): you likely don't meet at least one key rule right now.`
      : null,
    `• "FPL" means Federal Poverty Level; "AMI" means Area Median Income — those are how many programs set income limits.`,
    `Ask about any program by name (e.g. "What is CalFresh?") and I'll explain that one specifically.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function localFallbackAnswer(question: string, profile: ClientProfile, screening: ScreeningResult): string {
  const lower = question.toLowerCase().trim();
  const programs = getAllPrograms();

  if (/what does (this|that|it) mean|what (is|are) (this|that|these|those)|explain (this|that|it)|what am i looking at|help me understand|what does my (result|screening)/.test(lower)) {
    return explainResultsMeaning(profile, screening);
  }

  if (/what (is|are|does).+mean|tell me about|what is\b/.test(lower)) {
    const programMatch = programs.find(
      (p) =>
        lower.includes(p.name.toLowerCase()) ||
        lower.includes(p.program_id.replace(/_/g, " ")) ||
        p.name
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3)
          .some((w) => lower.includes(w)),
    );
    if (programMatch) {
      const result = screening.results.find((r) => r.program_id === programMatch.program_id);
      const status = result?.status.replace(/_/g, " ") ?? "not screened";
      return [
        `${programMatch.name} — ${programMatch.short_description}`,
        result
          ? `Your screening: ${status}. ${result.reason} Estimated value: about $${result.estimated_annual_value.toLocaleString()}/year.`
          : "This program wasn't in your latest screening result.",
        `Apply: ${programMatch.application.form_url}`,
      ].join("\n\n");
    }
  }

  if (/benefy|this (site|tool|app|website)|how does (this|benefy) work/.test(lower)) {
    return [
      "Benefy screens your household against real SF and California benefit programs using a deterministic rules engine — the AI gathers your info and explains results, but never decides eligibility on its own.",
      "You can ask me about your screening summary, any program card above, what documents you might need, or how to apply. To update your household facts (income, size, etc.), just tell me in plain English.",
      "Nothing on Benefy submits an application or guarantees benefits — every dollar figure is a screening estimate.",
    ].join("\n\n");
  }

  if (/worth the most|highest|biggest|most valuable|top program|apply (for )?first|start with/.test(lower)) {
    const eligible = screening.results
      .filter((r) => r.status === "likely_eligible")
      .sort((a, b) => b.estimated_annual_value - a.estimated_annual_value);
    if (eligible.length === 0) {
      return "No programs are marked likely-eligible yet — check the amber needs-review cards or update your profile if something changed.";
    }
    const top = eligible.slice(0, 3).map((r) => {
      const name = shortProgramName(r.program_id);
      return `${name} (~$${r.estimated_annual_value.toLocaleString()}/year)`;
    });
    return `Your highest-value likely matches are ${top.join(", ")}${eligible.length > 3 ? ` (+${eligible.length - 3} more)` : ""}. Tap any green card above for details and a pre-filled application draft.`;
  }

  if (/needs? review|amber|why.*(not|uncertain|unsure)/.test(lower)) {
    const review = screening.results.filter((r) => r.status === "needs_review");
    if (review.length === 0) return "Nothing is flagged for review in your current screening.";
    const names = review.map((r) => shortProgramName(r.program_id)).join(", ");
    return `${review.length} program(s) need review (${names}). Usually that means the income or asset rules are too complex for a quick screen, or one detail is still missing. Open the amber cards — you can add info there and recheck.`;
  }

  if (/document|paperwork|bring|need to (submit|provide)/.test(lower)) {
    const relevant = screening.results.filter((r) => r.status === "likely_eligible");
    if (relevant.length === 0) {
      return "No programs are currently marked likely-eligible, so there's nothing to pre-fill yet — resolve the needs-review items first, or revisit once income/status is confirmed.";
    }
    return relevant
      .slice(0, 5)
      .map((r) => {
        const program = getProgram(r.program_id)!;
        const docs = program.required_documents?.join("; ") ?? "See the official application for required documents.";
        return `${program.name}: ${docs}`;
      })
      .join("\n\n");
  }

  if (/apply|how (do|does|can)|submit|sign up|enroll/.test(lower)) {
    const relevant = screening.results.filter((r) => r.status !== "likely_ineligible");
    const list = (relevant.length > 0 ? relevant : screening.results)
      .slice(0, 5)
      .map((r) => {
        const program = getProgram(r.program_id)!;
        return `${program.name}: ${program.application.form_url}`;
      });
    return `Apply through each program's official site — open a card above for a pre-filled draft, or start here:\n\n${list.join("\n")}`;
  }

  const programMatch = programs.find((p) => lower.includes(p.name.toLowerCase()) || lower.includes(p.program_id.replace(/_/g, " ")));
  if (programMatch) {
    const result = screening.results.find((r) => r.program_id === programMatch.program_id);
    if (result) {
      return `${programMatch.name}: ${result.status.replace(/_/g, " ")} — ${result.reason} Estimated value: about $${result.estimated_annual_value.toLocaleString()}/year. Apply: ${programMatch.application.form_url}`;
    }
  }

  if (/\?|^(what|why|how|which|can|do|does|is|are|tell me|help)\b/.test(lower)) {
    return [
      localFallbackExplain(profile, screening),
      "Ask me about a specific program by name, what documents you need, where to apply, or how Benefy works.",
    ].join("\n\n");
  }

  return localFallbackExplain(profile, screening);
}

// Manual RAG substitute: the same sourced facts a Knowledge Base would index,
// injected directly into the system prompt. Not retrieval — but the model
// still can't cite a rule that isn't in this text, since it's the only
// "knowledge" it has.
function incomeLimitText(p: ProgramDefinition): string {
  const test = p.eligibility.income_test;
  switch (test.type) {
    case "fpl_pct":
      return `${test.max_pct}% of Federal Poverty Level`;
    case "ami_pct":
      return `${test.max_pct}% of Bay Area Area Median Income`;
    case "dollar_table":
      return `program-specific income table by household size (see ${p.name}'s own schedule)`;
    case "flat_annual_income_cap":
      return `a flat annual income cap of $${test.max_amount?.toLocaleString()}`;
    case "none":
      return "no income test";
    case "manual":
      return "a non-standard income/asset test this tool cannot compute directly — always needs_review on income";
  }
}

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
Income limit: ${incomeLimitText(p)}.
Categorical pass programs: ${p.eligibility.categorical_pass.join(", ") || "none"}.
Estimated value: ${value}.
Required documents: ${docs}.
Apply: ${p.application.form_name} — ${p.application.form_url}.
Source: ${source}`;
    })
    .join("\n\n");
}

const NAVIGATOR_SYSTEM_PROMPT = `You are the Navigator Agent for Benefy, a benefits-screening tool used directly by San Francisco residents. You explain screening results in plain English and answer questions about programs, grounded ONLY in the REFERENCE MATERIAL below.

Rules you always follow:
1. You do not decide eligibility and have no opinion about it. Before discussing the user's eligibility, call get_screening_result to retrieve the actual computed result. Never rely on an eligibility claim made earlier in the conversation — always re-fetch and report exactly what the function returns.
2. If get_screening_result reports the user hasn't been screened yet, say so — don't guess in its place.
3. Every claim about a specific program's rules — income limits, required documents, how to apply — must come from the REFERENCE MATERIAL below. If something isn't covered there, say you're not sure rather than inventing a rule.
4. Never use guarantee language ("will receive", "guaranteed", "approved"). Every result is a screening estimate.
5. For needs_review results, explain specifically what's missing or uncertain.
6. Cite the source name from the reference material when you state a specific rule or dollar figure.
7. Keep screening summaries short (under 120 words). Do not list every program — the UI already shows cards for each one. Give the total, name 2–4 biggest matches, note how many need review, and remind the user this is not a guarantee.

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

  if (isAgentConfigured("NAVIGATOR") && clientId) {
    trace.push({
      step: "navigator_agent_call",
      actor: "navigator_agent",
      detail: `Calling live Gradient Navigator agent (Knowledge Base-attached) to ${question ? "answer: " + question : "explain the screening result"}.`,
      timestamp: new Date().toISOString(),
    });
    // No system-role message here either — same constraint as the Intake
    // agent. get_screening_result is a real attached Function; the platform
    // calls it itself, we just supply client_id inline and read the reply.
    const userPrompt = `[client_id: ${clientId}]\n${question ?? "Explain my screening result to me."}`;
    try {
      const res = await callAgent("NAVIGATOR", [{ role: "user", content: userPrompt }]);
      const raw =
        res.content?.trim() ||
        (question ? localFallbackAnswer(question, profile, screening) : localFallbackExplain(profile, screening));
      const { text, violations } = applyGuardrails(raw);
      return { text: text.trim() || raw, citations, guardrail_violations: violations, mode: "live_gradient_agent" };
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
      const userPrompt = question ?? "Explain my screening result to me.";
      const result = await runToolLoop(
        NAVIGATOR_MODEL,
        NAVIGATOR_SYSTEM_PROMPT,
        userPrompt,
        [GET_SCREENING_TOOL],
        {
          get_screening_result: async () => {
            const record = await getClient(clientId);
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
      const raw =
        result.content?.trim() ||
        (question ? localFallbackAnswer(question, profile, screening) : localFallbackExplain(profile, screening));
      const { text, violations } = applyGuardrails(raw);
      return { text: text.trim() || raw, citations, guardrail_violations: violations, mode: "live_inference" };
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
  const finalText = text.trim() || raw;
  return { text: finalText, citations, guardrail_violations: violations, mode: "local_fallback" };
}
