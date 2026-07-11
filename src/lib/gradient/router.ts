// Multi-agent router (spec §7.1): decides whether a user's chat turn
// is "capture/update client info" (→ Intake Agent) or "explain / what's
// next / what documents" (→ Navigator Agent). Gradient's Agent Routing does
// this at the platform level when both agents are deployed there; this is
// the same policy expressed as backend orchestration logic so it works
// identically in local-fallback mode.

export type AgentTarget = "intake" | "navigator";

// After a screening exists, only route back to Intake when the user is
// clearly correcting or adding profile facts — everything else (questions
// about results, programs, documents, or how Benefy works) goes to Navigator.
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

export function routeTurn(userText: string, hasExistingScreening: boolean): AgentTarget {
  if (hasExistingScreening) {
    const lower = userText.toLowerCase();
    if (INTAKE_UPDATE_SIGNALS.some((p) => p.test(lower))) {
      return "intake";
    }
    return "navigator";
  }
  return "intake";
}
