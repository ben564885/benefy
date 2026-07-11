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

// After a screening exists, only route back to Intake when the user is
// clearly correcting or adding profile facts — everything else goes to Navigator.
const INTAKE_UPDATE_SIGNALS = [
  /\$\d/,
  /\bhousehold of\b/,
  /\bi live (in|outside)\b/,
  /\bmy income\b/,
  /\bactually\b/,
  /\bcorrect\b/,
  /\bupdate my\b/,
  /\bi(?:'m| am) a (u\.?s\.? )?citizen\b/,
  /\bpermanent resident\b/,
  /\bveteran\b|\bmilitary\b/,
  /\bsenior\b|\bdisabilit/,
];

// "Ask me the rest", "resolve the unresolved", "finish the questions" —
// requests to work through the needs-review items.
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
  if (hasExistingScreening && INTAKE_UPDATE_SIGNALS.some((p) => p.test(lower))) {
    return "intake";
  }
  if (hasExistingScreening && NAVIGATOR_SIGNALS.some((p) => p.test(lower))) {
    return "navigator";
  }
  if (hasExistingScreening) {
    return "navigator";
  }
  return "intake";
}
