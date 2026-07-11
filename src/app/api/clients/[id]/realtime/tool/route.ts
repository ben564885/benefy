import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { getTrace, screenAndStore, setTrace, updateProfile } from "@/lib/store";
import type { ClientProfile, TraceStep } from "@/lib/types";

// The browser calls this whenever the OpenAI Realtime voice session emits a
// function call (update_client_profile / check_eligibility) — see
// RealtimeVoiceIntake.tsx.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }

  const body = await request.json().catch(() => ({}));
  const name: string | undefined = body.name;
  const args: Record<string, unknown> = body.arguments ?? {};

  const trace: TraceStep[] = await getTrace(id);

  if (name === "update_client_profile") {
    const updated = await updateProfile(id, args as Partial<ClientProfile>);
    trace.push({
      step: "tool_call_update_client_profile",
      actor: "function",
      detail: `Voice intake called update_client_profile with: ${Object.keys(args).join(", ") || "no fields"}.`,
      timestamp: new Date().toISOString(),
    });
    await setTrace(id, trace);
    return NextResponse.json({ ok: true, profile: updated?.profile });
  }

  if (name === "check_eligibility") {
    const updated = await screenAndStore(id);
    if (!updated || !updated.last_screening) {
      return NextResponse.json({ error: "Screening failed" }, { status: 500 });
    }
    trace.push({
      step: "tool_call_check_eligibility",
      actor: "function",
      detail: `Voice intake called check_eligibility. Deterministic engine returned ${updated.last_screening.eligible_count} likely-eligible, ${updated.last_screening.needs_review_count} needs-review, ${updated.last_screening.ineligible_count} likely-ineligible.`,
      timestamp: new Date().toISOString(),
    });
    await setTrace(id, trace);
    return NextResponse.json(updated.last_screening);
  }

  return NextResponse.json({ error: `Unknown tool "${name}"` }, { status: 400 });
}
