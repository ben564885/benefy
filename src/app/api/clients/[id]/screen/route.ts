import { NextResponse } from "next/server";
import { executeCheckEligibility } from "@/lib/gradient/tools";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
import { getClient, getTrace, screenAndStore, setTrace } from "@/lib/store";
import type { TraceStep } from "@/lib/types";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = getClient(id);
  if (!record) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const trace: TraceStep[] = getTrace(id);
  trace.push({
    step: "function_call_check_eligibility",
    actor: "function",
    detail:
      "Intake agent invoked the check_eligibility tool. The deterministic rules engine (not the model) computed the result below.",
    timestamp: new Date().toISOString(),
  });

  // Run the deterministic engine directly (this IS what the check_eligibility
  // Gradient tool calls under the hood — see lib/gradient/tools.ts).
  const directResult = executeCheckEligibility(record.profile);
  const updated = screenAndStore(id);
  if (!updated || !updated.last_screening) {
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }

  trace.push({
    step: "function_result",
    actor: "function",
    detail: `Engine returned ${directResult.eligible_count} likely-eligible, ${directResult.needs_review_count} needs-review, ${directResult.ineligible_count} likely-ineligible.`,
    timestamp: new Date().toISOString(),
  });

  const explanation = await explainScreening(updated.profile, updated.last_screening, null, trace);
  trace.push({
    step: "navigator_explanation_ready",
    actor: "navigator_agent",
    detail: "Navigator agent explained the function's result to the caseworker; it did not compute eligibility itself.",
    timestamp: new Date().toISOString(),
  });
  setTrace(id, trace);

  return NextResponse.json({
    client: updated,
    screening: updated.last_screening,
    explanation: explanation.text,
    citations: explanation.citations,
    guardrail_violations: explanation.guardrail_violations,
    mode: explanation.mode,
    trace,
  });
}
