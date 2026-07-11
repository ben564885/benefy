// Thin client for DigitalOcean Gradient AI's OpenAI-compatible endpoints.
//
// Gradient AI Agents and Serverless Inference both expose an OpenAI Chat
// Completions-shaped API (POST {endpoint}/api/v1/chat/completions for agents,
// or the shared inference endpoint for a raw model). This wrapper is
// intentionally provider-agnostic in shape so swapping in real DO endpoint
// URLs/keys via env vars is the only thing required to go from "local
// fallback" to "live Gradient agent" — no code changes needed elsewhere.
//
// Docs: https://docs.digitalocean.com/products/gradient-ai-platform/

export interface GradientToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GradientChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface GradientToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GradientChatResponse {
  content: string | null;
  tool_calls: GradientToolCall[] | null;
  raw: unknown;
}

interface AgentEndpointConfig {
  endpoint: string | undefined;
  accessKey: string | undefined;
}

function readAgentConfig(prefix: "INTAKE" | "NAVIGATOR"): AgentEndpointConfig {
  return {
    endpoint: process.env[`GRADIENT_${prefix}_AGENT_ENDPOINT`],
    accessKey: process.env[`GRADIENT_${prefix}_AGENT_ACCESS_KEY`],
  };
}

export function isAgentConfigured(prefix: "INTAKE" | "NAVIGATOR"): boolean {
  const { endpoint, accessKey } = readAgentConfig(prefix);
  return Boolean(endpoint && accessKey);
}

/**
 * Calls a live Gradient AI agent. Throws if the agent isn't configured —
 * callers are expected to check `isAgentConfigured` first and fall back to
 * the local heuristic implementation (see intakeAgent.ts / navigatorAgent.ts)
 * when no DigitalOcean credentials are present in this environment.
 */
export async function callAgent(
  prefix: "INTAKE" | "NAVIGATOR",
  messages: GradientChatMessage[],
  tools?: GradientToolDefinition[],
): Promise<GradientChatResponse> {
  const { endpoint, accessKey } = readAgentConfig(prefix);
  if (!endpoint || !accessKey) {
    throw new Error(
      `Gradient ${prefix} agent is not configured. Set GRADIENT_${prefix}_AGENT_ENDPOINT and GRADIENT_${prefix}_AGENT_ACCESS_KEY.`,
    );
  }

  // Live agent calls have been observed taking 30–80s on this platform.
  // Without a deadline they block the whole turn; with one, the caller's
  // tier-degradation (Agent Platform → Serverless Inference → local) kicks
  // in fast enough to keep the UI responsive.
  const timeoutMs = Number(process.env.GRADIENT_AGENT_TIMEOUT_MS) || 15_000;
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessKey}`,
    },
    body: JSON.stringify({
      messages,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gradient ${prefix} agent request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls ?? null,
    raw: data,
  };
}
