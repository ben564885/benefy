import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { executeCheckEligibility } from "@/lib/gradient/tools";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
import { getTrace, screenAndStore, setTrace } from "@/lib/store";
import type { TraceStep } from "@/lib/types";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  const record = owned.record;

  const trace: TraceStep[] = await getTrace(id);
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
  const updated = await screenAndStore(id);
  if (!updated || !updated.last_screening) {
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }

  trace.push({
    step: "function_result",
    actor: "function",
    detail: `Engine returned ${directResult.eligible_count} likely-eligible, ${directResult.needs_review_count} needs-review, ${directResult.ineligible_count} likely-ineligible.`,
    timestamp: new Date().toISOString(),
  });

  const explanation = await explainScreening(updated.profile, updated.last_screening, null, trace, id);
  trace.push({
    step: "navigator_explanation_ready",
    actor: "navigator_agent",
    detail: "Navigator agent explained the function's result to the user; it did not compute eligibility itself.",
    timestamp: new Date().toISOString(),
  });
  await setTrace(id, trace);

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
