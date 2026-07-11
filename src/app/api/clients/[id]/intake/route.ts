import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { runGuidedIntakeTurn, runIntakeTurn } from "@/lib/gradient/intakeAgent";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
import { buildResolveAllOpening } from "@/lib/gradient/resolutionAgent";
import { routeTurn } from "@/lib/gradient/router";
import { appendChatMessages, getTrace, setTrace, updateProfile } from "@/lib/store";
import type { ChatMessage, TraceStep } from "@/lib/types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  const record = owned.record;

  const body = await request.json().catch(() => ({}));
  const message: string = body.message ?? "";
  const guided: boolean = body.guided === true;
  const lang: "en" | "es" = body.lang === "es" ? "es" : "en";
  // Guided chips send a canonical English `message` for extraction plus a
  // localized `display` string — the display is what the user actually
  // clicked, so that's what belongs in their chat history.
  const display: string = typeof body.display === "string" && body.display.trim() ? body.display : message;
  if (!message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trace: TraceStep[] = await getTrace(id);

  // Guided quick-reply chips / income stepper: skip the router and any
  // model call entirely. See runGuidedIntakeTurn for why.
  if (guided) {
    trace.push({
      step: "intake_guided_fast_path",
      actor: "intake_agent",
      detail: "Structured quick-reply answer — resolved locally with no model call.",
      timestamp: new Date().toISOString(),
    });
    const userMessage: ChatMessage = { role: "user", content: display, timestamp: new Date().toISOString() };
    const { patch, assistant_reply, ready_to_screen } = runGuidedIntakeTurn(message, record.profile, lang);
    const updated = await updateProfile(id, patch);
    const messages: ChatMessage[] = [userMessage];
    if (assistant_reply) {
      messages.push({ role: "assistant", content: assistant_reply, timestamp: new Date().toISOString() });
    }
    await appendChatMessages(id, messages);
    await setTrace(id, trace);
    return NextResponse.json({
      target: "intake",
      assistant_reply,
      ready_to_screen,
      mode: "local_fallback",
      profile: updated?.profile ?? record.profile,
      trace,
    });
  }

  const target = routeTurn(
    message,
    record.last_screening != null,
    record.last_screening?.needs_review_count ?? 0,
  );
  trace.push({
    step: "router_decision",
    actor: "router",
    detail:
      target === "resolve"
        ? "Resolve request detected — entering the needs-review resolution loop directly (no model call)."
        : `Routed turn to the ${target === "intake" ? "Intake" : "Navigator"} agent.`,
    timestamp: new Date().toISOString(),
  });

  const userMessage: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };

  // "Ask me the questions" / "resolve the unresolved": answer instantly with
  // the first targeted question instead of round-tripping a model that would
  // only paraphrase engine output back at the user. The client flips into
  // resolution mode via resolve_target and subsequent answers hit /resolve.
  if (target === "resolve" && record.last_screening) {
    const opening = buildResolveAllOpening(record.last_screening, lang);
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: opening.text,
      timestamp: new Date().toISOString(),
    };
    await appendChatMessages(id, [userMessage, assistantMessage]);
    await setTrace(id, trace);
    return NextResponse.json({
      target,
      assistant_reply: opening.text,
      resolve_target: opening.target ? { program_id: opening.target.program_id } : null,
      mode: "local_fallback",
      profile: record.profile,
      trace,
    });
  }

  if (target === "navigator" && record.last_screening) {
    const explanation = await explainScreening(record.profile, record.last_screening, message, trace, id);
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: explanation.text,
      timestamp: new Date().toISOString(),
    };
    await appendChatMessages(id, [userMessage, assistantMessage]);
    await setTrace(id, trace);
    return NextResponse.json({
      target,
      assistant_reply: explanation.text,
      citations: explanation.citations,
      guardrail_violations: explanation.guardrail_violations,
      mode: explanation.mode,
      profile: record.profile,
      trace,
    });
  }

  const intakeResult = await runIntakeTurn(message, id, record.profile, trace);
  const updated = await updateProfile(id, intakeResult.patch);
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: intakeResult.assistant_reply,
    timestamp: new Date().toISOString(),
  };
  await appendChatMessages(id, [userMessage, assistantMessage]);
  await setTrace(id, trace);

  return NextResponse.json({
    target: "intake",
    assistant_reply: intakeResult.assistant_reply,
    ready_to_screen: intakeResult.ready_to_screen,
    mode: intakeResult.mode,
    profile: updated?.profile ?? record.profile,
    trace,
  });
}
