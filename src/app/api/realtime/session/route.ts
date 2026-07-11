import { NextResponse } from "next/server";
import { INTAKE_SYSTEM_PROMPT } from "@/lib/gradient/intakeAgent";
import { UPDATE_PROFILE_TOOL } from "@/lib/gradient/tools";

// Mints a short-lived OpenAI Realtime client secret so the browser can open
// a WebRTC session directly with OpenAI — this route is the only place
// OPENAI_API_KEY is ever read; the browser only ever sees the ephemeral key
// this returns (expires in minutes, scoped to this one session's config).
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";

// Same shape as update_client_profile in lib/gradient/tools.ts, minus the
// wrapping the Gradient/DO tool-calling format uses — Realtime tools are
// flat { type, name, description, parameters }, not { type, function: {...} }.
const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: UPDATE_PROFILE_TOOL.function.name,
    description: UPDATE_PROFILE_TOOL.function.description,
    parameters: UPDATE_PROFILE_TOOL.function.parameters,
  },
  {
    type: "function" as const,
    name: "check_eligibility",
    description:
      "Runs the deterministic benefits eligibility engine against this client's stored profile and returns a per-program screening result (likely_eligible / likely_ineligible / needs_review). This is the ONLY source of truth for eligibility — never state a client is or isn't eligible without calling this function first.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured — voice intake is unavailable. Use text chat instead." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const clientId: string | undefined = body.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        audio: { output: { voice: REALTIME_VOICE } },
        instructions: `${INTAKE_SYSTEM_PROMPT}\n\nYou are on a live voice call, not text chat — keep replies short and conversational. The client_id for this session is "${clientId}"; you never need to ask for it or say it out loud.`,
        tools: REALTIME_TOOLS,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenAI Realtime session creation failed: ${res.status} ${text}` },
      { status: 502 },
    );
  }

  const data = await res.json();
  return NextResponse.json({ client_secret: data.value, expires_at: data.expires_at });
}
