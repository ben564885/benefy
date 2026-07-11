import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { executeCheckEligibility } from "@/lib/gradient/tools";
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

  await setTrace(id, trace);

  // The engine result returns immediately — the Navigator's plain-language
  // explanation can take many seconds on the live Agent Platform, so the
  // client fetches it separately via POST /explain and fills it in when it
  // lands. The dollar reveal must never wait on a language model.
  return NextResponse.json({
    client: updated,
    screening: updated.last_screening,
    explanation: null,
    citations: [],
    mode: null,
    trace,
  });
}
