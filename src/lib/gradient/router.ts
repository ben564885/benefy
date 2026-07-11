// Multi-agent router (spec §7.1): decides whether a caseworker's chat turn
// is "capture/update client info" (→ Intake Agent) or "explain / what's
// next / what documents" (→ Navigator Agent). Gradient's Agent Routing does
// this at the platform level when both agents are deployed there; this is
// the same policy expressed as backend orchestration logic so it works
// identically in local-fallback mode.

export type AgentTarget = "intake" | "navigator";

const NAVIGATOR_SIGNALS = [
  /\bwhy\b/,
  /\bwhat (documents?|paperwork)\b/,
  /\bhow (do|does|can)\b.*\bapply\b/,
  /\bexplain\b/,
  /\bwhat'?s next\b/,
  /\bwhat does .* mean\b/,
  /\bneeds? review\b.*\bwhy\b/,
  /\bwhich programs?\b/,
];

export function routeTurn(userText: string, hasExistingScreening: boolean): AgentTarget {
  const lower = userText.toLowerCase();
  if (hasExistingScreening && NAVIGATOR_SIGNALS.some((p) => p.test(lower))) {
    return "navigator";
  }
  return "intake";
}
