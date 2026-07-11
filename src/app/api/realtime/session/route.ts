import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { INTAKE_SYSTEM_PROMPT } from "@/lib/gradient/intakeAgent";
import { UPDATE_PROFILE_TOOL } from "@/lib/gradient/tools";
import { getChatHistory } from "@/lib/store";
import type { ChatMessage, ClientRecord } from "@/lib/types";

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

// Voice sessions don't start from scratch: if the person already answered
// questions in text chat (or a previous call), the Realtime model gets that
// state up front so it never re-asks for facts it already has. Instructions
// are fixed at session-creation time, so this is a snapshot as of connect.
const MAX_TRANSCRIPT_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 400;

function buildSessionContext(record: ClientRecord, chatHistory: ChatMessage[]): string {
  const parts: string[] = [];

  const profileEntries = Object.entries(record.profile).filter(([key, value]) => {
    if (key === "client_id" || key === "field_status" || key === "last_screened_at") return false;
    if (value == null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
  if (profileEntries.length > 0) {
    parts.push(
      `Known profile so far (already collected — do NOT re-ask for any of these):\n${profileEntries
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n")}`,
    );
  }

  const missing = (
    [
      ["household_size", record.profile.household_size != null],
      [
        "income (monthly or annual gross)",
        record.profile.monthly_income_gross != null || record.profile.annual_income_gross != null,
      ],
      ["sf_resident", record.profile.sf_resident != null],
      ["immigration_status", record.profile.immigration_status != null],
    ] as const
  )
    .filter(([, known]) => !known)
    .map(([label]) => label);
  parts.push(
    missing.length > 0
      ? `Still needed before a screening can run: ${missing.join(", ")}. Focus the conversation on these.`
      : "All required fields are already captured.",
  );

  if (record.last_screening) {
    parts.push(
      "An eligibility screening has already been run for this client. If they ask about results, call check_eligibility to get the current result rather than recalling it from memory.",
    );
  }

  const recent = chatHistory.slice(-MAX_TRANSCRIPT_MESSAGES);
  if (recent.length > 0) {
    const transcript = recent
      .map((m) => {
        const content = m.content.length > MAX_MESSAGE_CHARS ? `${m.content.slice(0, MAX_MESSAGE_CHARS)}…` : m.content;
        return `${m.role === "user" ? "Client" : "Assistant"}: ${content}`;
      })
      .join("\n");
    parts.push(
      `Earlier conversation with this client (from text chat — you were the assistant). Continue from where it left off; do not re-ask anything already answered here, and don't greet them like a stranger:\n${transcript}`,
    );
  }

  return parts.join("\n\n");
}

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
  const lang: "en" | "es" = body.lang === "es" ? "es" : "en";

  const owned = await requireOwnedClient(clientId);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }

  const chatHistory = await getChatHistory(clientId).catch(() => [] as ChatMessage[]);
  const sessionContext = buildSessionContext(owned.record, chatHistory);

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
        instructions: `${INTAKE_SYSTEM_PROMPT}\n\nYou are on a live voice call, not text chat — keep replies short and conversational. The client_id for this session is "${clientId}"; you never need to ask for it or say it out loud.\n\n${sessionContext}${
          lang === "es"
            ? "\n\nThis caller selected Spanish in the app. Conduct the ENTIRE call in Spanish — greet them, ask every question, and explain everything in natural, warm, plain-language Spanish. Only switch languages if the caller clearly asks you to."
            : ""
        }`,
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
