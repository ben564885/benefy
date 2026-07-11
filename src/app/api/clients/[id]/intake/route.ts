import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { runIntakeTurn } from "@/lib/gradient/intakeAgent";
import { explainScreening } from "@/lib/gradient/navigatorAgent";
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
  if (!message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trace: TraceStep[] = await getTrace(id);
  const target = routeTurn(message, record.last_screening != null);
  trace.push({
    step: "router_decision",
    actor: "router",
    detail: `Routed turn to the ${target === "intake" ? "Intake" : "Navigator"} agent.`,
    timestamp: new Date().toISOString(),
  });

  const userMessage: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };

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
