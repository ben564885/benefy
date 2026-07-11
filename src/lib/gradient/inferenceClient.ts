// Direct DigitalOcean Serverless Inference client with a manual tool-calling
// loop — the interim path used while the managed Agent Platform is blocked
// account-wide (both the declarative REST/console API and the newer ADK
// deployment gateway return errors independent of token/billing/region —
// see GRADIENT_SETUP.md). This hits the same OpenAI-compatible
// chat-completions endpoint and the same tool-calling wire format Agent
// Platform uses; the only difference is the tool-call loop is driven by our
// own backend instead of a DO-managed agent runtime.
//
// Anthropic/OpenAI-provider models on this endpoint require a subscription
// tier this account doesn't have (confirmed directly: 403 "not available for
// your subscription tier"). DO-hosted open-weight models work fine.

const INFERENCE_BASE_URL = "https://inference.do-ai.run/v1";

export function isInferenceConfigured(): boolean {
  return Boolean(process.env.DIGITAL_OCEAN_MODEL_ACCESS_KEY);
}

export const INTAKE_MODEL = process.env.INTAKE_MODEL_ID || "llama3.3-70b-instruct";
export const NAVIGATOR_MODEL = process.env.NAVIGATOR_MODEL_ID || "llama3.3-70b-instruct";

export interface InferenceToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface InferenceToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface InferenceMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: InferenceToolCall[];
}

interface InferenceChoice {
  content: string | null;
  tool_calls: InferenceToolCall[] | null;
}

async function callInference(
  model: string,
  messages: InferenceMessage[],
  tools?: InferenceToolDefinition[],
  toolChoice?: "auto" | { type: "function"; function: { name: string } },
): Promise<InferenceChoice> {
  const key = process.env.DIGITAL_OCEAN_MODEL_ACCESS_KEY;
  if (!key) throw new Error("DIGITAL_OCEAN_MODEL_ACCESS_KEY is not configured");

  const res = await fetch(`${INFERENCE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools ? { tools, tool_choice: toolChoice ?? "auto" } : {}),
      max_completion_tokens: 800,
    }),
    signal: AbortSignal.timeout(Number(process.env.GRADIENT_INFERENCE_TIMEOUT_MS) || 30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Serverless inference request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls ?? null,
  };
}

export type ToolExecutor = (
  args: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export interface ToolLoopResult {
  content: string;
  calls: { name: string; args: Record<string, unknown>; result: unknown }[];
}

// Models on this endpoint sometimes emit tool-call arguments as stringified
// numbers/booleans (e.g. "household_size": "3") rather than native JSON
// types — coerce them so downstream code doesn't have to guess.
function coerceArgs(raw: string): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      coerced[key] = value;
      continue;
    }
    if (value === "true") coerced[key] = true;
    else if (value === "false") coerced[key] = false;
    else if (value.trim() !== "" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      coerced[key] = Number(value);
    } else {
      coerced[key] = value;
    }
  }
  return coerced;
}

export async function runToolLoop(
  model: string,
  systemPrompt: string,
  userMessage: string,
  tools: InferenceToolDefinition[],
  executors: Record<string, ToolExecutor>,
  maxIterations = 4,
  forceFirstTool?: string,
): Promise<ToolLoopResult> {
  const messages: InferenceMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  const calls: ToolLoopResult["calls"] = [];

  for (let i = 0; i < maxIterations; i++) {
    const toolChoice: Parameters<typeof callInference>[3] =
      i === 0 && forceFirstTool ? { type: "function", function: { name: forceFirstTool } } : "auto";
    const choice = await callInference(model, messages, tools, toolChoice);

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: choice.content ?? "",
        tool_calls: choice.tool_calls,
      });

      for (const call of choice.tool_calls) {
        const executor = executors[call.function.name];
        const args = coerceArgs(call.function.arguments);
        let result: unknown;
        try {
          result = executor ? await executor(args) : { error: `no executor for ${call.function.name}` };
        } catch (err) {
          result = { error: (err as Error).message };
        }
        calls.push({ name: call.function.name, args, result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return { content: choice.content ?? "", calls };
  }

  return { content: "I wasn't able to finish processing that — please try rephrasing.", calls };
}
