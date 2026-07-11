import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
import { getTrace, setTrace } from "@/lib/store";
import type { TraceStep } from "@/lib/types";

// Generates the Navigator's plain-language explanation for the client's
// stored screening result. Split out of POST /screen so the deterministic
// engine result renders instantly and the (potentially slow) live agent
// explanation streams in after — see screen/route.ts.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  const record = owned.record;
  if (!record.last_screening) {
    return NextResponse.json({ error: "No screening to explain yet" }, { status: 400 });
  }

  const trace: TraceStep[] = await getTrace(id);
  const explanation = await explainScreening(record.profile, record.last_screening, null, trace, id);
  trace.push({
    step: "navigator_explanation_ready",
    actor: "navigator_agent",
    detail: "Navigator agent explained the function's result to the user; it did not compute eligibility itself.",
    timestamp: new Date().toISOString(),
  });
  await setTrace(id, trace);

  return NextResponse.json({
    explanation: explanation.text,
    citations: explanation.citations,
    guardrail_violations: explanation.guardrail_violations,
    mode: explanation.mode,
    trace,
  });
}
