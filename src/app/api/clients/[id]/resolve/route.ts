import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import {
  buildResolutionDelta,
  buildResolutionQuestion,
  nextResolvableTarget,
  runResolutionAnswerTurn,
} from "@/lib/gradient/resolutionAgent";
import { getProgram } from "@/lib/engine";
import { appendChatMessages, getTrace, screenAndStore, setTrace } from "@/lib/store";
import type { ChatMessage, TraceStep } from "@/lib/types";

// The needs-review resolution loop. Two shapes of POST:
//   { program_id, lang }            — start: returns the targeted opening
//                                     question derived from the engine's
//                                     review_triggers / missing_fields.
//   { program_id, message, lang }   — answer: extracts facts from the answer,
//                                     re-runs the deterministic engine, and
//                                     returns the before/after delta plus the
//                                     next question if still unresolved.
// The loop itself is stateless server-side — program_id travels with every
// request, so canceling is purely a client-side affair.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  const record = owned.record;

  const body = await request.json().catch(() => ({}));
  const programId: string = body.program_id ?? "";
  const message: string = typeof body.message === "string" ? body.message : "";
  const lang: "en" | "es" = body.lang === "es" ? "es" : "en";

  const program = getProgram(programId);
  if (!program) {
    return NextResponse.json({ error: "Unknown program_id" }, { status: 400 });
  }
  if (!record.last_screening) {
    return NextResponse.json({ error: "No screening to resolve yet" }, { status: 400 });
  }
  const target = record.last_screening.results.find((r) => r.program_id === programId);
  if (!target) {
    return NextResponse.json({ error: "Program not in the latest screening" }, { status: 400 });
  }

  const trace: TraceStep[] = await getTrace(id);

  // --- Start turn: no message yet, just the targeted opening question. ---
  if (!message.trim()) {
    const opening =
      target.status === "needs_review"
        ? buildResolutionQuestion(target, lang)
        : {
            resolvable: false,
            text:
              lang === "es"
                ? `${program.name} ya no necesita revisión.`
                : `${program.name} doesn't currently need review.`,
          };
    trace.push({
      step: "resolution_started",
      actor: "navigator_agent",
      detail: `Resolution loop opened for ${program.name} (trigger: ${target.review_triggers.join(", ") || "none"}). Question derived deterministically from the engine's review output.`,
      timestamp: new Date().toISOString(),
    });
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: opening.text,
      timestamp: new Date().toISOString(),
    };
    await appendChatMessages(id, [assistantMessage]);
    await setTrace(id, trace);
    return NextResponse.json({
      assistant_reply: opening.text,
      resolvable: opening.resolvable,
      trace,
    });
  }

  // --- Answer turn: extract → re-screen → deterministic delta. ---
  const userMessage: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
  const { mode } = await runResolutionAnswerTurn(message, id, record.profile, target, trace);

  trace.push({
    step: "function_call_check_eligibility",
    actor: "function",
    detail: `Resolution answer captured — re-running the deterministic engine for ${program.name}.`,
    timestamp: new Date().toISOString(),
  });
  const updated = await screenAndStore(id);
  if (!updated || !updated.last_screening) {
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }

  const delta = buildResolutionDelta(record.last_screening, updated.last_screening, programId, lang);
  trace.push({
    step: "resolution_delta",
    actor: "function",
    detail: `Engine re-ran: ${updated.last_screening.eligible_count} likely-eligible, ${updated.last_screening.needs_review_count} needs-review. ${program.name} ${delta.resolved ? "resolved" : "still needs review"}.`,
    timestamp: new Date().toISOString(),
  });

  // Chain the loop: once this program is settled (or can't be settled),
  // move straight to the next resolvable needs-review card so one "resolve"
  // session walks every amber card without re-clicking.
  let replyText = delta.text;
  let resolvingProgramId: string | null = delta.continueResolving ? programId : null;
  if (!resolvingProgramId) {
    const next = nextResolvableTarget(updated.last_screening, programId, lang);
    if (next) {
      const lead = lang === "es" ? "Siguiente:" : "Next up:";
      replyText += `\n\n${lead} ${buildResolutionQuestion(next, lang).text}`;
      resolvingProgramId = next.program_id;
    }
  }

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: replyText,
    timestamp: new Date().toISOString(),
  };
  await appendChatMessages(id, [userMessage, assistantMessage]);
  await setTrace(id, trace);

  return NextResponse.json({
    assistant_reply: replyText,
    resolved: delta.resolved,
    resolving_program_id: resolvingProgramId,
    mode,
    profile: updated.profile,
    screening: updated.last_screening,
    trace,
  });
}
