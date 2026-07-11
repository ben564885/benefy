// Multi-agent router (spec §7.1): decides whether a user's chat turn
// is "capture/update client info" (→ Intake Agent) or "explain / what's
// next / what documents" (→ Navigator Agent). Gradient's Agent Routing does
// this at the platform level when both agents are deployed there; this is
// the same policy expressed as backend orchestration logic so it works
// identically in local-fallback mode.

export type AgentTarget = "intake" | "navigator" | "resolve";

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

// "Ask me the rest", "resolve the unresolved", "finish the questions" —
// requests to work through the needs-review items. These go straight into
// the deterministic resolution loop: no model call, no multi-second
// tool-loop round trip, no model paraphrasing engine output back at the
// user. Checked before navigator signals ("resolve... why is it unresolved"
// is still a resolve request).
const RESOLVE_SIGNALS = [
  /\bresolve\b/,
  /\bunresolved\b/,
  /\bneeds? review\b/,
  /\bask me\b.*\bquestions?\b/,
  /\b(finish|complete|answer)\b.*\b(questions?|screening|review)\b/,
  /\bremaining (questions?|items?|programs?)\b/,
  /\bresolver\b/,
  /\bpendientes?\b/,
];

export function routeTurn(
  userText: string,
  hasExistingScreening: boolean,
  needsReviewCount = 0,
): AgentTarget {
  const lower = userText.toLowerCase();
  if (hasExistingScreening && needsReviewCount > 0 && RESOLVE_SIGNALS.some((p) => p.test(lower))) {
    return "resolve";
  }
  if (hasExistingScreening && NAVIGATOR_SIGNALS.some((p) => p.test(lower))) {
    return "navigator";
  }
  return "intake";
}
