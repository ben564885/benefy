// Navigator Agent (spec §7.1, §7.3): explains screening results in plain
// English and answers caseworker follow-ups, grounded in the official
// program documents. In production this agent is attached to a Gradient
// Knowledge Base indexing the real CalFresh/CARE/SFMTA source documents, so
// its citations come from retrieval, not memory.
//
// Without live GRADIENT_NAVIGATOR_AGENT_* credentials, this falls back to a
// template generator that is *still* grounded — it pulls every fact and
// citation from the same programs.json config the KB would be built from
// (see each program's `_source` / `form_url` / `required_documents`), so
// the fallback can't hallucinate a rule that isn't in the config either.

import { callAgent, isAgentConfigured } from "@/lib/gradient/client";
import { applyGuardrails } from "@/lib/gradient/guardrails";
import { getAllPrograms, getProgram } from "@/lib/engine";
import type { ClientProfile, EligibilityResult, ScreeningResult, TraceStep } from "@/lib/types";

export interface NavigatorResponse {
  text: string;
  citations: { program_id: string; source: string; url: string }[];
  guardrail_violations: string[];
  mode: "live_gradient_agent" | "local_fallback";
}

function citationFor(programId: string) {
  const program = getProgram(programId);
  if (!program) return null;
  const source =
    program.value_estimate.method === "fixed"
      ? (program.value_estimate as { _source?: string })._source
      : (program.value_estimate as { _source?: string })._source;
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

export async function explainScreening(
  profile: ClientProfile,
  screening: ScreeningResult,
  question: string | null,
  trace: TraceStep[],
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
        detail: `Live agent call failed (${(err as Error).message}); falling back to local grounded template.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  trace.push({
    step: "navigator_local_fallback",
    actor: "navigator_agent",
    detail: "GRADIENT_NAVIGATOR_AGENT_* not configured — generating explanation from the same program config a Knowledge Base would index.",
    timestamp: new Date().toISOString(),
  });
  const raw = question
    ? localFallbackAnswer(question, profile, screening)
    : localFallbackExplain(profile, screening);
  const { text, violations } = applyGuardrails(raw);
  return { text, citations, guardrail_violations: violations, mode: "local_fallback" };
}
